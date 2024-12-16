import Redis, { Redis as RedisClient } from 'ioredis';
import { StoreInterface } from './memoryInterface';
import { scripts } from './script';
  

type StoreValue = { score: number; expiry: number; isBlocked: boolean };

interface RedisStoreOptions {
  client: RedisClient;
  windowMs?: number;
  resetExpiryOnChange?: boolean;
    suspicionThreshold?: number;
    blockDurationMs?: number;
}

export default class RedisShieldStore implements StoreInterface {
  private client: RedisClient;
  private windowMs: number;
  private resetExpiryOnChange: boolean;
  private suspicionThreshold: number = 5; 
  private blockDurationMs: number = 60000;
  

  constructor(options: RedisStoreOptions) {
    this.client = options.client;
    this.windowMs = options.windowMs ?? 60000; // Default to 1 minute
    this.resetExpiryOnChange = options.resetExpiryOnChange ?? false;
    this.suspicionThreshold = options.suspicionThreshold ?? 5;
    this.blockDurationMs = options.blockDurationMs ?? 60000;
  }

  async set(key: string, score: number, ttl: number): Promise<void> {
    const expiry = Date.now() + ttl;
    await this.client.hmset(key, 'score', score, 'expiry', expiry, 'isBlocked', 'false');
    await this.client.expire(key, ttl / 1000); // Set TTL for key
  }

  async get(key: string): Promise<StoreValue | undefined> {
    const value = await this.client.hmget(key, 'score', 'expiry', 'isBlocked');
    const [score, expiry, isBlocked] = value;
    
    if (!score || !expiry || Date.now() > parseInt(expiry, 10)) {
      return undefined;
    }

    return {
      score: parseInt(score, 10),
      expiry: parseInt(expiry, 10),
      isBlocked: isBlocked === 'true'
    };
  }

  async increment(key: string, ttl: number): Promise<number> {
    // Use Lua script to handle the increment and blocking logic
    const result = await this.client.evalsha(
      scripts.increment,
      1,
      key,
      this.suspicionThreshold.toString(),
      this.blockDurationMs.toString(),
      ttl.toString()
    );
    return parseInt(result as string, 10);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async flushExpired(): Promise<void> {
    // Use Lua script to delete expired keys
    const deletedCount = await this.client.evalsha(
      scripts.flushExpired,
      0
    );
    console.log(`Deleted ${deletedCount} expired keys.`);
  }

  async isBlocked(key: string): Promise<boolean> {
    const value = await this.client.hget(key, 'isBlocked');
    return value === 'true';
  }
}
