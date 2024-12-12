import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type {
    Options,
    AugmentedRequest,
    RateLimitRequestHandler,
    Store,
    ClientRateLimitInfo,
    ValueDeterminingMiddleware,
    RateLimitExceededEventHandler,
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
import  MemoryFixedWindowStore  from './fixed-window/memory-fw';
import  MemoryTokenBucketStore  from './token-bucket/memory';

type Configuration = {
    windowMs: number;
    limit: number | ValueDeterminingMiddleware<number>;
    message: any | ValueDeterminingMiddleware<any>;
    statusCode: number;
    standardHeaders: false | DraftHeadersVersion;
    requestPropertyName: string;
    skipFailedRequests: boolean;
    skipSuccessfulRequests: boolean;
    keyGenerator: ValueDeterminingMiddleware<string>;
    handler: RateLimitExceededEventHandler;
    skip: ValueDeterminingMiddleware<boolean>;
    requestWasSuccessful: ValueDeterminingMiddleware<boolean>;
    store: Store;
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
const getOptionsFromConfig = (config: Configuration): Options => {
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
    passedOptions: Partial<Options>,
): Partial<Options> => {
    const omittedOptions: Partial<Options> = {};

    for (const k of Object.keys(passedOptions)) {
        const key = k as keyof Options;

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
    passedOptions: Partial<Options>,
    algorithmType: number,
): Configuration => {
    // Passing undefined should be equivalent to not passing an option at all, so we'll
    // omit all fields where their value is undefined.
    const notUndefinedOptions: Partial<Options> =
        omitUndefinedOptions(passedOptions);

    // Create the validator before even parsing the rest of the options.
    const validations = getValidations(notUndefinedOptions?.validate ?? true);
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

    const defaultStore =
        algorithmType === 0
            ? new MemoryFixedWindowStore()
            : new MemoryTokenBucketStore();

    const store = notUndefinedOptions.store || defaultStore;

    // See ./types.ts#Options for a detailed description of the options and their
    // defaults.
    const config: Configuration = {
        windowMs: 60 * 1000,
        limit: 5, // `max` is deprecated, but support it anyways.
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
            _optionsUsed: Options,
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
        store,
        // Print an error to the console if a few known misconfigurations are detected.
        validations,
    };

    // Ensure that the store passed implements the `Store` interface
    if (
        typeof config.store.increment !== 'function' ||
        typeof config.store.decrement !== 'function' ||
        typeof config.store.resetKey !== 'function' ||
        (config.store.resetAll !== undefined &&
            typeof config.store.resetAll !== 'function') ||
        (config.store.init !== undefined && typeof config.store.init !== 'function')
    ) {
        throw new TypeError(
            'An invalid store was passed. Please ensure that the store is a class that implements the `Store` interface.',
        );
    }

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
