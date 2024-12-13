export const scripts = {
    increment : `-- Lua script to increment the score and handle blocking logic
local key = KEYS[1]
local suspicionThreshold = tonumber(ARGV[1])
local blockDurationMs = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

-- Get the current value from Redis
local value = redis.call('HGET', key, 'score')
local expiry = redis.call('HGET', key, 'expiry')
local isBlocked = redis.call('HGET', key, 'isBlocked')

local now = tonumber(redis.call('TIME')[1]) * 1000 -- Current time in milliseconds

if not value or tonumber(expiry) <= now then
  -- Key does not exist or expired, reset to 1 and set expiry
  redis.call('HMSET', key, 'score', 1, 'expiry', now + ttl, 'isBlocked', 'false')
  return 1
else
  -- Increment the score
  value = tonumber(value) + 1

  if value >= suspicionThreshold then
    -- Block the client
    redis.call('HMSET', key, 'score', value, 'expiry', now + blockDurationMs, 'isBlocked', 'true')
  else
    -- Update expiry and score
    redis.call('HMSET', key, 'score', value, 'expiry', now + ttl)
  end

  return value
end
`,
    flushExpired : `-- Lua script to delete expired keys
local now = tonumber(redis.call('TIME')[1]) * 1000 -- Current time in milliseconds

local keys = redis.call('KEYS', '*') -- Get all keys (consider optimizing based on patterns)
local deleted = 0

for _, key in ipairs(keys) do
  local expiry = redis.call('HGET', key, 'expiry')
  if tonumber(expiry) <= now then
    redis.call('DEL', key)
    deleted = deleted + 1
  end
end

return deleted
`
}