// /source/types.ts
// All the types used by this package

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { Validations } from './validation'

/**
 * Callback that fires when a client's hit counter is incremented.
 *
 * @param error {Error | undefined} - The error that occurred, if any.
 * @param totalHits {number} - The number of hits for that client so far.
 * @param resetTime {Date | undefined} - The time when the counter resets.
 */
export type IncrementCallback = (
	error: Error | undefined,
	totalHits: number,
	resetTime: Date | undefined,
) => void

/**
 * Method (in the form of middleware) to generate/retrieve a value based on the
 * incoming request.
 *
 * @param request {Request} - The Express request object.
 * @param response {Response} - The Express response object.
 *
 * @returns {T} - The value needed.
 */
export type ValueDeterminingMiddleware<T> = (
	request: Request,
	response: Response,
) => T | Promise<T>

/**
 * Express request handler that sends back a response when a client is
 * rate-limited.
 *
 * @param request {Request} - The Express request object.
 * @param response {Response} - The Express response object.
 * @param next {NextFunction} - The Express `next` function, can be called to skip responding.
 * @param optionsUsed {Options} - The options used to set up the middleware.
 */
export type RateLimitExceededEventHandler = (
	request: Request,
	response: Response,
	next: NextFunction,
	optionsUsed: Options,
) => void

/**
 * Event callback that is triggered on a client's first request that exceeds the limit
 * but not for subsequent requests. May be used for logging, etc. Should *not*
 * send a response.
 *
 * @param request {Request} - The Express request object.
 * @param response {Response} - The Express response object.
 * @param optionsUsed {Options} - The options used to set up the middleware.
 */
export type RateLimitReachedEventHandler = (
	request: Request,
	response: Response,
	optionsUsed: Options,
) => void

/**
 * Data returned from the `Store` when a client's hit counter is incremented.
 *
 * @property totalHits {number} - The number of hits for that client so far.
 * @property resetTime {Date | undefined} - The time when the counter resets.
 */
export type ClientRateLimitInfo = {
	totalHits: number
	resetTime: Date | undefined
}

export type IncrementResponse = ClientRateLimitInfo

/**
 * A modified Express request handler with the rate limit functions.
 */
export type RateLimitRequestHandler = RequestHandler & {
	/**
	 * Method to reset a client's hit counter.
	 *
	 * @param key {string} - The identifier for a client.
	 */
	resetKey: (key: string) => void

	/**
	 * Method to fetch a client's hit count and reset time.
	 *
	 * @param key {string} - The identifier for a client.
	 *
	 * @returns {ClientRateLimitInfo} - The number of hits and reset time for that client.
	 */
	getKey: (
		key: string,
	) =>
		| Promise<ClientRateLimitInfo | undefined>
		| ClientRateLimitInfo
		| undefined
}


/**
 * An interface that all hit counter stores must implement.
 */
export type Store = {
	init?: (options: Options) => void

	get?: (
		key: string,
	) =>
		| Promise<ClientRateLimitInfo | undefined>
		| ClientRateLimitInfo
		| undefined
	increment: (key: string) => Promise<IncrementResponse> | IncrementResponse
	decrement: (key: string) => Promise<void> | void
	resetKey: (key: string) => Promise<void> | void
	resetAll?: () => Promise<void> | void
	shutdown?: () => Promise<void> | void
	localKeys?: boolean
	prefix?: string
}
export type BucketStore = {
	init?: (options: Options) => void;
  
	/**
	 * Method to fetch a client's token count and the time at which the bucket will be reset.
	 *
	 * @param key {string} - The identifier for a client.
	 *
	 * @returns {ClientRateLimitInfo} - The current token count and reset time for that client.
	 */
	get?: (
	  key: string,
	) =>
	  | Promise<ClientRateLimitInfo | undefined>
	  | ClientRateLimitInfo
	  | undefined;
	
	refill?: (key: string) => Promise<IncrementResponse> | IncrementResponse;
  

	resetKey: (key: string) => Promise<void> | void;
	resetAll?: () => Promise<void> | void;
	shutdown?: () => Promise<void> | void;
	localKeys?: boolean;
	prefix?: string;
  }
  
export type DraftHeadersVersion = 'draft-6' | 'draft-7'

/**
 * Validate configuration object for enabling or disabling specific validations.
 *
 * The keys must also be keys in the validations object, except `enable`, `disable`,
 * and `default`.
 */
export type EnabledValidations = {
	[key in keyof Omit<Validations, 'enabled' | 'disable'> | 'default']?: boolean
}

/**
 * The configuration options for the rate limiter.
 */
export type Options = {

	windowMs: number
	limit: number | ValueDeterminingMiddleware<number>
	message: any | ValueDeterminingMiddleware<any>
	statusCode: number
	standardHeaders: boolean | DraftHeadersVersion
	requestPropertyName: string
	skipFailedRequests: boolean
	skipSuccessfulRequests: boolean
	keyGenerator: ValueDeterminingMiddleware<string>
	handler: RateLimitExceededEventHandler
	skip: ValueDeterminingMiddleware<boolean>
	requestWasSuccessful: ValueDeterminingMiddleware<boolean>
	store: Store
	validate: boolean | EnabledValidations
	headers?: boolean
	max?: number | ValueDeterminingMiddleware<number>
	passOnStoreError: boolean
}

export type BucketOptions = {
	windowMs: number
	limit: number | ValueDeterminingMiddleware<number>
	message: any | ValueDeterminingMiddleware<any>
	statusCode: number
	standardHeaders: boolean | DraftHeadersVersion
	requestPropertyName: string
	skipFailedRequests: boolean
	skipSuccessfulRequests: boolean
	keyGenerator: ValueDeterminingMiddleware<string>
	handler: RateLimitExceededEventHandler
	skip: ValueDeterminingMiddleware<boolean>
	requestWasSuccessful: ValueDeterminingMiddleware<boolean>
	store: Store
	validate: boolean | EnabledValidations
	headers?: boolean
	max?: number | ValueDeterminingMiddleware<number>
	passOnStoreError: boolean
	maxTokens?: number
	refillRate?: number
}

/**
 * The configuration options for the rate limiter.
 */
export type AugmentedRequest = Request & {
	[key: string]: RateLimitInfo
}


export type RateLimitInfo = {
	limit: number
	used: number
	remaining: number
	resetTime: Date | undefined
}