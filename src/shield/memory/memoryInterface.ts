// src/memory/IMemoryStore.ts
export interface StoreInterface {
    set(key: string, value: any, ttl: number): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    delete(key: string): Promise<void>;
    flushExpired(): Promise<void>; // For cleaning up expired entries
}


// // src/memory/StoreInterface.ts
// export interface StoreInterface {
//     get(key: string): any;                  // Retrieve value for a key
//     set(key: string, value: any, ttlMs?: number): void; // Set value with optional TTL
//     delete(key: string): void;              // Delete a key
//     flushExpired(): void;                   // Flush expired entries
// }


