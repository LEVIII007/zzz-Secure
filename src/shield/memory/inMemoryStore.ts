// src/memory/InMemoryStore.ts
import { StoreInterface } from './memoryInterface';

type StoreValue = { value: any; expiry: number };

export class InMemoryStore implements StoreInterface {
    private store = new Map<string, StoreValue>();

    async set(key: string, value: any, ttl: number): Promise<void> {
        const expiry = Date.now() + ttl;
        this.store.set(key, { value, expiry });
    }

    async get<T>(key: string): Promise<T | null> {
        const item = this.store.get(key);
        if (item && item.expiry > Date.now()) {
            return item.value as T;
        }
        this.store.delete(key); // Clean up expired entry
        return null;
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async flushExpired(): Promise<void> {
        const now = Date.now();
        for (const [key, { expiry }] of this.store.entries()) {
            if (expiry <= now) {
                this.store.delete(key);
            }
        }
    }
}
