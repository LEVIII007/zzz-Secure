import { StoreInterface } from "./memoryInterface";
type StoreValue = { score: number; expiry: number; isBlocked: boolean };

export class InMemoryStore implements StoreInterface {
    private store = new Map<string, StoreValue>();
    private expiryQueue: Array<{ key: string; expiry: number }> = [];

    constructor(private suspicionThreshold = 5, private blockDurationMs = 60000) {}

    async set(key: string, score: number, ttl: number): Promise<void> {
        const expiry = Date.now() + ttl;
        const value = { score, expiry, isBlocked: false };
        this.store.set(key, value);
        this.addToExpiryQueue(key, expiry);
    }

    async get(key: string): Promise<StoreValue | undefined> {
        const value = this.store.get(key);
        return value && value.expiry > Date.now() ? value : undefined;
    }

    async increment(key: string, ttl: number): Promise<number> {
        const value = this.store.get(key);
        const now = Date.now();

        if (!value || value.expiry <= now) {
            // Key does not exist or expired, reset to 1
            await this.set(key, 1, ttl);
            return 1;
        } else {
            // Increment score
            value.score += 1;

            // Block the client if threshold exceeded
            if (value.score >= this.suspicionThreshold) {
                value.isBlocked = true;
                value.expiry = now + this.blockDurationMs;
            } else {
                value.expiry = now + ttl;
                this.addToExpiryQueue(key, value.expiry);
            }

            this.store.set(key, value);
            return value.score;
        }
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async flushExpired(): Promise<void> {
        const now = Date.now();

        while (
            this.expiryQueue.length > 0 &&
            this.expiryQueue[0].expiry <= now
        ) {
            const { key } = this.expiryQueue.shift()!;
            const value = this.store.get(key);

            if (value && value.expiry <= now) {
                this.store.delete(key);
            }
        }
    }

    async isBlocked(key: string): Promise<boolean> {
        const value = this.store.get(key);
        const now = Date.now();
        const isBlocked = value && value.isBlocked && value.expiry > now;
        return isBlocked ? isBlocked : false
    }

    private addToExpiryQueue(key: string, expiry: number): void {
        this.expiryQueue.push({ key, expiry });
        this.expiryQueue.sort((a, b) => a.expiry - b.expiry); // Min-heap sort
    }
}
