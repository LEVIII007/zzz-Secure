import { Pool } from 'pg'; // PostgreSQL client library
import type { Store, Options, ClientRateLimitInfo } from '../types';

export default class PostgresFixedWindowStore implements Store {
  private pool: Pool;
  private windowMs!: number;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // Initialize the rate limit store by creating the table if it doesn't exist
  async init(options: Options): Promise<void> {
    this.windowMs = options.windowMs;

    // Ensure the database has the required table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limit (
        key TEXT PRIMARY KEY,
        total_hits INT NOT NULL,
        reset_time TIMESTAMP NOT NULL
      )
    `);
  }

  // Get the rate limit information for a specific key
  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const result = await this.pool.query(
      'SELECT total_hits, reset_time FROM rate_limit WHERE key = $1',
      [key]
    );

    if (result.rows.length > 0) {
      const { total_hits, reset_time } = result.rows[0];
      const now = new Date();

      // Reset if the window has expired
      if (new Date(reset_time).getTime() <= now.getTime()) {
        await this.resetKey(key); // Reset expired key
        return { totalHits: 0, resetTime: new Date(now.getTime() + this.windowMs) };
      }

      return { totalHits: total_hits, resetTime: new Date(reset_time) };
    }
    return undefined;
  }

  // Increment the total hit count for a specific key
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);

    await this.pool.query('BEGIN'); // Start a transaction

    try {
      const result = await this.pool.query(
        'SELECT total_hits, reset_time FROM rate_limit WHERE key = $1 FOR UPDATE',
        [key]
      );

      let totalHits;
      if (result.rows.length > 0) {
        const { total_hits, reset_time } = result.rows[0];

        if (new Date(reset_time).getTime() <= now.getTime()) {
          // Reset if the window has expired
          totalHits = 1;
          await this.pool.query(
            'UPDATE rate_limit SET total_hits = $1, reset_time = $2 WHERE key = $3',
            [totalHits, resetTime, key]
          );
        } else {
          // Increment hit count
          totalHits = total_hits + 1;
          await this.pool.query(
            'UPDATE rate_limit SET total_hits = $1 WHERE key = $2',
            [totalHits, key]
          );
        }
      } else {
        // Create a new record if the key doesn't exist
        totalHits = 1;
        await this.pool.query(
          'INSERT INTO rate_limit (key, total_hits, reset_time) VALUES ($1, $2, $3)',
          [key, totalHits, resetTime]
        );
      }

      await this.pool.query('COMMIT'); // Commit the transaction

      return { totalHits, resetTime };
    } catch (err) {
      await this.pool.query('ROLLBACK'); // Rollback the transaction in case of error
      throw err;
    }
  }

  // Decrement the hit count for a specific key, ensuring it's never less than zero
  async decrement(key: string): Promise<void> {
    await this.pool.query(
      'UPDATE rate_limit SET total_hits = GREATEST(total_hits - 1, 0) WHERE key = $1',
      [key]
    );
  }

  // Reset the rate limit information for a specific key
  async resetKey(key: string): Promise<void> {
    await this.pool.query('DELETE FROM rate_limit WHERE key = $1', [key]);
  }

  // Reset all keys and clear the rate limit table
  async resetAll(): Promise<void> {
    await this.pool.query('TRUNCATE TABLE rate_limit');
  }

  // Gracefully shut down the store and close the connection pool
  async shutdown(): Promise<void> {
    await this.pool.end();
  }
}
