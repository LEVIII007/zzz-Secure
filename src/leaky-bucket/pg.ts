import { Pool } from 'pg'; // PostgreSQL client library
import type { Store, Options, ClientRateLimitInfo } from '../types';

/**
 * The record that stores information about a client - namely, the remaining capacity
 * and the last time it was updated.
 */
type Client = {
  remaining: number;
  lastUpdated: number;
  bucketCapacity: number;
  leakRate: number;
};

/**
 * A `Store` that implements the Leaky Bucket algorithm for rate limiting in PostgreSQL.
 */
export default class PostgresLeakyBucketStore implements Store {
  private pool: Pool;
  private windowMs!: number;

  constructor(pool: Pool) {
    this.pool = pool;
  }
 
    async decrement(key: string): Promise<void> {
        const now = new Date();

        await this.pool.query('BEGIN'); // Start a transaction

        try {
            const result = await this.pool.query(
                'SELECT remaining_capacity, last_updated, bucket_capacity, leak_rate FROM rate_limit WHERE client_id = $1 FOR UPDATE',
                [key]
            );

            if (result.rows.length > 0) {
                const { remaining_capacity, last_updated, bucket_capacity, leak_rate } = result.rows[0];

                // Calculate the leakage since the last update
                const elapsedTime = now.getTime() - new Date(last_updated).getTime();
                const leaked = elapsedTime * leak_rate;
                const newRemaining = Math.min(remaining_capacity + leaked, bucket_capacity);

                if (newRemaining > 0) {
                    // Decrement the remaining capacity
                    const updatedRemaining = newRemaining - 1;
                    await this.pool.query(
                        'UPDATE rate_limit SET remaining_capacity = $1, last_updated = $2 WHERE client_id = $3',
                        [updatedRemaining, now, key]
                    );
                }
            }

            await this.pool.query('COMMIT'); // Commit the transaction
        } catch (err) {
            await this.pool.query('ROLLBACK'); // Rollback the transaction in case of error
            throw err;
        }
    }
    localKeys?: boolean | undefined;
    prefix?: string | undefined;

  async init(options: Options): Promise<void> {
    this.windowMs = options.windowMs;

    // Ensure the database has the required table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limit (
        client_id TEXT PRIMARY KEY,
        remaining_capacity INT NOT NULL,
        last_updated TIMESTAMP NOT NULL,
        bucket_capacity INT NOT NULL,
        leak_rate FLOAT NOT NULL
      )
    `);
  }

  /**
   * Retrieves the current rate limit information for a client.
   * @param key {string} - The identifier for a client.
   * @returns {ClientRateLimitInfo | undefined} - The remaining capacity and reset time for the client.
   */
  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const result = await this.pool.query(
      'SELECT remaining_capacity, last_updated, bucket_capacity, leak_rate FROM rate_limit WHERE client_id = $1',
      [key]
    );

    if (result.rows.length > 0) {
      const { remaining_capacity, last_updated, bucket_capacity, leak_rate } = result.rows[0];

      // Calculate how much capacity has leaked since the last update
      const now = Date.now();
      const elapsedTime = now - new Date(last_updated).getTime();
      const leaked = elapsedTime * leak_rate;
      const newRemaining = Math.min(remaining_capacity + leaked, bucket_capacity);

      // Return updated remaining capacity and reset time
      return {
        // +++++++++++++++++++++++++++++++
         totalHits: newRemaining,
        resetTime: new Date(new Date(last_updated).getTime() + bucket_capacity / leak_rate)
      };
    }

    return undefined;
  }

  /**
   * Increments a client's hit counter.
   * @param key {string} - The identifier for a client.
   * @returns {ClientRateLimitInfo} - The updated remaining capacity and reset time for the client.
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    let totalHits: number;
    let resetTime: Date;

    await this.pool.query('BEGIN'); // Start a transaction

    try {
      const result = await this.pool.query(
        'SELECT remaining_capacity, last_updated, bucket_capacity, leak_rate FROM rate_limit WHERE client_id = $1 FOR UPDATE',
        [key]
      );

      if (result.rows.length > 0) {
        const { remaining_capacity, last_updated, bucket_capacity, leak_rate } = result.rows[0];

        // Calculate the leakage since the last update
        const elapsedTime = now.getTime() - new Date(last_updated).getTime();
        const leaked = elapsedTime * leak_rate;
        const newRemaining = Math.min(remaining_capacity + leaked, bucket_capacity);

        if (newRemaining <= 0) {
          // If no remaining capacity, return 0 with reset time
          totalHits = 0;
          resetTime = new Date(new Date(last_updated).getTime() + bucket_capacity / leak_rate);
        } else {
          // Increment the hit count and decrease remaining capacity
          totalHits = newRemaining - 1;
          await this.pool.query(
            'UPDATE rate_limit SET remaining_capacity = $1, last_updated = $2 WHERE client_id = $3',
            [totalHits, now, key]
          );
          resetTime = new Date(now.getTime() + bucket_capacity / leak_rate);
        }
      } else {
        // Create a new record if the client doesn't exist
        const bucket_capacity = 10; // Set a default value or retrieve it from options
        const leak_rate = 0.1; // Set a default value or retrieve it from options

        totalHits = 1;
        resetTime = new Date(now.getTime() + bucket_capacity / leak_rate);

        await this.pool.query(
          'INSERT INTO rate_limit (client_id, remaining_capacity, last_updated, bucket_capacity, leak_rate) VALUES ($1, $2, $3, $4, $5)',
          [key, totalHits, now, bucket_capacity, leak_rate]
        );
      }

      await this.pool.query('COMMIT'); // Commit the transaction

      return { 

        // "++++++++++++++++++++++++++++++"
        totalHits: totalHits, 
        resetTime };
    } catch (err) {
      await this.pool.query('ROLLBACK'); // Rollback the transaction in case of error
      throw err;
    }
  }

  /**
   * Resets the hit counter for a specific client.
   * @param key {string} - The identifier for a client.
   */
  async resetKey(key: string): Promise<void> {
    await this.pool.query('DELETE FROM rate_limit WHERE client_id = $1', [key]);
  }

  /**
   * Resets the hit counters for all clients.
   */
  async resetAll(): Promise<void> {
    await this.pool.query('TRUNCATE TABLE rate_limit');
  }

  /**
   * Shuts down the PostgreSQL connection pool.
   */
  async shutdown(): Promise<void> {
    await this.pool.end();
  }
}
