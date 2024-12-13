import { Pool } from 'pg';
import { StoreInterface } from './memoryInterface';

type StoreValue = { score: number; expiry: number; isBlocked: boolean };

export class PostgresStore implements StoreInterface {
	private pool: Pool;
	private suspicionThreshold: number;
	private blockDurationMs: number;

	constructor(
		pool: Pool,
		suspicionThreshold = 5,
		blockDurationMs = 60000
	) {
		this.pool = pool;
		this.suspicionThreshold = suspicionThreshold;
		this.blockDurationMs = blockDurationMs;
	}

	async set(key: string, score: number, ttl: number): Promise<void> {
		const expiry = Date.now() + ttl;
		await this.pool.query(
			`INSERT INTO rate_limit_store (key, score, expiry, is_blocked)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (key)
			 DO UPDATE SET score = $2, expiry = $3, is_blocked = $4`,
			[key, score, expiry, false]
		);
	}

	async get(key: string): Promise<StoreValue | undefined> {
		const result = await this.pool.query(
			`SELECT score, expiry, is_blocked AS "isBlocked" FROM rate_limit_store WHERE key = $1`,
			[key]
		);
		const row = result.rows[0];
		if (row && row.expiry > Date.now()) {
			return row;
		}
		return undefined;
	}

	async increment(key: string, ttl: number): Promise<number> {
		const now = Date.now();
		const result = await this.pool.query(
			`SELECT score, expiry, is_blocked AS "isBlocked" FROM rate_limit_store WHERE key = $1`,
			[key]
		);

		if (!result.rows[0] || result.rows[0].expiry <= now) {
			// Key does not exist or has expired
			await this.set(key, 1, ttl);
			return 1;
		}

		const { score, expiry } = result.rows[0];
		const newScore = score + 1;
		let isBlocked = false;
		let newExpiry = now + ttl;

		if (newScore >= this.suspicionThreshold) {
			isBlocked = true;
			newExpiry = now + this.blockDurationMs;
		}

		await this.pool.query(
			`UPDATE rate_limit_store SET score = $1, expiry = $2, is_blocked = $3 WHERE key = $4`,
			[newScore, newExpiry, isBlocked, key]
		);

		return newScore;
	}

	async delete(key: string): Promise<void> {
		await this.pool.query(`DELETE FROM rate_limit_store WHERE key = $1`, [
			key,
		]);
	}

	async flushExpired(): Promise<void> {
		const now = Date.now();
		await this.pool.query(`DELETE FROM rate_limit_store WHERE expiry <= $1`, [
			now,
		]);
	}

	async isBlocked(key: string): Promise<boolean> {
		const result = await this.pool.query(
			`SELECT is_blocked AS "isBlocked", expiry FROM rate_limit_store WHERE key = $1`,
			[key]
		);
		const row = result.rows[0];
		return row && row.isBlocked && row.expiry > Date.now() ? true : false;
	}
}
