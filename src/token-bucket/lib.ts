import type { Request, Response, NextFunction } from 'express';
import type {
	BucketOptions,
	RateLimitRequestHandler,
	AugmentedRequest,
	RateLimitInfo,
} from '../types';
import {
	setDraft6Headers,
	setDraft7Headers,
	setRetryAfterHeader,
} from '../header';
import { parseOptions, handleAsyncErrors, getOptionsFromConfig } from '../parseConfig';

/**
 * Token Bucket rate-limiting middleware for Express.
 *
 * @param passedOptions {Options} - Options to configure the rate limiter.
 *
 * @returns {RateLimitRequestHandler} - The middleware to rate-limit clients.
 *
 * @public
 */
const tokenBucket = (
	passedOptions?: Partial<BucketOptions>,
): RateLimitRequestHandler => {
	const config = parseOptions(passedOptions ?? {}, 0);
	const options = getOptionsFromConfig(config);

	// Ensure proper store validation
	config.validations.creationStack(config.store);
	config.validations.unsharedStore(config.store);

	if (typeof config.store.init === 'function') config.store.init(options);

	const middleware = handleAsyncErrors(
		async (request: Request, response: Response, next: NextFunction) => {
			const skip = await config.skip(request, response);
			if (skip) {
				next();
				return;
			}

			const augmentedRequest = request as AugmentedRequest;
			const key = await config.keyGenerator(request, response);

			let tokensRemaining = 0;
			let resetTime;
			try {
				const incrementResult = await config.store.increment(key);
				tokensRemaining = incrementResult.totalHits;
				resetTime = incrementResult.resetTime;
			} catch (error) {
				if (config.passOnStoreError) {
					console.error(
						'express-rate-limit: error from store, allowing request without rate-limiting.',
						error,
					);
					next();
					return;
				}
				throw error;
			}

			config.validations.positiveHits(tokensRemaining);
			config.validations.singleCount(request, config.store, key);

			const retrieveLimit =
				typeof config.limit === 'function'
					? config.limit(request, response)
					: config.limit;
			const limit = await retrieveLimit;
			config.validations.limit(limit);

			const info: RateLimitInfo = {
				limit,
				used: tokensRemaining,
				remaining: Math.max(limit - tokensRemaining, 0),
				resetTime,
			};

			Object.defineProperty(info, 'current', {
				configurable: false,
				enumerable: false,
				value: tokensRemaining,
			});
			augmentedRequest[config.requestPropertyName] = info;

			if (config.standardHeaders && !response.headersSent) {
				if (config.standardHeaders === 'draft-6') {
					setDraft6Headers(response, info, config.windowMs);
				} else if (config.standardHeaders === 'draft-7') {
					config.validations.headersResetTime(info.resetTime);
					setDraft7Headers(response, info, config.windowMs);
				}
			}

			if (config.skipFailedRequests || config.skipSuccessfulRequests) {
				let decremented = false;
				const decrementKey = async () => {
					if (!decremented) {
						await config.store.decrement(key);
						decremented = true;
					}
				};

				if (config.skipFailedRequests) {
					response.on('finish', async () => {
						if (!(await config.requestWasSuccessful(request, response)))
							await decrementKey();
					});
					response.on('close', async () => {
						if (!response.writableEnded) await decrementKey();
					});
					response.on('error', async () => {
						await decrementKey();
					});
				}

				if (config.skipSuccessfulRequests) {
					response.on('finish', async () => {
						if (await config.requestWasSuccessful(request, response))
							await decrementKey();
					});
				}
			}

			config.validations.disable();

			if (tokensRemaining > limit) {
				if (config.standardHeaders) {
					setRetryAfterHeader(response, info, config.windowMs);
				}
				config.handler(request, response, next, options);
				return;
			}
			next();
		},
	);

	const getThrowFn = () => {
		throw new Error('The current store does not support the get/getKey method');
	};

	(middleware as RateLimitRequestHandler).resetKey =
		config.store.resetKey.bind(config.store);
	(middleware as RateLimitRequestHandler).getKey =
		typeof config.store.get === 'function'
			? config.store.get.bind(config.store)
			: getThrowFn;

	return middleware as RateLimitRequestHandler;
};

// Export it to the world!
export default tokenBucket;
