import scripts from '../fixed-window/scripts'
import { Store } from '../types'
import Redis, { Redis as RedisClient } from 'ioredis';

interface RedisStoreOptions {
  client: RedisClient
  prefix?: string
  windowMs?: number
  resetExpiryOnChange?: boolean
}

export default class FixedWindowRedisStore implements Store {
  public client: RedisClient
  public prefix: string
  public windowMs: number
  public resetExpiryOnChange: boolean

  localKeys = false

  constructor(options: RedisStoreOptions) {
    this.client = options.client
    this.prefix = options.prefix ?? 'rl:'
    this.windowMs = options.windowMs ?? 60000 // default 1 minute
    this.resetExpiryOnChange = options.resetExpiryOnChange ?? false
  }

  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs
  }

  private prefixKey(key: string): string {
    return `${this.prefix}${key}`
  }

  async get(key: string) {
    const results = await this.client.eval(
      scripts.get,
      1,
      this.prefixKey(key)
    )

    if (!Array.isArray(results)) 
      throw new TypeError('Expected result to be array of values')

    if (results.length !== 2)
      throw new Error(`Expected 2 replies, got ${results.length}`)

    const totalHits = results[0] === false ? 0 : Number(results[0])
    const timeToExpire = Number(results[1])

    return {
      totalHits,
      resetTime: new Date(Date.now() + timeToExpire)
    }
  }

    async increment(key: string) {
      console.log("redis used!!!")
      const results = await this.client.eval(
        scripts.increment,
        1,
        this.prefixKey(key),
        this.resetExpiryOnChange ? '1' : '0',
        this.windowMs.toString()
      )
  
      if (!Array.isArray(results)) 
        throw new TypeError('Expected result to be array of values')
  
      if (results.length !== 2)
        throw new Error(`Expected 2 replies, got ${results.length}`)
  
      const totalHits = results[0] === false ? 0 : Number(results[0])
      const timeToExpire = Number(results[1])
  
      return {
        totalHits,
        resetTime: new Date(Date.now() + timeToExpire)
      }
    }

  async decrement(key: string) {
    await this.client.decr(this.prefixKey(key))
  }

  async resetKey(key: string) {
    await this.client.del(this.prefixKey(key))
  }

  async resetAll() {
    // Find all keys with the prefix and delete them
    const keys = await this.client.keys(`${this.prefix}*`)
    if (keys.length > 0) {
      await this.client.del(...keys)
    }
  }

  async shutdown() {
    // If you need any cleanup, do it here
    // For ioredis, typically no special shutdown is needed
  }
}