import { Pool } from 'pg';  // PostgreSQL client library
import { StoreInterface } from './memory/memoryInterface';

type StoreValue = { value: any; expiry: number };

/**
 * A Store implementation that uses PostgreSQL to store key-value pairs with expiration times.
 */
export class PostgresStore implements StoreInterface {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Sets a key-value pair in the PostgreSQL store with an expiration time.
   * @param key {string} - The key to store.
   * @param value {any} - The value to store.
   * @param ttl {number} - The time-to-live in milliseconds for the key-value pair.
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    const expiry = new Date(Date.now() + ttl);
    await this.pool.query(
      'INSERT INTO store (key, value, expiry) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, expiry = $3',
      [key, JSON.stringify(value), expiry]
    );
  }

  /**
   * Retrieves the value for a given key if it has not expired.
   * @param key {string} - The key to retrieve.
   * @returns {Promise<T | null>} - The value associated with the key, or null if expired or not found.
   */
  async get<T>(key: string): Promise<T | null> {
    const result = await this.pool.query(
      'SELECT value, expiry FROM store WHERE key = $1 AND expiry > NOW()',
      [key]
    );

    if (result.rows.length > 0) {
      const { value } = result.rows[0];
      return JSON.parse(value) as T;
    }

    return null;
  }

  /**
   * Deletes a key-value pair from the store.
   * @param key {string} - The key to delete.
   */
  async delete(key: string): Promise<void> {
    await this.pool.query('DELETE FROM store WHERE key = $1', [key]);
  }

  /**
   * Removes all expired entries from the store.
   */
  async flushExpired(): Promise<void> {
    await this.pool.query('DELETE FROM store WHERE expiry <= NOW()');
  }
}
