
// export * from './types.js'


// export { default, default as tokenBucket } from './token-bucket/lib.js'

// export { default as MemoryTokenBucketStore } from './token-bucket/memory.js'

// export { default as FixedWindow } from './fixed-window/lib-fixed-window.js'
// export { default as MemoryFixedWindowStore } from './fixed-window/memory-fw.js'
// export {default as ZShield } from './shield/lib.js'


// import tokenBucket from "./token-bucket/lib";
// import FixedWindow from "./fixed-window/lib-fixed-window";
// import express from "express";
// import { ArcjetShield} from "../src/shield/lib";
// import {InMemoryStore} from "..src//shield/memory/inMemoryStore";
import tokenBucket from "./token-bucket/lib";
import FixedWindow from "./fixed-window/lib-fixed-window";
import express from "express";
import ZShield from "./shield/lib";
import { InMemoryStore } from "./shield/memory/inMemoryStore";
import Redis, { Redis as RedisClient } from 'ioredis';
import { RedisStore } from "./token-bucket/cache-memory";

const app = express();




const fw = FixedWindow({
    windowMs: 15000,
    limit: 3
});

// // const redisClient = new Redis()
// // const store = new RedisStore({ 
// //   client: redisClient,
// //   prefix: 'myapp:rate-limit:',
// //   windowMs: 60000, // 1 minute
// //   resetExpiryOnChange: true 
// // })

const tb = tokenBucket({
    windowMs: 15000,
    limit: 3,
});


app.use('/tb', tb);
app.use('/fw', fw);

app.use(express.json());

const shield = new ZShield();

// app.use(shield.middleware);


app.get('/tb', (req, res) => {
    res.send({
        status: "ok"
    });
});

app.get('/fw', (req, res) => {
    res.send({
        status: "ok"
    });
});

app.post('/tb', (req, res) => {
    res.send({
        status: "ok"
    });
});




export default app;

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

