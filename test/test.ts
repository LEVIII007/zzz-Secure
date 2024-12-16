
// import  express  from "express";
// import Redis, { Redis as RedisClient } from 'ioredis';
// import {
// ZShield,
// ShieldMemoryStore,
// RedisShieldStore,
// PostgresShieldStore,
// PostgresFixedWindowStore,
// PostgresLeakyBucketStore,
// LeakyBucket,
// FixedWindow,
// tokenBucket,
// MemoryFixedWindowStore,
// MemoryLeakyBucketStore,
// MemoryTokenBucketStore,
// RedisTokenBucketStore,
// RedisFixedWindowStore,
// } from '../src/index';




// const app = express();




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

// const tb = tokenBucket({
//     windowMs: 15000,
//     limit: 3,
//     store : store
// });


// app.use('/tb', tb);
// app.use('/fw', fw);

// const shield = new ZShield();

// app.use(shield.middleware);


// app.get('/tb', (req, res) => {
//     res.send({
//         status: "ok"
//     });
// });

// app.get('/fw', (req, res) => {
//     res.send({
//         status: "ok"
//     });
// });

// app.post('/tb', (req, res) => {
//     res.send({
//         status: "ok"
//     });
// }
    
//     );




// export default app;

// const PORT = 3000;
// app.listen(PORT, () => {
//     console.log(`Server is running on port ${PORT}`);
// });

