# zzz-Secure


## Acknowledgments

This package was inspired by the [express-rate-limit](https://github.com/nfriedly/express-rate-limit) package. Many design patterns and ideas were adapted and extended from this excellent library.

## Fixed Window Algorithm Rate limiting Usage

Basic rate-limiting middleware for [Express](http://expressjs.com/). Use to limit repeated requests to public APIs and/or endpoints such as password reset.

```ts
import { FixedWindow } from 'z-secure'

const limiter = FixedWindow({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
    // store: ... , // Redis, Postgres, In-Memory, etc. See below.
})



// Apply the rate limiting middleware to all requests.
app.use(limiter)
```

```ts
import { FixedWindow, RedisFixedWindowStore } from 'z-secure'
import Redis, { Redis as RedisClient } from 'ioredis';

const redisClient = new RedisClient({
    host: 'localhost',
    port: 6379,
    password: 'your_password'
});

const store = new RedisFixedWindowStore({
    client: redisClient,
});

const limiter = FixedWindow({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
    store : store,
})

// Apply the rate limiting middleware to all requests.
app.use(limiter)
```


```ts
import { FixedWindow, PostgresFixedWindowStore } from 'z-secure'
import {pg} from 'pg';

const pool = new pg.Pool({
    user: 'your_user',
    host: 'localhost',
    database: 'your_database',
    password: 'your_password',
    port: 5432,
});

const store = new PostgresFixedWindowStore({
    pool: pool,
});

const limiter = FixedWindow({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
    store : store,
})

// Apply the rate limiting middleware to all requests.
app.use(limiter)
```




### Data Stores

The rate limiter comes with a built-in memory store, and supports Postgres and Redis also.

### Configuration for Fixed Window Algorithm

All function options may be async. Click the name for additional info and default values.

| Option                     | Type                                      | Remarks                                                                                         |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`windowMs`]               | `number`                                  | How long to remember requests for, in milliseconds.                                             |
| [`limit`]                  | `number` \| `function`                    | How many requests to allow.                                                                     |
| [`message`]                | `string` \| `json` \| `function`          | Response to return after limit is reached.                                                      |
| [`statusCode`]             | `number`                                  | HTTP status code after limit is reached (default is 429).                                       |
| [`handler`]                | `function`                                | Function to run after limit is reached (overrides `message` and `statusCode` settings, if set). |                                                             |
| [`standardHeaders`]        | `'draft-6'` \| `'draft-7'` \| `'draft-8'` | Enable the `Ratelimit` header.                                                                  |
| [`identifier`]             | `string` \| `function`                    | Name associated with the quota policy enforced by this rate limiter.                            |
| [`store`]                  | `Store`                                   | Use a custom store to share hit counts across multiple nodes.                                   |
| [`passOnStoreError`]       | `boolean`                                 | Allow (`true`) or block (`false`, default) traffic if the store becomes unavailable.            |
| [`keyGenerator`]           | `function`                                | Identify users (defaults to IP address).                                                        |
| [`requestPropertyName`]    | `string`                                  | Add rate limit info to the `req` object.                                                        |
| [`skip`]                   | `function`                                | Return `true` to bypass the limiter for the given request.                                      |
| [`skipSuccessfulRequests`] | `boolean`                                 | Uncount 1xx/2xx/3xx responses.                                                                  |
| [`skipFailedRequests`]     | `boolean`                                 | Uncount 4xx/5xx responses.                                                                      |
| [`requestWasSuccessful`]   | `function`                                | Used by `skipSuccessfulRequests` and `skipFailedRequests`.                                      |
| [`validate`]               | `boolean` \| `object`                     | Enable or disable built-in validation checks.                                                   |


# Shield usage for Basic web attack protections

## Basic Web Attack Protections Usage

Basic middleware for [Express](http://expressjs.com/) to protect against common web attacks such as XSS, SQL Injection, and others.

```ts
import { Shield } from 'z-secure'
import {RedisShieldStore, PostgresShieldStore} from 'z-secure'
import {pg} from 'pg';                                        // to use Postgres store option for persistant memory
import Redis, { Redis as RedisClient } from 'ioredis';       // to use Redis store option

const redisClient = new RedisClient({
    host: 'localhost',
    port: 6379,
    password: 'your_password'
});

const redisStore = new RedisShieldStore({
    client: redisClient,
});

const pool = new pg.Pool({
    user: 'your_user',
    host: 'localhost',
    database: 'your_database',
    password: 'your_password',
    port: 5432,
});

const postgresStore = new PostgresShieldStore({
    pool: pool,
});

const shield = Shield({
    xssProtection: true, // Enable XSS protection
    sqlInjectionProtection: true, // Enable SQL Injection protection
    // store : redisStore   for distributed servers
    //store : postgresStore     for persistant memory
    // by default Shield uses in-Memory storage or server
})

// Apply the protection middleware to all requests.
app.use(shield)
```

### Configuration for Shield

All function options may be async. Click the name for additional info and default values.

| Option                     | Type                                      | Remarks                                                                                         |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`localFileInclusionProtection`] | `boolean` | Enable or disable Local File Inclusion protection. |
| [`xss`]          | `boolean`                                 | Enable or disable XSS protection.                                                               |
| [`sqlInjection`] | `boolean`                                 | Enable or disable SQL Injection protection.                                                     |
| [`customProtection`]       | `function`                                | Add custom protection logic.                                                                    |
| [`logFunction`]            | `function`                                | Custom function to log attacks.                                                                 |
| [`suspicionThreshold`]     | `number`                                  | Number of suspicious requests before blocking.                                                  |
| [`blockDurationMs`]        | `number`                                  | Duration to block the IP in milliseconds.                                                       |
| [`detectionPatterns`]      | `Array<RegExp>`                           | Patterns to detect attacks.                                                                     |
| [`message`]                | `string`                                  | Message to return when a request is blocked.                                                    |
| [`csrf`]                   | `boolean`                                 | Enable or disable CSRF protection.                                                              |
| [`rfi`]                    | `boolean`                                 | Enable or disable Remote File Inclusion protection.                                             |
| [`shellInjection`]         | `boolean`                                 | Enable or disable Shell Injection protection.                                                   |
| [`store`]                  | `StoreInterface`                          | Use a custom store for persistent storage.                                                      |



