// src/redis-store/redis-store.ts
import { Redis as RedisClient } from 'ioredis';
import { LUA_SCRIPTS } from './scripts';
import type { BucketStore, BucketOptions, ClientRateLimitInfo } from '../types';

export default class RedisTokenBucketStore implements BucketStore {
    private redis: RedisClient;
    public refillInterval!: number;
    public bucketCapacity!: number;
    public tokensPerInterval!: number;
    public prefix!: string;

    // Precompiled Lua script SHA
    private consumeTokenSha!: string;
    private returnTokenSha!: string;
    private resetClientSha!: string;

    constructor(redisClient: RedisClient) {
        this.redis = redisClient;
    }

    async init(options: BucketOptions): Promise<void> {
        // Calculate refill parameters
        this.refillInterval = 1000 / (options.refillRate ?? 1);
        this.bucketCapacity = typeof options.maxTokens === 'number' ? options.maxTokens : 10;
        this.tokensPerInterval = options.refillRate ?? 1 / (this.refillInterval / 1000);
        this.prefix = 'rl:'

        // Load Lua scripts
        this.consumeTokenSha = await this.redis.script('LOAD', LUA_SCRIPTS.CONSUME_TOKEN);
        this.returnTokenSha = await this.redis.script('LOAD', LUA_SCRIPTS.RETURN_TOKEN);
        this.resetClientSha = await this.redis.script('LOAD', LUA_SCRIPTS.RESET_CLIENT);

        console.debug(
            `Initialized RedisTokenBucketStore with refillInterval: ${this.refillInterval}, ` +
            `bucketCapacity: ${this.bucketCapacity}, tokensPerInterval: ${this.tokensPerInterval}`
        );
    }

    async increment(key: string): Promise<ClientRateLimitInfo> {
        const now = Date.now();

        const [canConsume, remainingTokens, resetTime] = await this.redis.evalsha(
            this.consumeTokenSha,
            1,  // Number of keys
            key,
            now,
            this.refillInterval,
            this.bucketCapacity,
            this.tokensPerInterval
        ) as [number, number, number];
        console.log("canConsume", canConsume)
        console.log("remainingTokens", remainingTokens)
        console.log("resetTime", resetTime)

        return {
            totalHits: remainingTokens,
            resetTime: new Date(resetTime),
        };
    }

    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        const bucketData = await this.redis.hgetall(key);
        
        if (Object.keys(bucketData).length === 0) {
            return undefined;
        }

        const now = Date.now();
        const lastRefillTime = parseInt(bucketData.lastRefillTime || now.toString());
        const currentTokens = parseInt(bucketData.tokens || '0');
        console.log("currentTokens", currentTokens)
        console.log("lastRefillTime", lastRefillTime)

        return {
            totalHits: currentTokens,
            resetTime: new Date(lastRefillTime + this.refillInterval)
        };
    }

    async decrement(key: string): Promise<void> {
        await this.redis.evalsha(
            this.returnTokenSha,
            1,  // Number of keys
            key,
            this.bucketCapacity
        );
    }

    async resetKey(key: string): Promise<void> {
        await this.redis.evalsha(
            this.resetClientSha,
            1,  // Number of keys
            key,
            this.bucketCapacity,
            Date.now()
        );
    }

    async resetAll(): Promise<void> {
        const keys = await this.redis.keys('*');
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }

    shutdown(): void {
        // Optional: Close Redis connection if needed
        this.redis.quit();
    }
}