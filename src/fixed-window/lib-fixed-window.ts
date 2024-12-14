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
const fixedWindow = (
	passedOptions?: Partial<Options>
): RateLimitRequestHandler => {
	console.log('fixedWindow!!!')
	// Parse the options and add the default values for unspecified options
	const config = parseOptions(passedOptions ?? {})
	const options = getOptionsFromConfig(config)

	console.log(options)

	// The limiter shouldn't be created in response to a request (usually)
	// config.validations.creationStack(config.store)
	// The store instance shouldn't be shared across multiple limiters
	// config.validations.unsharedStore(config.store)

	// Call the `init` method on the store, if it exists
	if (typeof config.store.init === 'function') config.store.init(options)

	// Then return the actual middleware
	const middleware = handleAsyncErrors(
		async (request: Request, response: Response, next: NextFunction) => {
			console.log('middleware!!!')
			// First check if we should skip the request
			const skip = await config.skip(request, response)
			if (skip) {
				console.log('skip!!!')
				next()
				return
			}


			// Create an augmented request
			const augmentedRequest = request as AugmentedRequest

			// Get a unique key for the client
			const key = await config.keyGenerator(request, response)

			console.log(key)

			// Increment the client's hit counter by one.
			let totalHits = 0
			let resetTime
			try {
				const incrementResult = await config.store.increment(key)
				console.log(incrementResult)
				totalHits = incrementResult.totalHits
				resetTime = incrementResult.resetTime
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

			// Make sure that -
			// - the hit count is incremented only by one.
			// - the returned hit count is a positive integer.
			config.validations.positiveHits(totalHits)
			config.validations.singleCount(request, config.store, key)

			// Get the limit (max number of hits) for each client.
			const retrieveLimit =
				typeof config.limit === 'function'
					? config.limit(request, response)
					: config.limit
			const limit = await retrieveLimit
			config.validations.limit(limit)

			// Define the rate limit info for the client.
			const info: RateLimitInfo = {
				limit,
				used: totalHits,
				remaining: Math.max(limit - totalHits, 0),
				resetTime,
			}

			// Set the `current` property on the object, but hide it from iteration
			// and `JSON.stringify`. See the `./types#RateLimitInfo` for details.
			Object.defineProperty(info, 'current', {
				configurable: false,
				enumerable: false,
				value: totalHits,
			})

			// Set the rate limit information on the augmented request object
			augmentedRequest[config.requestPropertyName] = info

			// Set the standardized `RateLimit-*` headers on the response object if
			// enabled.
			if (config.standardHeaders && !response.headersSent) {
				if (config.standardHeaders === 'draft-6') {
					setDraft6Headers(response, info, config.windowMs)
				} else if (config.standardHeaders === 'draft-7') {
					config.validations.headersResetTime(info.resetTime)
					setDraft7Headers(response, info, config.windowMs)
				}
			}

			// If we are to skip failed/successfull requests, decrement the
			// counter accordingly once we know the status code of the request
			if (config.skipFailedRequests || config.skipSuccessfulRequests) {
				let decremented = false
				const decrementKey = async () => {
					if (!decremented) {
						await config.store.decrement(key)
						decremented = true
					}
				}

				if (config.skipFailedRequests) {
					response.on('finish', async () => {
						if (!(await config.requestWasSuccessful(request, response)))
							await decrementKey()
					})
					response.on('close', async () => {
						if (!response.writableEnded) await decrementKey()
					})
					response.on('error', async () => {
						await decrementKey()
					})
				}

				if (config.skipSuccessfulRequests) {
					response.on('finish', async () => {
						if (await config.requestWasSuccessful(request, response))
							await decrementKey()
					})
				}
			}

			// Disable the validations, since they should have run at least once by now.
			config.validations.disable()

			// If the client has exceeded their rate limit, set the Retry-After header
			// and call the `handler` function.
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

	const getThrowFn = () => {
		throw new Error('The current store does not support the get/getKey method')
	}

	// Export the store's function to reset and fetch the rate limit info for a
	// client based on their identifier.
	;(middleware as RateLimitRequestHandler).resetKey =
		config.store.resetKey.bind(config.store)
	;(middleware as RateLimitRequestHandler).getKey =
		typeof config.store.get === 'function'
			? config.store.get.bind(config.store)
			: getThrowFn

	return middleware as RateLimitRequestHandler
}

// Export it to the world!
export default fixedWindow