import { Pool } from 'pg';
import type { BucketStore, BucketOptions, ClientRateLimitInfo } from '../types';

export default class PostgresTokenBucketStore implements BucketStore {
    private pool: Pool;
    public refillInterval!: number;
    public bucketCapacity!: number;
    public tokensPerInterval!: number;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async init(options: BucketOptions): Promise<void> {
        this.refillInterval = 1000 / (options.refillRate ?? 1);
        this.bucketCapacity = typeof options.maxTokens === 'number' ? options.maxTokens : 10;
        this.tokensPerInterval = options.refillRate ?? 1 / (this.refillInterval / 1000);

        console.debug(
            `Initialized PostgresTokenBucketStore with refillInterval: ${this.refillInterval}, ` +
            `bucketCapacity: ${this.bucketCapacity}, tokensPerInterval: ${this.tokensPerInterval}`
        );
        // Check and create the table if it doesn't exist
    try {
      await this.pool.query(`
          CREATE TABLE IF NOT EXISTS token_buckets (
              key TEXT PRIMARY KEY,
              tokens INT NOT NULL,
              last_refill_time BIGINT NOT NULL
          )
      `);

      console.debug('Token bucket table verified or created successfully.');
  } catch (error) {
      console.error('Error initializing the PostgresTokenBucketStore:', error);
      throw error;
  }
    }

    async increment(key: string): Promise<ClientRateLimitInfo> {
        const now = Date.now();

        // Start a transaction
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Fetch current bucket state
            const result = await client.query(
                `SELECT tokens, last_refill_time FROM token_buckets WHERE key = $1 FOR UPDATE`,
                [key]
            );

            let currentTokens = 0;
            let lastRefillTime = now;

            if (result.rowCount && result.rowCount > 0) {
                const row = result.rows[0];
                currentTokens = parseInt(row.tokens, 10);
                lastRefillTime = parseInt(row.last_refill_time, 10);
            }

            // Calculate tokens to add
            const elapsedTime = now - lastRefillTime;
            const tokensToAdd = Math.floor((elapsedTime / 1000) * this.tokensPerInterval);
            const newTokens = Math.min(currentTokens + tokensToAdd, this.bucketCapacity);

            // Consume a token if available
            const canConsume = newTokens > 0;
            const updatedTokens = canConsume ? newTokens - 1 : newTokens;

            // Upsert the bucket state
            await client.query(
                `INSERT INTO token_buckets (key, tokens, last_refill_time)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (key)
                 DO UPDATE SET tokens = $2, last_refill_time = $3`,
                [key, updatedTokens, now]
            );

            await client.query('COMMIT');

            return {
                totalHits: updatedTokens,
                resetTime: new Date(lastRefillTime + this.refillInterval),
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        const result = await this.pool.query(
            `SELECT tokens, last_refill_time FROM token_buckets WHERE key = $1`,
            [key]
        );

        if (result.rowCount === 0) {
            return undefined;
        }

        const { tokens, last_refill_time } = result.rows[0];
        const lastRefillTime = parseInt(last_refill_time, 10);

        return {
            totalHits: tokens,
            resetTime: new Date(lastRefillTime + this.refillInterval),
        };
    }

    async decrement(key: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Fetch current tokens
            const result = await client.query(
                `SELECT tokens FROM token_buckets WHERE key = $1 FOR UPDATE`,
                [key]
            );

            if (result.rowCount !== null && result.rowCount > 0) {
                const currentTokens = parseInt(result.rows[0].tokens, 10);
                const newTokens = Math.min(currentTokens + 1, this.bucketCapacity);

                // Update tokens
                await client.query(
                    `UPDATE token_buckets SET tokens = $1 WHERE key = $2`,
                    [newTokens, key]
                );
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async resetKey(key: string): Promise<void> {
        const now = Date.now();
        await this.pool.query(
            `INSERT INTO token_buckets (key, tokens, last_refill_time)
             VALUES ($1, $2, $3)
             ON CONFLICT (key)
             DO UPDATE SET tokens = $2, last_refill_time = $3`,
            [key, this.bucketCapacity, now]
        );
    }

    async resetAll(): Promise<void> {
        await this.pool.query('DELETE FROM token_buckets');
    }

    shutdown(): void {
        // Close the PostgreSQL connection pool
        this.pool.end();
    }
}
