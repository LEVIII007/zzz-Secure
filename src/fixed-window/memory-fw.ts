// /source/memory-store.ts
// A memory store for hit counts

import type { Store, Options, ClientRateLimitInfo } from '../types'

/**
 * The record that stores information about a client - namely, how many times
 * they have hit the endpoint, and when their hit count resets.
 *
 * Similar to `ClientRateLimitInfo`, except `resetTime` is a compulsory field.
 */
type Client = {
	totalHits: number
	resetTime: Date
}

/**
 * A `Store` that stores the hit count for each client in memory.
 *
 * @public
 */

export default class MemoryFixedWindowStore implements Store {
	/**
	 * The duration of the fixed window in milliseconds.
	 */
	windowMs!: number

	/**
	 * Stores client usage data. The key is the client identifier, such as an IP address.
	 */
	clients = new Map<string, Client>()

	/**
	 * A reference to the active timer that resets all clients after each window.
	 */
	interval?: NodeJS.Timeout

	/**
	 * Confirms that keys incremented in one instance of MemoryStore cannot affect others.
	 */
	localKeys = true

	/**
	 * Initializes the store and sets up the interval to clear data at the end of each window.
	 *
	 * @param options {Options} - Configuration options passed to the middleware.
	 */
	init(options: Options): void {
		this.windowMs = options.windowMs

		// Clear any previous interval if re-initialized
		if (this.interval) clearInterval(this.interval)

		// Set up the interval to reset all clients after `windowMs`
		this.interval = setInterval(() => this.resetAll(), this.windowMs)

		// Allow the interval to not prevent the process from exiting
		if (this.interval.unref) this.interval.unref()
	}

	/**
	 * Retrieves the hit count and reset time for a given client.
	 *
	 * @param key {string} - The client's unique identifier (e.g., IP).
	 *
	 * @returns {ClientRateLimitInfo | undefined} - The client's rate limit info.
	 */
	async get(key: string): Promise<ClientRateLimitInfo | undefined> {
		return this.clients.get(key)
	}

	/**
	 * Increments the hit counter for a client.
	 *
	 * @param key {string} - The client's unique identifier (e.g., IP).
	 *
	 * @returns {ClientRateLimitInfo} - The updated hit count and reset time for the client.
	 */
	async increment(key: string): Promise<ClientRateLimitInfo> {
		const now = Date.now()

		// Calculate the start and reset time of the current fixed window
		const windowStart = Math.floor(now / this.windowMs) * this.windowMs
		const resetTime = new Date(windowStart + this.windowMs)

		let client = this.clients.get(key)

		// If no client exists or reset time has passed, create a new client entry
		if (!client || client.resetTime.getTime() <= now) {
			client = { totalHits: 0, resetTime }
			this.clients.set(key, client)
		}

		// Increment the hit count
		client.totalHits++

		return client
	}

	/**
	 * Decrements the hit counter for a client.
	 *
	 * @param key {string} - The client's unique identifier (e.g., IP).
	 */
	async decrement(key: string): Promise<void> {
		const client = this.clients.get(key)
		if (client && client.totalHits > 0) client.totalHits--
	}

	/**
	 * Resets the hit counter for a specific client.
	 *
	 * @param key {string} - The client's unique identifier (e.g., IP).
	 */
	async resetKey(key: string): Promise<void> {
		this.clients.delete(key)
	}

	/**
	 * Clears all hit counters, effectively resetting the rate limit for all clients.
	 */
	async resetAll(): Promise<void> {
		this.clients.clear()
	}

	/**
	 * Stops the interval timer to prevent memory leaks.
	 */
	shutdown(): void {
		if (this.interval) clearInterval(this.interval)
		void this.resetAll()
	}
}

