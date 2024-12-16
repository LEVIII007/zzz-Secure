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

export type RateLimitExceededEventHandler1 = (
	request: Request,
	response: Response,
	next: NextFunction,
	optionsUsed: BucketOptions,
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

export type RateLimitReachedEventHandler1 = (
	request: Request,
	response: Response,
	optionsUsed: BucketOptions,
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

/**
 * The interface for the Token Bucket store. This defines the operations
 * required to interact with a token bucket-based rate limiter.
 */
export interface BucketStore {
    /**
     * Initializes the store with the given configuration.
     * 
     * @param options - Configuration options for the token bucket.
     */
    init(options: BucketOptions): void;

    /**
     * Retrieves the current rate limit information for a client.
     * 
     * @param key - The unique identifier for a client.
     * @returns A promise with the rate limit information for the client.
     */
    get(key: string): Promise<ClientRateLimitInfo | undefined>;

    /**
     * Increments (consumes) one token from the client's token bucket.
     * 
     * @param key - The unique identifier for a client.
     * @returns A promise with the updated rate limit information for the client.
     */
    increment(key: string): Promise<ClientRateLimitInfo>;

    /**
     * Decrements (adds back) one token to the client's token bucket.
     * 
     * @param key - The unique identifier for a client.
     * @returns A promise that resolves when the operation is complete.
     */
    decrement(key: string): Promise<void>;

    /**
     * Resets the token bucket for a specific client.
     * 
     * @param key - The unique identifier for a client.
     * @returns A promise that resolves when the operation is complete.
     */
    resetKey(key: string): Promise<void>;

    /**
     * Resets the token buckets for all clients.
     * 
     * @returns A promise that resolves when the operation is complete.
     */
    resetAll(): Promise<void>;

    /**
     * Shuts down the store and clears all data.
     * 
     * @returns Nothing, but ensures any necessary cleanup happens.
     */
    shutdown(): void;

    /**
     * The duration (in milliseconds) between each token refill.
     * This is calculated based on the refill rate.
     */
    refillInterval: number;

    /**
     * The maximum number of tokens that the bucket can hold.
     */
    bucketCapacity: number;

    /**
     * The number of tokens to add per refill interval.
     */
    tokensPerInterval: number;

    /**
     * A map to store the token bucket information for each client.
     */
    clientMap?: Map<string, { tokens: number; lastRefillTime: number }>;

    /**
     * A flag to determine if keys in one instance of the store are isolated from other instances.
     */
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
 * An interface that defines the operations for a generic store.
 */
export interface StoreInterface {
	/**
	 * Sets a key in the store with a score and TTL.
	 * @param key - The key to store.
	 * @param score - The initial score to associate with the key.
	 * @param ttl - The time-to-live (TTL) in milliseconds.
	 */
	set(key: string, score: number, ttl: number): Promise<void>;

	/**
	 * Retrieves the value associated with the given key.
	 * @param key - The key to retrieve.
	 * @returns The value associated with the key, or `undefined` if not found.
	 */
	get(key: string): Promise<{ score: number; expiry: number } | undefined>;

	/**
	 * Increments the score for a given key, setting it if it does not exist.
	 * @param key - The key to increment.
	 * @param ttl - The time-to-live (TTL) in milliseconds.
	 */
	increment(key: string, ttl: number): Promise<number>;

	/**
	 * Deletes the given key from the store.
	 * @param key - The key to delete.
	 */
	delete(key: string): Promise<void>;

	/**
	 * Flushes expired keys from the store.
	 */
	flushExpired(): Promise<void>;

	/**
	 * Checks if a key is blocked and returns the block expiry if true.
	 * @param key - The key to check.
	 * @returns The block expiry timestamp, or `null` if the key is not blocked.
	 */
	isBlocked(key: string): Promise<boolean>;
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
	Limit : number | ValueDeterminingMiddleware<number>
	maxTokens: number | ValueDeterminingMiddleware<number> // for TokenBucket
	refillInterval ?: number | ValueDeterminingMiddleware<number> // for TokenBucket
	refillRate: number | undefined;   // for TokenBucket
	LeakRate: number | undefined;      // for leaky
	message: any | ValueDeterminingMiddleware<any>
	statusCode: number
	standardHeaders: boolean | DraftHeadersVersion
	requestPropertyName: string
	skipFailedRequests: boolean
	skipSuccessfulRequests: boolean
	keyGenerator: ValueDeterminingMiddleware<string>
	handler: RateLimitExceededEventHandler1
	skip: ValueDeterminingMiddleware<boolean>
	requestWasSuccessful: ValueDeterminingMiddleware<boolean>
	store: BucketStore
	validate: boolean | EnabledValidations
	headers?: boolean
	passOnStoreError: boolean
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