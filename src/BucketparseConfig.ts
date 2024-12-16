import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type {
    BucketOptions,
    AugmentedRequest,
    RateLimitRequestHandler,
    BucketStore,
    ClientRateLimitInfo,
    ValueDeterminingMiddleware,
    RateLimitExceededEventHandler1,
    DraftHeadersVersion,
    RateLimitInfo,
    EnabledValidations,

} from './types';
import {
    setDraft6Headers,
    setDraft7Headers,
    setRetryAfterHeader,
} from './header';
import { getValidations, type Validations } from './validation';
import  MemoryTokenBucketStore  from './token-bucket/memory';

type Configuration = {
    Limit: number | ValueDeterminingMiddleware<number>;
    maxTokens: number | ValueDeterminingMiddleware<number>;
	refillRate: number | undefined;   // for token bucket
    LeakRate : number | undefined;    // for leaky bucket
    message: any | ValueDeterminingMiddleware<any>;
    statusCode: number;
    standardHeaders: false | DraftHeadersVersion;
    requestPropertyName: string;
    skipFailedRequests: boolean;
    skipSuccessfulRequests: boolean;
    keyGenerator: ValueDeterminingMiddleware<string>;
    handler: RateLimitExceededEventHandler1;
    skip: ValueDeterminingMiddleware<boolean>;
    requestWasSuccessful: ValueDeterminingMiddleware<boolean>;
    store: BucketStore;
    validations: Validations;
    passOnStoreError: boolean;
};


/**
 * Converts a `Configuration` object to a valid `Options` object, in case the
 * configuration needs to be passed back to the user.
 *
 * @param config {Configuration} - The configuration object to convert.
 *
 * @returns {Partial<Options>} - The options derived from the configuration.
 */
const getOptionsFromConfig = (config: Configuration): BucketOptions => {
    const { validations, ...directlyPassableEntries } = config;
    return {
        ...directlyPassableEntries,
        validate: validations.enabled as EnabledValidations,
    };
};

/**
 * Remove any options where their value is set to undefined. This avoids overwriting defaults
 * in the case a user passes undefined instead of simply omitting the key.
 *
 * @param passedOptions {Options} - The options to omit.
 *
 * @returns {Options} - The same options, but with all undefined fields omitted.
 *
 * @private
 */
const omitUndefinedOptions = (
    passedOptions: Partial<BucketOptions>,
): Partial<BucketOptions> => {
    const omittedOptions: Partial<BucketOptions> = {};

    for (const k of Object.keys(passedOptions)) {
        const key = k as keyof BucketOptions;

        if (passedOptions[key] !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            omittedOptions[key] = passedOptions[key];
        }
    }

    return omittedOptions;
};

/**
 * Type-checks and adds the defaults for options the user has not specified.
 *
 * @param options {Options} - The options the user specifies.
 * @param algorithmType {number} - Determines the algorithm: 0 for Fixed Window, 1 for Token Bucket.
 *
 * @returns {Configuration} - A complete configuration object.
 */
const parseOptions = (
    passedOptions: Partial<BucketOptions>,
): Configuration => {
    console.log('parseOptions!!!')
    console.log(passedOptions)
    // Passing undefined should be equivalent to not passing an option at all, so we'll
    // omit all fields where their value is undefined.
    const notUndefinedOptions: Partial<BucketOptions> =
        omitUndefinedOptions(passedOptions);

    // Create the validator before even parsing the rest of the options.
    const validations = getValidations(notUndefinedOptions?.validate ?? false);
    validations.validationsConfig();

    // Warn for the deprecated options. Note that these options have been removed
    // from the type definitions in v7.
    validations.draftPolliHeaders(
        // @ts-expect-error see the note above.
        notUndefinedOptions.draft_polli_ratelimit_headers,
    );
    // @ts-expect-error see the note above.
    validations.onLimitReached(notUndefinedOptions.onLimitReached);

    // The default value for the `standardHeaders` option is `false`. If set to
    // `true`, it resolve to `draft-6`. `draft-7` (recommended) is used only if
    // explicitly set.
    let standardHeaders = notUndefinedOptions.standardHeaders ?? false;
    if (standardHeaders === true) standardHeaders = 'draft-6';

    const defaultStore = new MemoryTokenBucketStore();
        // algorithmType === 1
        //     ? new MemoryLeakyBucketStore()
        //     : new MemoryTokenBucketStore();

    console.log(defaultStore)

    const store = notUndefinedOptions.store ?? defaultStore;

    // See ./types.ts#Options for a detailed description of the options and their
    // defaults.
    const config: Configuration = {
        Limit: notUndefinedOptions.Limit ?? 100,
        maxTokens: notUndefinedOptions.maxTokens ?? 5,
        refillRate: notUndefinedOptions.refillRate ?? 1,   // for token bucket
        LeakRate : notUndefinedOptions.LeakRate ?? 2,   // for leaky bucket
        message: 'Too many requests, please try again later.',
        statusCode: 429,
        requestPropertyName: 'rateLimit',
        skipFailedRequests: false,
        skipSuccessfulRequests: false,
        requestWasSuccessful: (_request: Request, response: Response): boolean =>
            response.statusCode < 400,
        skip: (_request: Request, _response: Response): boolean => false,
        keyGenerator(request: Request, _response: Response): string {
            // Run the validation checks on the IP and headers to make sure everything
            // is working as intended.
            validations.ip(request.ip);
            validations.trustProxy(request);
            validations.xForwardedForHeader(request);

            // By default, use the IP address to rate limit users.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            return request.ip!;
        },
        async handler(
            request: Request,
            response: Response,
            _next: NextFunction,
            _optionsUsed: BucketOptions,
        ): Promise<void> {
            // Set the response status code.
            response.status(config.statusCode);
            // Call the `message` if it is a function.
            const message: unknown =
                typeof config.message === 'function'
                    ? await (config.message as ValueDeterminingMiddleware<any>)(
                            request,
                            response,
                      )
                    : config.message;

            // Send the response if writable.
            if (!response.writableEnded) {
                response.send(message);
            }
        },
        passOnStoreError: false,
        // Allow the default options to be overriden by the options passed to the middleware.
        ...notUndefinedOptions,
        // `standardHeaders` is resolved into a draft version above, use that.
        standardHeaders,
        // Note that this field is declared after the user's options are spread in,
        // so that this field doesn't get overriden with an un-promisified store!
        store : notUndefinedOptions.store ?? defaultStore,
        // Print an error to the console if a few known misconfigurations are detected.
        validations,
    };

    return config;
};

const handleAsyncErrors =
    (fn: RequestHandler): RequestHandler =>
    async (request: Request, response: Response, next: NextFunction) => {
        try {
            await Promise.resolve(fn(request, response, next)).catch(next);
        } catch (error: unknown) {
            /* istanbul ignore next */
            next(error);
        }
    };

export { parseOptions, handleAsyncErrors, getOptionsFromConfig };
