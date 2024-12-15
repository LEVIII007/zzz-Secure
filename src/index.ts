import tokenBucket from "./token-bucket/lib";
import FixedWindow from "./fixed-window/lib-fixed-window";
import express from "express";
import ZShield from "./shield/lib";
import { InMemoryStore } from "./shield/memory/inMemoryStore";
import Redis, { Redis as RedisClient } from 'ioredis';
import FixedWindowRedisStore from "./fixed-window/cache-memory";
import RedisTokenBucketStore from "./token-bucket/cache-memory";
import LeakyBucket from "./leaky-bucket/lib-lb"; // Assuming LeakyBucket is implemented like the others

const app = express();

// Initialize Redis client
// const redisClient = new Redis();

// Initialize stores
// const store = new FixedWindowRedisStore({ 
//   client: redisClient,
// });

// Initialize Fixed Window middleware
// const fw = FixedWindow({
//     windowMs: 15000,
//     limit: 3,
//     store: store, // Using Redis store for FixedWindow
// });

// // Initialize Token Bucket middleware
// const tb = tokenBucket({
//     maxTokens: 5,
//     refillRate: 1,
//     store: new RedisTokenBucketStore(redisClient) // Using Redis store for TokenBucket
// });

// Initialize Leaky Bucket middleware
const lb = new LeakyBucket({
    capacity: 5, // 5 tokens capacity
    interval: 10000, // 10 seconds interval for rate limiting 
    timeout: 10000,  // 10 seconds timeout for rate limiting
    
});

// app.use('/tb', tb);  // TokenBucket middleware for the '/tb' route
// app.use('/fw', fw);  // FixedWindow middleware for the '/fw' route
app.use('/lb',lb.rateLimitMiddleware);  // LeakyBucket middleware for the '/lb' route

app.use(express.json());

// Define routes for testing the rate limiters
app.get('/tb', (req, res) => {
    res.send({
        status: "ok",
    });
});

app.get('/fw', (req, res) => {
    res.send({
        status: "ok",
    });
});

app.post('/tb', (req, res) => {
    res.send({
        status: "ok",
    });
});

app.get('/lb', (req, res) => {
    res.send({
        status: "ok",
    });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;
