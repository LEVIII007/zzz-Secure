// import type { Store, Options, ClientRateLimitInfo } from '../types';

// /**
//  * The record that stores information about a client - namely, the remaining capacity
//  * and the last time it was updated.
//  */
// type Client = {
//     remaining: number;
//     lastUpdated: number;
// };

// /**
//  * A `Store` that implements the Leaky Bucket algorithm for rate limiting in memory.
//  *
//  * @public
//  */
// export default class MemoryLeakyBucketStore implements Store {
//     /**
//      * The maximum capacity of the bucket (i.e., allowed hits per window).
//      */
//     bucketCapacity!: number;

//     /**
//      * The leak rate (i.e., number of hits drained per millisecond).
//      */
//     leakRate!: number;

//     /**
//      * Stores usage information for each client.
//      */
//     clients = new Map<string, Client>();

//     /**
//      * Confirmation that the keys incremented in one instance of MemoryStore
//      * cannot affect other instances.
//      */
//     localKeys = true;

//     /**
//      * Method that initializes the store.
//      *
//      * @param options {Options} - The options used to setup the middleware.
//      */
//     init(options: Options): void {
//         this.bucketCapacity = options.max ?? 10; // Default to 10 hits if max not provided
//         this.leakRate = this.bucketCapacity / (options.windowMs ?? 60000); // Default to 1 minute window
//     }

//     /**
//      * Method to fetch a client's remaining capacity and reset time.
//      *
//      * @param key {string} - The identifier for a client.
//      *
//      * @returns {ClientRateLimitInfo | undefined} - The remaining capacity and reset time for that client.
//      *
//      * @public
//      */
//     async get(key: string): Promise<ClientRateLimitInfo | undefined> {
//         const client = this.clients.get(key);
//         if (!client) return undefined;

//         this.updateBucket(client);
//         return {
//             remaining: client.remaining,
//             resetTime: new Date(client.lastUpdated + (this.bucketCapacity / this.leakRate)),
//         };
//     }

//     /**
//      * Method to increment a client's hit counter.
//      *
//      * @param key {string} - The identifier for a client.
//      *
//      * @returns {ClientRateLimitInfo} - The updated remaining capacity and reset time for that client.
//      *
//      * @public
//      */
//     async increment(key: string): Promise<ClientRateLimitInfo> {
//         const client = this.getClient(key);

//         // Update the bucket to account for leaking since last update
//         this.updateBucket(client);

//         // Check if the bucket has capacity
//         if (client.remaining <= 0) {
//             return {
//                 remaining: 0,
//                 resetTime: new Date(client.lastUpdated + (this.bucketCapacity / this.leakRate)),
//             };
//         }

//         // Increment the hits and decrease the remaining capacity
//         client.remaining--;
//         return {
//             remaining: client.remaining,
//             resetTime: new Date(client.lastUpdated + (this.bucketCapacity / this.leakRate)),
//         };
//     }

//     /**
//      * Method to decrement a client's hit counter (rarely needed in Leaky Bucket).
//      *
//      * @param key {string} - The identifier for a client.
//      *
//      * @public
//      */
//     async decrement(key: string): Promise<void> {
//         const client = this.clients.get(key);
//         if (client) client.remaining = Math.min(client.remaining + 1, this.bucketCapacity);
//     }

//     /**
//      * Method to reset a client's hit counter.
//      *
//      * @param key {string} - The identifier for a client.
//      *
//      * @public
//      */
//     async resetKey(key: string): Promise<void> {
//         this.clients.delete(key);
//     }

//     /**
//      * Method to reset everyone's hit counter.
//      *
//      * @public
//      */
//     async resetAll(): Promise<void> {
//         this.clients.clear();
//     }

//     /**
//      * Ensures that the client's bucket is updated to reflect the leaked capacity since the last request.
//      *
//      * @param client {Client} - The client to update.
//      */
//     private updateBucket(client: Client): void {
//         const now = Date.now();
//         const elapsedTime = now - client.lastUpdated;

//         // Calculate how much capacity has leaked since the last update
//         const leaked = elapsedTime * this.leakRate;
//         client.remaining = Math.min(client.remaining + leaked, this.bucketCapacity);
//         client.lastUpdated = now;
//     }

//     /**
//      * Retrieves or creates a client, given a key.
//      *
//      * @param key {string} - The key under which the client is (or is to be) stored.
//      *
//      * @returns {Client} - The requested client.
//      */
//     private getClient(key: string): Client {
//         let client = this.clients.get(key);
//         if (!client) {
//             client = { remaining: this.bucketCapacity, lastUpdated: Date.now() };
//             this.clients.set(key, client);
//         }
//         return client;
//     }
// }
