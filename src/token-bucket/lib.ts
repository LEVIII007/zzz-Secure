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
import { parseOptions, handleAsyncErrors, getOptionsFromConfig } from '../BucketparseConfig';

const tokenBucket = (
	passedOptions?: Partial<BucketOptions>,
): RateLimitRequestHandler => {
	const config = parseOptions(passedOptions ?? {});
	const options = getOptionsFromConfig(config);
	//validaion store ke liye likh diyo mohit tu
	// Ensure proper store validation
	config.validations.BucketcreationStack(config.store);
	config.validations.BucketunsharedStore(config.store);

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
				console.log(`Tokens remaining: ${tokensRemaining}`);
				console.log(`Reset time: ${resetTime}`);
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
			// ye validation bhi likhne hain mohit ko
			config.validations.positiveHits(tokensRemaining);
			config.validations.BucketsingleCount(request, config.store, key);

			const retrieveLimit =
				typeof config.maxTokens === 'function'
					? config.maxTokens(request, response)
					: config.maxTokens;
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
			const refillInterval = 1000 / (config.refillRate ?? 1);

			if (config.standardHeaders && !response.headersSent) {
				if (config.standardHeaders === 'draft-6') {
					setDraft6Headers(response, info, refillInterval);
				} else if (config.standardHeaders === 'draft-7') {
					config.validations.headersResetTime(info.resetTime);
					setDraft7Headers(response, info, refillInterval);
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

			if (tokensRemaining == 0) {
				if (config.standardHeaders) {
					setRetryAfterHeader(response, info, refillInterval);
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
