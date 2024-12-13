// /source/memory-store.ts
// A memory store implementing the Token Bucket algorithm

import type { BucketStore, BucketOptions, ClientRateLimitInfo } from '../types'

type Client = {
    tokens: number
    lastRefillTime: number
}

/**
 * A `Store` that implements the Token Bucket algorithm for rate-limiting.
 *
 * @public
 */
export default class MemoryTokenBucketStore implements BucketStore {
    /**
     * The duration of time (in milliseconds) for refilling tokens.
     */
    refillInterval!: number

    /**
     * The maximum number of tokens a bucket can hold.
     */
    bucketCapacity!: number

    /**
     * The number of tokens to add per refill interval.
     */
    tokensPerInterval!: number

    /**
     * Map to store the tokens and last refill time for each client.
     */
    clientMap = new Map<string, Client>()

    /**
     * Confirmation that the keys incremented in one instance of MemoryStore
     * cannot affect other instances.
     */
    localKeys = true

    /**
     * Initialize the store with the given options.
     *
     * @param options {Options} - The options used to set up the middleware.
     */
    init(options:  BucketOptions): void {
        this.refillInterval = options.windowMs
        this.bucketCapacity = options.maxTokens ?? 0 
        this.tokensPerInterval = this.bucketCapacity / (this.refillInterval / 1000)
    }

    /**
     * Fetch a client's current token count and reset time.
     *
     * @param key {string} - The identifier for a client.
     *
     * @returns {ClientRateLimitInfo | undefined} - The remaining tokens and reset time for that client.
     *
     * @public
     */
    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        const client = this.getClient(key)
        const now = Date.now()
        this.refillTokens(client, now)

        return {
            totalHits: client.tokens,
            resetTime: new Date(client.lastRefillTime + this.refillInterval),
        }
    }

    /**
     * Increment the token bucket for a client by consuming one token.
     *
     * @param key {string} - The identifier for a client.
     *
     * @returns {ClientRateLimitInfo} - The remaining tokens and reset time for that client.
     *
     * @public
     */
    async increment(key: string): Promise<ClientRateLimitInfo> {
        const client = this.getClient(key)
        const now = Date.now()
        this.refillTokens(client, now)

        if (client.tokens > 0) {
            client.tokens--
        }

        return {
           totalHits: client.tokens,
            resetTime: new Date(client.lastRefillTime + this.refillInterval),
        }
    }

    /**
     * Decrement the token bucket for a client by adding back one token.
     *
     * @param key {string} - The identifier for a client.
     *
     * @public
     */
    async decrement(key: string): Promise<void> {
        const client = this.getClient(key)

        if (client.tokens < this.bucketCapacity) {
            client.tokens++
        }
    }

    /**
     * Reset a client's token bucket.
     *
     * @param key {string} - The identifier for a client.
     *
     * @public
     */
    async resetKey(key: string): Promise<void> {
        this.clientMap.delete(key)
    }

    /**
     * Reset all clients' token buckets.
     *
     * @public
     */
    async resetAll(): Promise<void> {
        this.clientMap.clear()
    }

    /**
     * Shutdown the store by clearing all data.
     *
     * @public
     */
    shutdown(): void {
        void this.resetAll()
    }

    /**
     * Get or create a client bucket for the given key.
     *
     * @param key {string} - The identifier for a client.
     *
     * @returns {Client} - The client bucket.
     */
    private getClient(key: string): Client {
        if (!this.clientMap.has(key)) {
            this.clientMap.set(key, {
                tokens: this.bucketCapacity,
                lastRefillTime: Date.now(),
            })
        }
        return this.clientMap.get(key)!
    }

    /**
     * Refill tokens for a client bucket based on the elapsed time since the last refill.
     *
     * @param client {Client} - The client bucket to refill.
     * @param now {number} - The current timestamp.
     */
    private refillTokens(client: Client, now: number): void {
        const elapsedTime = now - client.lastRefillTime
        const tokensToAdd = Math.floor((elapsedTime / 1000) * this.tokensPerInterval)

        if (tokensToAdd > 0) {
            client.tokens = Math.min(client.tokens + tokensToAdd, this.bucketCapacity)
            client.lastRefillTime = now
        }
    }
}
