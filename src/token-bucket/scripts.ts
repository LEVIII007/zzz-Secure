// src/redis-store/lua-scripts.ts

export const LUA_SCRIPTS = {
  // Increment token bucket with atomic operation
  CONSUME_TOKEN: `
   local key = KEYS[1]
local now = tonumber(ARGV[1])
local refillInterval = tonumber(ARGV[2])
local bucketCapacity = tonumber(ARGV[3])
local tokensPerInterval = tonumber(ARGV[4])

-- Get current bucket state
local bucketState = redis.call('HMGET', key, 'tokens', 'lastRefillTime')
local currentTokens = tonumber(bucketState[1])
local lastRefillTime = tonumber(bucketState[2])

-- Initialize bucket for new keys
if not currentTokens or not lastRefillTime then
    currentTokens = bucketCapacity
    lastRefillTime = now
end

-- Calculate tokens to add
local elapsedTime = math.max(0, now - lastRefillTime)
local tokensToAdd = math.floor((elapsedTime / 1000) * tokensPerInterval)

-- Update tokens (not exceeding capacity)
local newTokens = math.min(currentTokens + tokensToAdd, bucketCapacity)

-- Consume token if available
local canConsume = newTokens > 0
if canConsume then
    newTokens = newTokens - 1
end

-- Update Redis
redis.call('HMSET', key, 
    'tokens', newTokens, 
    'lastRefillTime', now
)

-- Set expiry to keep the key fresh
redis.call('EXPIRE', key, math.ceil(bucketCapacity * refillInterval / 1000))

-- Return results: [canConsume, newTokens, nextResetTime]
return {
    canConsume and 1 or 0, 
    newTokens, 
    now + math.ceil(refillInterval)
}
   
  `,

  // Decrement token bucket (return tokens)
  RETURN_TOKEN: `
      local key = KEYS[1]
      local bucketCapacity = tonumber(ARGV[1])

      local currentTokens = tonumber(redis.call('HGET', key, 'tokens') or 0)
      local newTokens = math.min(currentTokens + 1, bucketCapacity)

      redis.call('HSET', key, 'tokens', newTokens)

      return newTokens
  `,

  // Reset a specific client's bucket
  RESET_CLIENT: `
      local key = KEYS[1]
      local bucketCapacity = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])

      redis.call('HMSET', key, 
          'tokens', bucketCapacity, 
          'lastRefillTime', now
      )

      return 1
  `
};