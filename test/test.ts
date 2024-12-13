// import tokenBucket from "./token-bucket/lib";
// import FixedWindow from "./fixed-window/lib-fixed-window";
// import express from "express";
// import { ArcjetShield} from "../src/shield/lib";
// import {InMemoryStore} from "..src//shield/memory/inMemoryStore";
import tokenBucket from "../src/token-bucket/lib";
import FixedWindow from "../src/fixed-window/lib-fixed-window";
import  express  from "express";
import  ZShield  from "../src/shield/lib";
import { InMemoryStore } from "../src/shield/memory/inMemoryStore";
import Redis, { Redis as RedisClient } from 'ioredis';
import { RedisStore } from "../src/token-bucket/cache-memory";

const app = express();




const fw = FixedWindow({
    windowMs: 15000,
    limit: 3
});

const redisClient = new Redis()
const store = new RedisStore({ 
  client: redisClient,
  prefix: 'myapp:rate-limit:',
  windowMs: 60000, // 1 minute
  resetExpiryOnChange: true 
})

const tb = tokenBucket({
    windowMs: 15000,
    limit: 3,
    store : store
});


app.use('/tb', tb);
app.use('/fw', fw);

const shield = new ZShield();

app.use(shield.middleware);


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
}
    
    );




export default app;

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

