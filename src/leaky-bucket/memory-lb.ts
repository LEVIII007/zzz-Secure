import type { Store, Options, ClientRateLimitInfo } from '../types';

/**
 * Represents a client with remaining capacity and the last updated timestamp.
 */
type Client = {
    remaining: number;
    lastUpdated: number;
};

/**
 * A `Store` implementation using the Leaky Bucket algorithm for rate limiting in memory.
 *
 * @public
 */
export default class MemoryLeakyBucketStore implements Store {
    /**
     * The maximum capacity of the bucket (i.e., allowed hits per window).
     */
    private bucketCapacity!: number;

    /**
     * The leak rate (i.e., number of hits drained per millisecond).
     */
    private leakRate!: number;

    /**
     * Map storing usage information for each client.
     */
    private readonly clients = new Map<string, Client>();

    /**
     * Ensures that keys in one instance do not affect other instances.
     */
    readonly localKeys = true;

    /**
     * Initializes the store with the provided options.
     *
     * @param options {Options} - Options to configure the store.
     */
    init(options: Options): void {
        this.bucketCapacity = typeof options.max === 'number' ? options.max : 10; // Default to 10 hits if max not provided
        this.leakRate = this.bucketCapacity / (options.windowMs ?? 60000); // Default to 1-minute window
    }

    /**
     * Fetches a client's remaining capacity and reset time.
     *
     * @param key {string} - The identifier for the client.
     * @returns {ClientRateLimitInfo | undefined} - Remaining capacity and reset time, or undefined if the client doesn't exist.
     */
    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        const client = this.clients.get(key);
        if (!client) return undefined;

        this.updateBucket(client);

        return {
            totalHits: client.remaining,
            resetTime: new Date(client.lastUpdated + (this.bucketCapacity / this.leakRate)),
        };
    }

    /**
     * Increments a client's hit counter.
     *
     * @param key {string} - The identifier for the client.
     * @returns {ClientRateLimitInfo} - Updated remaining capacity and reset time.
     */
    async increment(key: string): Promise<ClientRateLimitInfo> {
        const client = this.getClient(key);

        // Update the bucket to reflect leaks
        this.updateBucket(client);

        // If no capacity remains, return with reset time
        if (client.remaining <= 0) {
            return {
                totalHits: 0,
                resetTime: new Date(client.lastUpdated + (this.bucketCapacity / this.leakRate)),
            };
        }

        // Decrease remaining capacity
        client.remaining--;

        return {
            totalHits: client.remaining,
            resetTime: new Date(client.lastUpdated + (this.bucketCapacity / this.leakRate)),
        };
    }

    /**
     * Decrements a client's hit counter.
     *
     * @param key {string} - The identifier for the client.
     */
    async decrement(key: string): Promise<void> {
        const client = this.clients.get(key);
        if (client) {
            client.remaining = Math.min(client.remaining + 1, this.bucketCapacity);
        }
    }

    /**
     * Resets a specific client's hit counter.
     *
     * @param key {string} - The identifier for the client.
     */
    async resetKey(key: string): Promise<void> {
        this.clients.delete(key);
    }

    /**
     * Resets all clients' hit counters.
     */
    async resetAll(): Promise<void> {
        this.clients.clear();
    }

    /**
     * Updates the client's bucket to account for leaked capacity since the last request.
     *
     * @param client {Client} - The client whose bucket is being updated.
     */
    private updateBucket(client: Client): void {
        const now = Date.now();
        const elapsedTime = now - client.lastUpdated;

        // Calculate leaked capacity
        const leaked = elapsedTime * this.leakRate;

        // Update remaining capacity and timestamp
        client.remaining = Math.min(client.remaining + leaked, this.bucketCapacity);
        client.lastUpdated = now;
    }

    /**
     * Retrieves an existing client or creates a new one.
     *
     * @param key {string} - The identifier for the client.
     * @returns {Client} - The client object.
     */
    private getClient(key: string): Client {
        let client = this.clients.get(key);
        if (!client) {
            client = { remaining: this.bucketCapacity, lastUpdated: Date.now() };
            this.clients.set(key, client);
        }
        return client;
    }
}
