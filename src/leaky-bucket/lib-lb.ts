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
import {
	parseOptions,
	handleAsyncErrors,
	getOptionsFromConfig,
} from '../parseConfig';
import { RateLimitExceededEventHandler } from '../types';
import MemoryLeakyBucketStore from './memory/in-memory';
import { getValidations, type Validations } from '../validation';



// xport default class ZShield {
//     private suspicionThreshold: number;
//     private blockDurationMs: number;
//     private memoryStore: StoreInterface;
//     private options: ShieldOptions;

//     constructor(options: Partial<ShieldOptions> = {}) {
//         this.options = {
//             message: "Access denied due to suspicious activity.",
//             suspicionThreshold: 5,
//             blockDurationMs: 60000,
//             csrf: true,
//             xss: true,
//             sqlInjection: true,
//             lfi: true,
//             rfi: true,
//             shellInjection: true,
//             store: new InMemoryStore(),
//             ...options,
//         };

//         this.memoryStore = this.options.store!;
//         this.suspicionThreshold = this.options.suspicionThreshold ?? 5;
//         this.blockDurationMs = this.options.blockDurationMs ?? 60000;
//     }
class LeakyBucketRateLimiter {
    private options: BucketOptions = {
        windowMs: 60 * 1000,
        limit: 5,
        message: 'Too many requests, please try again later.',
        statusCode: 429,
        standardHeaders: true,
        requestPropertyName: 'rateLimit',
        skipFailedRequests: false,
        skipSuccessfulRequests: false,
		keyGenerator(request: Request, _response: Response): string {
            return request.ip!;
        },
        handler: (request: Request, response: Response, next: NextFunction) => {
            response.status(this.options.statusCode).send(this.options.message);
        },
        skip: (request: Request, response: Response) => false,
        requestWasSuccessful: (request: Request, response: Response) =>
            response.statusCode !== this.options.statusCode,
        store: new MemoryLeakyBucketStore(),
        validate: true,
        passOnStoreError: false,
    };

	constructor(passedOptions: Partial<BucketOptions> = {}) {
        this.options = {
            ...this.options,
            ...passedOptions,
        }
        this.options.store = this.options.store ?? new MemoryLeakyBucketStore();
        this.options.store.init({
            windowMs: this.options.windowMs,
            maxTokens: this.options.limit,
            refillRate: this.options.limit,
        })


	}

	/**
	 * Create the middleware function for rate limiting.
	 *
	 * @returns {RateLimitRequestHandler} - The middleware to rate-limit clients.
	 */
	public createMiddleware(): RateLimitRequestHandler {
		const middleware = handleAsyncErrors(
			async (request: Request, response: Response, next: NextFunction) => {
				const skip = await this.config.skip(request, response);
				if (skip) {
					next();
					return;
				}

				const augmentedRequest = request as AugmentedRequest;
				const key = await this.config.keyGenerator(request, response);

				let tokensInQueue = 0;
				let resetTime;
				try {
					// Queue operation: Add the request and leak tokens
					const incrementResult = await this.config.store.queueAndLeak(
						key,
						this.options.refillRate
					);
					tokensInQueue = incrementResult.totalQueued;
					resetTime = incrementResult.resetTime;
				} catch (error) {
					if (this.config.passOnStoreError) {
						console.error(
							'express-rate-limit: error from store, allowing request without rate-limiting.',
							error
						);
						next();
						return;
					}
					throw error;
				}

				this.config.validations.positiveHits(tokensInQueue);
				this.config.validations.singleCount(request, this.config.store, key);

				const retrieveLimit =
					typeof this.config.limit === 'function'
						? this.config.limit(request, response)
						: this.config.limit;
				const limit = await retrieveLimit;
				this.config.validations.limit(limit);

				const info: RateLimitInfo = {
					limit,
					used: tokensInQueue,
					remaining: Math.max(limit - tokensInQueue, 0),
					resetTime,
				};

				Object.defineProperty(info, 'current', {
					configurable: false,
					enumerable: false,
					value: tokensInQueue,
				});
				augmentedRequest[this.config.requestPropertyName] = info;

				if (this.config.standardHeaders && !response.headersSent) {
					if (this.config.standardHeaders === 'draft-6') {
						setDraft6Headers(response, info, this.config.windowMs);
					} else if (this.config.standardHeaders === 'draft-7') {
						this.config.validations.headersResetTime(info.resetTime);
						setDraft7Headers(response, info, this.config.windowMs);
					}
				}

				if (tokensInQueue >= limit) {
					if (this.config.standardHeaders) {
						setRetryAfterHeader(response, info, this.config.windowMs);
					}
					this.config.handler(request, response, next, this.options);
					return;
				}
				next();
			}
		);

		const getThrowFn = () => {
			throw new Error('The current store does not support the get/getKey method');
		};

		(middleware as RateLimitRequestHandler).resetKey =
			this.config.store.resetKey.bind(this.config.store);
		(middleware as RateLimitRequestHandler).getKey =
			typeof this.config.store.get === 'function'
				? this.config.store.get.bind(this.config.store)
				: getThrowFn;

		return middleware as RateLimitRequestHandler;
	}
}

export default LeakyBucketRateLimiter;