const scripts = {
    /**
     * Increment script for rate limiting.
     * 
     * Parameters:
     * - KEYS[1]: the rate limit key
     * - ARGV[1]: reset expiry flag (1 or 0)
     * - ARGV[2]: window duration in milliseconds
     * - ARGV[3]: current timestamp (optional)
     */
    increment: `
      -- Get the current hits and timestamp
      local currentHits = redis.call("GET", KEYS[1])
      local currentTimestamp = tonumber(ARGV[3] or redis.call("TIME")[1] * 1000)
      local windowMs = tonumber(ARGV[2])
  
      -- If no hits or expired, reset
      if not currentHits or 
         (redis.call("PTTL", KEYS[1]) <= 0) or 
         (tonumber(currentHits) == 0) then
          
          -- Reset hits to 1 and set expiry
          redis.call("SET", KEYS[1], "1")
          redis.call("PEXPIRE", KEYS[1], windowMs)
          
          return {1, windowMs}
      end
  
      -- Increment hits
      local newHits = redis.call("INCR", KEYS[1])
  
      -- Optionally reset expiry on each change if flag is set
      if ARGV[1] == "1" then
          redis.call("PEXPIRE", KEYS[1], windowMs)
      end
  
      -- Get remaining time to expire
      local timeToExpire = redis.call("PTTL", KEYS[1])
  
      return {newHits, timeToExpire}
    `
    .replaceAll(/^\s+/gm, '')
    .trim(),
  
    /**
     * Get script for retrieving current rate limit status.
     * 
     * Parameters:
     * - KEYS[1]: the rate limit key
     */
    get: `
      -- Get the current hits
      local totalHits = redis.call("GET", KEYS[1])
      
      -- Get time to expire
      local timeToExpire = redis.call("PTTL", KEYS[1])
      
      -- Return hits and expiration time
      return {totalHits or 0, timeToExpire}
    `
    .replaceAll(/^\s+/gm, '')
    .trim(),
  
    /**
     * Decrement script for rate limiting.
     * 
     * Parameters:
     * - KEYS[1]: the rate limit key
     */
    decrement: `
      -- Decrement hits if key exists and hits are > 0
      local currentHits = redis.call("GET", KEYS[1])
      
      if currentHits and tonumber(currentHits) > 0 then
          local newHits = redis.call("DECR", KEYS[1])
          return {newHits, redis.call("PTTL", KEYS[1])}
      end
      
      return {0, redis.call("PTTL", KEYS[1]) or 0}
    `
    .replaceAll(/^\s+/gm, '')
    .trim()
  }
  
  // Export scripts for use in Redis store implementation
  export default scripts