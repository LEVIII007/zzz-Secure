// // /source/index.ts
// // Export away!

// // Export all the types as named exports
// export * from './types.js'


// export { default, default as tokenBucket } from './token-bucket/lib.js'

// // Export the memory store in case someone wants to use or extend it
// export { default as MemoryTokenBucketStore } from './token-bucket/memory.js'

// // Export the fixed window store in case someone wants to use or extend it
// export { default as FixedWindow } from './fixed-window/lib-fixed-window.js'
// export { default as MemoryFixedWindowStore } from './fixed-window/memory-fw.js'


import tokenBucket from "./token-bucket/lib";
import FixedWindow from "./fixed-window/lib-fixed-window";
import express from "express";
import { ArcjetShield} from "./shield/lib";
import {InMemoryStore} from "./shield/memory/inMemoryStore";

const app = express();


const tb = tokenBucket({
    windowMs: 15000,
    limit: 3
});

const fw = FixedWindow({
    windowMs: 15000,
    limit: 3
});

app.use('/tb', tb);
app.use('/fw', fw);

const shield = new ArcjetShield(new InMemoryStore());

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

