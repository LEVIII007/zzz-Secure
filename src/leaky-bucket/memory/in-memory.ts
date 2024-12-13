import type { BucketStore, BucketOptions, ClientRateLimitInfo } from '../types';

type Client = {
    tokens: number;
    lastUpdateTime: number; // Tracks the last time tokens were leaked.
};

export default class MemoryLeakyBucketStore implements BucketStore {
    /**
     * The maximum number of tokens (bucket capacity).
     */
    bucketCapacity!: number;

    /**
     * The rate at which tokens are leaked (tokens per second).
     */
    leakRate!: number;

    /**
     * Map to store the tokens and last update time for each client.
     */
    clientMap = new Map<string, Client>();

    /**
     * Confirmation that the keys incremented in one instance of MemoryStore
     * cannot affect other instances.
     */
    localKeys = true;

    /**
     * Initialize the store with the given options.
     *
     * @param options {BucketOptions} - The options used to set up the middleware.
     */
    init(options: BucketOptions): void {
        this.bucketCapacity = options.maxTokens ?? 0;
        this.leakRate = (options.maxTokens ?? 0) / (options.windowMs / 1000); // Tokens leaked per second.
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
        const client = this.getClient(key);
        this.leakTokens(client);

        return {
            totalHits: client.tokens,
            resetTime: new Date(Date.now() + (client.tokens / this.leakRate) * 1000),
        };
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
        const client = this.getClient(key);
        this.leakTokens(client);

        // Check if the bucket has space for another token.
        if (client.tokens >= this.bucketCapacity) {
            // Bucket overflow (reject request).
            return {
                totalHits: client.tokens,
                resetTime: new Date(Date.now() + (client.tokens / this.leakRate) * 1000),
            };
        }

        // Add the request to the bucket.
        client.tokens++;

        return {
            totalHits: client.tokens,
            resetTime: new Date(Date.now() + (client.tokens / this.leakRate) * 1000),
        };
    }

    /**
     * Decrement the token bucket for a client by removing one token.
     *
     * @param key {string} - The identifier for a client.
     *
     * @public
     */
    async decrement(key: string): Promise<void> {
        const client = this.getClient(key);
        if (client.tokens > 0) {
            client.tokens--;
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
        this.clientMap.delete(key);
    }

    /**
     * Reset all clients' token buckets.
     *
     * @public
     */
    async resetAll(): Promise<void> {
        this.clientMap.clear();
    }

    /**
     * Shutdown the store by clearing all data.
     *
     * @public
     */
    shutdown(): void {
        void this.resetAll();
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
                tokens: 0, // Start with an empty bucket.
                lastUpdateTime: Date.now(),
            });
        }
        return this.clientMap.get(key)!;
    }

    /**
     * Leak tokens from a client's bucket based on the elapsed time since the last update.
     *
     * @param client {Client} - The client bucket to update.
     */
    private leakTokens(client: Client): void {
        const now = Date.now();
        const elapsedTime = (now - client.lastUpdateTime) / 1000; // Time in seconds.
        const tokensToLeak = elapsedTime * this.leakRate;

        if (tokensToLeak > 0) {
            client.tokens = Math.max(client.tokens - tokensToLeak, 0);
            client.lastUpdateTime = now;
        }
    }
}
