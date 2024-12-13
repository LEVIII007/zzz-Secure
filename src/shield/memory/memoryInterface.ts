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

    /**
     * Blocks a key for a specified duration.
     * @param key - The key to block.
     * @param duration - The block duration in milliseconds.
     */
    // block(key: string, duration: number): Promise<void>;

    /**
     * Clears all keys from the store.
     */
    // clear(): Promise<void>;
}
