import express from "express";
import Redis, { Redis as RedisClient } from "ioredis";
import {
  ZShield,
  ShieldMemoryStore,
  RedisShieldStore,
  PostgresShieldStore,
  PostgresFixedWindowStore,
  PostgresLeakyBucketStore,
  PostgresTokenBucketStore,
  LeakyBucket,
  FixedWindow,
  tokenBucket,
  MemoryFixedWindowStore,
  MemoryLeakyBucketStore,
  MemoryTokenBucketStore,
  RedisTokenBucketStore,
  RedisFixedWindowStore,
} from "../src/index";

import { Pool } from "pg";

const app = express();


// Configure PostgreSQL connection pool
const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Initialize the PostgreSQL-backed rate-limiting store
const pgStore = new PostgresLeakyBucketStore(pool);
const pgStore1 = new PostgresTokenBucketStore(pool);
const pgStore2 = new PostgresShieldStore(pool);

// Define rate-limiting strategy (e.g., Fixed Window)
//   const fw = FixedWindow({
//     windowMs: 10000, // 15 seconds
//     limit: 3,        // Allow 3 requests per window
//     store: pgStore,  // Use PostgreSQL store
//   });



// const fw = FixedWindow({
//     windowMs: 15000,
//     limit: 3
// });

// const redisClient = new Redis()
// const store = new RedisStore({
//   client: redisClient,
//   prefix: 'myapp:rate-limit:',
//   windowMs: 60000, // 1 minute
//   resetExpiryOnChange: true
// })

// const tb =  tokenBucket({
//     refillRate:1,
//     maxTokens:5,
//     store : pgStore1
// });
const lb = new LeakyBucket({
    capacity: 5,
    timeout: 10000,
    interval: 10000,
    store : pgStore
});

app.use('/lb', lb.rateLimitMiddleware);
// app.use('/fw', fw);
// app.use('/tb', tb);

// const shield = new ZShield({ store: pgStore2 });

// app.use(shield.middleware);

app.get("/tb", (req, res) => {
  res.send({
    status: "ok",
  });
});

app.get("/fw", (req, res) => {
  res.send({
    status: "ok",
  });
});

app.post("/lb", (req, res) => {
  res.send({
    status: "ok",
  });
});
// app.get('/sh', (req, res) => {
//     res.send({
//         status: "ok"
//     });
// });
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
