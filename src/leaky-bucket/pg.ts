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
 * A Store that implements the Leaky Bucket algorithm for rate limiting in PostgreSQL.
 */
export default class PostgresLeakyBucketStore implements Store {
  private pool: Pool;
  private windowMs!: number;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initializes the store by creating the Leaky_bucket table if it doesn't already exist.
   * @param options {Options} - Configuration options for the store.
   */
  async init(options: Options): Promise<void> {
    this.windowMs = options.windowMs;

    // Create the Leaky_bucket table if it doesn't already exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS Leaky_bucket (
        client_id TEXT PRIMARY KEY,
        remaining_capacity FLOAT NOT NULL,
        last_updated TIMESTAMP NOT NULL,
        bucket_capacity FLOAT NOT NULL,
        leak_rate FLOAT NOT NULL
      )
    `);
    console.debug('Leaky bucket table verified or created successfully.');
  }

  /**
   * Retrieves the current rate limit information for a client.
   * @param key {string} - The identifier for a client.
   * @returns {ClientRateLimitInfo | undefined} - The rate limit info, or undefined if not found.
   */
  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const result = await this.pool.query(
      `SELECT remaining_capacity, last_updated, bucket_capacity, leak_rate
       FROM Leaky_bucket
       WHERE client_id = $1`,
      [key]
    );

    if (result.rows.length > 0) {
      const { remaining_capacity, last_updated, bucket_capacity, leak_rate } = result.rows[0];
      const now = Date.now();

      // Calculate how much capacity has leaked since the last update
      const elapsedTime = now - new Date(last_updated).getTime();
      const leaked = elapsedTime * leak_rate;
      const newRemaining = Math.min(remaining_capacity + leaked, bucket_capacity);

      return {
        totalHits: newRemaining,
        resetTime: new Date(new Date(last_updated).getTime() + bucket_capacity / leak_rate),
      };
    }

    return undefined;
  }

  /**
   * Increments a client's hit counter or creates a new record if the client doesn't exist.
   * @param key {string} - The identifier for a client.
   * @returns {ClientRateLimitInfo} - The updated rate limit info for the client.
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();

    await this.pool.query('BEGIN'); // Start a transaction

    try {
      const result = await this.pool.query(
        `SELECT remaining_capacity, last_updated, bucket_capacity, leak_rate
         FROM Leaky_bucket
         WHERE client_id = $1 FOR UPDATE`,
        [key]
      );

      let totalHits: number;
      let resetTime: Date;

      if (result.rows.length > 0) {
        const { remaining_capacity, last_updated, bucket_capacity, leak_rate } = result.rows[0];

        // Calculate leakage since the last update
        const elapsedTime = now.getTime() - new Date(last_updated).getTime();
        const leaked = elapsedTime * leak_rate;
        const newRemaining = Math.min(remaining_capacity + leaked, bucket_capacity);

        if (newRemaining > 0) {
          totalHits = newRemaining - 1;
          await this.pool.query(
            `UPDATE Leaky_bucket
             SET remaining_capacity = $1, last_updated = $2
             WHERE client_id = $3`,
            [totalHits, now, key]
          );
          resetTime = new Date(now.getTime() + bucket_capacity / leak_rate);
        } else {
          totalHits = 0;
          resetTime = new Date(now.getTime() + bucket_capacity / leak_rate);
        }
      } else {
        // Insert a new record if client doesn't exist
        const bucketCapacity = 10; // Default bucket capacity
        const leakRate = 0.1; // Default leak rate

        totalHits = bucketCapacity - 1;
        resetTime = new Date(now.getTime() + bucketCapacity / leakRate);

        await this.pool.query(
          `INSERT INTO Leaky_bucket (client_id, remaining_capacity, last_updated, bucket_capacity, leak_rate)
           VALUES ($1, $2, $3, $4, $5)`,
          [key, totalHits, now, bucketCapacity, leakRate]
        );
      }

      await this.pool.query('COMMIT'); // Commit the transaction

      return { totalHits, resetTime };
    } catch (err) {
      await this.pool.query('ROLLBACK'); // Rollback the transaction in case of error
      throw err;
    }
  }

  /**
   * Decrements the remaining capacity for a client.
   * @param key {string} - The identifier for a client.
   */
  async decrement(key: string): Promise<void> {
    const now = new Date();

    await this.pool.query('BEGIN'); // Start a transaction

    try {
      const result = await this.pool.query(
        `SELECT remaining_capacity, last_updated, bucket_capacity, leak_rate
         FROM Leaky_bucket
         WHERE client_id = $1 FOR UPDATE`,
        [key]
      );

      if (result.rows.length > 0) {
        const { remaining_capacity, last_updated, bucket_capacity, leak_rate } = result.rows[0];

        // Calculate leakage since the last update
        const elapsedTime = now.getTime() - new Date(last_updated).getTime();
        const leaked = elapsedTime * leak_rate;
        const newRemaining = Math.min(remaining_capacity + leaked, bucket_capacity);

        if (newRemaining > 0) {
          const updatedRemaining = newRemaining - 1;
          await this.pool.query(
            `UPDATE Leaky_bucket
             SET remaining_capacity = $1, last_updated = $2
             WHERE client_id = $3`,
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

  /**
   * Resets the hit counter for a specific client.
   * @param key {string} - The identifier for a client.
   */
  async resetKey(key: string): Promise<void> {
    await this.pool.query(`DELETE FROM Leaky_bucket WHERE client_id = $1, [key]`);
  }

  /**
   * Resets the hit counters for all clients.
   */
  async resetAll(): Promise<void> {
    await this.pool.query(`TRUNCATE TABLE Leaky_bucket`);
  }

  /**
   * Shuts down the PostgreSQL connection pool.
   */
  async shutdown(): Promise<void> {
    await this.pool.end();
  }
}