// /source/lib.ts
// The option parser and rate limiting middleware

import type { Request, Response, NextFunction, RequestHandler } from 'express'
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
} from '../types'
import {
	setDraft6Headers,
	setDraft7Headers,
	setRetryAfterHeader,
} from '../header'
import { parseOptions, handleAsyncErrors, getOptionsFromConfig } from '../parseConfig'

/**
 *
 * Create an instance of IP rate-limiting middleware for Express.
 *
 * @param passedOptions {Options} - Options to configure the rate limiter.
 *
 * @returns {RateLimitRequestHandler} - The middleware that rate-limits clients based on your configuration.
 *
 * @public
 */
const FixedWindow = (
	passedOptions?: Partial<Options>,
): RateLimitRequestHandler => {
	// Parse the options and add the default values for unspecified options
	const config = parseOptions(passedOptions ?? {}, 0)
	const options = getOptionsFromConfig(config)

	// The limiter shouldn't be created in response to a request (usually)
	config.validations.creationStack(config.store)
	// The store instance shouldn't be shared across multiple limiters
	config.validations.unsharedStore(config.store)

	// Call the `init` method on the store, if it exists
	if (typeof config.store.init === 'function') config.store.init(options)

	// Then return the actual middleware
	const middleware = handleAsyncErrors(
		async (request: Request, response: Response, next: NextFunction) => {
			// First check if we should skip the request
			const skip = await config.skip(request, response)
			if (skip) {
				next()
				return
			}

			// Create an augmented request
			const augmentedRequest = request as AugmentedRequest

			// Get a unique key for the client
			const key = await config.keyGenerator(request, response)

			// Increment the client's hit counter in the store.
			let totalHits = 0
			let resetTime: Date | undefined
			try {
				const { totalHits: hits, resetTime: windowResetTime } =
					await config.store.increment(key)

				totalHits = hits
				resetTime = windowResetTime
			} catch (error) {
				if (config.passOnStoreError) {
					console.error(
						'express-rate-limit: error from store, allowing request without rate-limiting.',
						error,
					)
					next()
					return
				}

				throw error
			}

			// Validate total hits
			config.validations.positiveHits(totalHits)

			// Get the limit (max number of hits) for each client
			const retrieveLimit =
				typeof config.limit === 'function'
					? config.limit(request, response)
					: config.limit
			const limit = await retrieveLimit
			config.validations.limit(limit)

			// Define the rate limit info for the client
			const info: RateLimitInfo = {
				limit,
				used: totalHits,
				remaining: Math.max(limit - totalHits, 0),
				resetTime,
			}

			// Attach rate limit information to the request
			Object.defineProperty(info, 'current', {
				configurable: false,
				enumerable: false,
				value: totalHits,
			})
			augmentedRequest[config.requestPropertyName] = info

			// Set standardized rate-limiting headers
			if (config.standardHeaders && !response.headersSent) {
				if (config.standardHeaders === 'draft-6') {
					setDraft6Headers(response, info, config.windowMs)
				} else if (config.standardHeaders === 'draft-7') {
					config.validations.headersResetTime(info.resetTime)
					setDraft7Headers(response, info, config.windowMs)
				}
			}

			// Disable validations after they have been applied
			config.validations.disable()

			// Handle requests exceeding the rate limit
			if (totalHits > limit) {
				if (config.standardHeaders) {
					setRetryAfterHeader(response, info, config.windowMs)
				}

				config.handler(request, response, next, options)
				return
			}

			next()
		},
	)

	// Export store functions for resetting and fetching rate limit info
	const getThrowFn = () => {
		throw new Error('The current store does not support the get/getKey method')
	}

	;(middleware as RateLimitRequestHandler).resetKey =
		config.store.resetKey.bind(config.store)
	;(middleware as RateLimitRequestHandler).getKey =
		typeof config.store.get === 'function'
			? config.store.get.bind(config.store)
			: getThrowFn

	return middleware as RateLimitRequestHandler
}

// Export it to the world!
export default FixedWindow