// /source/lib.ts
// The option parser and rate limiting middleware (Leaky Bucket)

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
} from '../types';
import {
	setDraft6Headers,
	setDraft7Headers,
	setRetryAfterHeader,
} from '../header';

import { parseOptions, handleAsyncErrors, getOptionsFromConfig } from '../parseConfig';

/**
 *
 * Create an instance of IP rate-limiting middleware for Express using the Leaky Bucket algorithm.
 *
 * @param passedOptions {Options} - Options to configure the rate limiter.
 *
 * @returns {RateLimitRequestHandler} - The middleware that rate-limits clients based on your configuration.
 *
 * @public
 */
const leakyBucket = (
	passedOptions?: Partial<Options>,
): RateLimitRequestHandler => {
	// Parse the options and add the default values for unspecified options
	const config = parseOptions(passedOptions ?? {}, 1);
	const options = getOptionsFromConfig(config);

	// Validate the store and configurations
	config.validations.creationStack(config.store);
	config.validations.unsharedStore(config.store);

	// Call the `init` method on the store, if it exists
	if (typeof config.store.init === 'function') config.store.init(options);

	// Then return the actual middleware
	const middleware = handleAsyncErrors(
		async (request: Request, response: Response, next: NextFunction) => {
			// Check if the request should be skipped
			const skip = await config.skip(request, response);
			if (skip) {
				next();
				return;
			}

			// Create an augmented request
			const augmentedRequest = request as AugmentedRequest;

			// Get a unique key for the client
			const key = await config.keyGenerator(request, response);

			// Fetch the current bucket state from the store
			let bucketInfo: ClientRateLimitInfo | undefined;
			try {
				bucketInfo = await config.store.get(key);
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

			// Initialize or update the bucket state
			const now = Date.now();
			const leakRate = options.leakRate; // Number of requests that leak per ms
			const capacity = options.limit; // Max bucket size
			let used = bucketInfo?.used || 0;
			const lastUpdated = bucketInfo?.lastUpdated || now;

			// Calculate the leaked tokens since last update
			const elapsedTime = now - lastUpdated;
			const leakedTokens = Math.floor(elapsedTime * leakRate);
			used = Math.max(0, used - leakedTokens);

			// Update the bucket info
			if (used < capacity) {
				used += 1; // Add one request to the bucket
				await config.store.set(key, { used, lastUpdated: now });
			} else {
				// If the bucket overflows, reject the request
				if (config.standardHeaders) {
					setRetryAfterHeader(response, { limit: capacity, remaining: 0, resetTime: new Date(lastUpdated + 1 / leakRate) }, options.windowMs);
				}
				config.handler(request, response, next, options);
				return;
			}

			// Define the rate limit info for the client.
			const info: RateLimitInfo = {
				limit: capacity,
				used,
				remaining: Math.max(capacity - used, 0),
				resetTime: new Date(now + 1 / leakRate),
			};

			// Set the rate limit information on the augmented request object
			augmentedRequest[config.requestPropertyName] = info;

			// Set the standardized `RateLimit-*` headers on the response object if enabled.
			if (config.standardHeaders && !response.headersSent) {
				if (config.standardHeaders === 'draft-6') {
					setDraft6Headers(response, info, config.windowMs);
				} else if (config.standardHeaders === 'draft-7') {
					config.validations.headersResetTime(info.resetTime);
					setDraft7Headers(response, info, config.windowMs);
				}
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
export default leakyBucket;
