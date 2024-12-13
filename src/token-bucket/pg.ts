import { Pool } from 'pg'; // PostgreSQL client library
import type { BucketOptions, ClientRateLimitInfo, BucketStore } from '../types';

export default class PostgresTokenBucketStore implements BucketStore {
  private pool: Pool;
  private windowMs!: number;  // Time window in milliseconds
  private maxTokens!: number;  // Max number of tokens in the bucket
  private refillRate!: number;  // Number of tokens to refill per window

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // Initialize the token bucket store by creating the table if it doesn't exist
  async init(options: BucketOptions): Promise<void> {
    this.windowMs = options.windowMs;
    this.maxTokens = options.maxTokens ?? 0;
    this.refillRate = options.refillRate ?? 0;

    // Ensure the database has the required table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS token_bucket (
        key TEXT PRIMARY KEY,
        tokens INT NOT NULL,
        last_refill TIMESTAMP NOT NULL
      )
    `);
  }

  // Get the token bucket information for a specific key
  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const result = await this.pool.query(
      'SELECT tokens, last_refill FROM token_bucket WHERE key = $1',
      [key]
    );

    if (result.rows.length > 0) {
      const { tokens, last_refill } = result.rows[0];
      const now = new Date();

      // Refill the tokens if the window has passed
      const timeSinceLastRefill = now.getTime() - new Date(last_refill).getTime();
      const refillTokens = Math.floor(timeSinceLastRefill / this.windowMs) * this.refillRate;
      const newTokens = Math.min(tokens + refillTokens, this.maxTokens);  // Max token capacity

      // If the bucket was refilled, update the tokens and last refill time
      if (newTokens !== tokens) {
        await this.pool.query(
          'UPDATE token_bucket SET tokens = $1, last_refill = $2 WHERE key = $3',
          [newTokens, now, key]
        );
      }

      // Return the current state of the bucket
      return { totalHits: newTokens, resetTime: new Date(now.getTime() + this.windowMs) };
    }
    return undefined;
  }

  // Increment the tokens based on refill rate and time passed
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();

    await this.pool.query('BEGIN'); // Start a transaction

    try {
      const result = await this.pool.query(
        'SELECT tokens, last_refill FROM token_bucket WHERE key = $1 FOR UPDATE',
        [key]
      );

      if (result.rows.length > 0) {
        const { tokens, last_refill } = result.rows[0];

        // Calculate how many tokens should be refilled
        const timeSinceLastRefill = now.getTime() - new Date(last_refill).getTime();
        const refillTokens = Math.floor(timeSinceLastRefill / this.windowMs) * this.refillRate;
        const newTokens = Math.min(tokens + refillTokens, this.maxTokens);

        // If the bucket was refilled, update the tokens and last refill time
        if (newTokens !== tokens) {
          await this.pool.query(
            'UPDATE token_bucket SET tokens = $1, last_refill = $2 WHERE key = $3',
            [newTokens, now, key]
          );
        }

        await this.pool.query('COMMIT'); // Commit the transaction
        return { totalHits: newTokens, resetTime: new Date(now.getTime() + this.windowMs) };  // Tokens after increment
      } else {
        // Create a new token bucket if the key doesn't exist
        await this.pool.query(
          'INSERT INTO token_bucket (key, tokens, last_refill) VALUES ($1, $2, $3)',
          [key, this.maxTokens, now]  // Start with max tokens available
        );

        await this.pool.query('COMMIT'); // Commit the transaction
        return { totalHits: this.maxTokens, resetTime: new Date(now.getTime() + this.windowMs) };  // Tokens after increment
      }
    } catch (err) {
      await this.pool.query('ROLLBACK'); // Rollback the transaction in case of error
      throw err;
    }
  }

  // Decrement the tokens (consume one token) for a specific key
  async decrement(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();

    await this.pool.query('BEGIN'); // Start a transaction

    try {
      const result = await this.pool.query(
        'SELECT tokens, last_refill FROM token_bucket WHERE key = $1 FOR UPDATE',
        [key]
      );

      if (result.rows.length > 0) {
        const { tokens, last_refill } = result.rows[0];

        // Calculate how many tokens should be refilled
        const timeSinceLastRefill = now.getTime() - new Date(last_refill).getTime();
        const refillTokens = Math.floor(timeSinceLastRefill / this.windowMs) * this.refillRate;
        const newTokens = Math.min(tokens + refillTokens, this.maxTokens);

        // If the bucket was refilled, update the tokens and last refill time
        if (newTokens !== tokens) {
          await this.pool.query(
            'UPDATE token_bucket SET tokens = $1, last_refill = $2 WHERE key = $3',
            [newTokens, now, key]
          );
        }

        // Check if there are enough tokens to decrement
        if (newTokens > 0) {
          await this.pool.query(
            'UPDATE token_bucket SET tokens = $1 WHERE key = $2',
            [newTokens - 1, key]
          );
          await this.pool.query('COMMIT'); // Commit the transaction
          return { totalHits: newTokens - 1, resetTime: new Date(now.getTime() + this.windowMs) };  // Token successfully consumed
        }
      } else {
        // Create a new token bucket if the key doesn't exist
        await this.pool.query(
          'INSERT INTO token_bucket (key, tokens, last_refill) VALUES ($1, $2, $3)',
          [key, this.maxTokens - 1, now]  // Start with one token available
        );
      }

      await this.pool.query('COMMIT'); // Commit the transaction
      return { totalHits: 0, resetTime: new Date(now.getTime() + this.windowMs) };  // Not enough tokens to decrement
    } catch (err) {
      await this.pool.query('ROLLBACK'); // Rollback the transaction in case of error
      throw err;
    }
  }

  // Reset the token bucket for a specific key
  async resetKey(key: string): Promise<void> {
    await this.pool.query('DELETE FROM token_bucket WHERE key = $1', [key]);
  }

  // Reset all keys and clear the token bucket table
  async resetAll(): Promise<void> {
    await this.pool.query('TRUNCATE TABLE token_bucket');
  }

  // Gracefully shut down the store and close the connection pool
  async shutdown(): Promise<void> {
    await this.pool.end();
  }
}
