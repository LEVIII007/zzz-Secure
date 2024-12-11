// src/algorithm/ArcjetShield.ts
import { InMemoryStore } from './memory/inMemoryStore';
import { Request, Response, NextFunction } from 'express';
import { handleAsyncErrors } from '../parseConfig';
import { ParsedQs } from 'qs';

type SuspicionScore = {
    score: number;
    resetTime: number;
};

interface ShieldOptions {
    suspicionThreshold?: number;
    blockDurationMs?: number;
    detectionPatterns?: Array<RegExp>;
}

function detectSuspiciousPatterns(
    req: Request, 
    patterns: RegExp[]
): boolean {
    // Recursive function to deep check objects
    const deepCheck = (obj: any, pattern: RegExp): boolean => {
        if (typeof obj === 'string') {
            return pattern.test(obj);
        }
        if (typeof obj === 'object' && obj !== null) {
            return Object.values(obj).some(value => deepCheck(value, pattern));
        }
        return false;
    };

    // Check each pattern against all relevant request fields
    return patterns.some(pattern =>
        deepCheck(req.body, pattern) || // Check request body recursively
        Object.values(req.query).some(value => pattern.test(value as string)) || // Check query parameters
        Object.values(req.headers).some(value => pattern.test(value as string)) || // Check headers
        Object.values(req.cookies || {}).some(value => pattern.test(value as string)) || // Check cookies
        Object.values(req.params || {}).some(value => pattern.test(value as string)) || // Check route parameters
        pattern.test(req.url) // Check URL
    );
}


export class ArcjetShield {
    private suspicionThreshold: number;
    private blockDurationMs: number;
    private detectionPatterns: Array<RegExp>;
    private memoryStore: InMemoryStore;

    constructor(memoryStore: InMemoryStore, options: ShieldOptions = {}) {
        this.memoryStore = memoryStore; // Injected memory store
        this.suspicionThreshold = options.suspicionThreshold ?? 5;
        this.blockDurationMs = options.blockDurationMs ?? 60000;
        this.detectionPatterns = options.detectionPatterns ?? [
            /<script>/i,
            /SELECT.*FROM/i,
            /\.\.\//,
            /(;|\||&&)/,
        ];
    }

    // Middleware wrapped with handleAsyncErrors
    middleware = handleAsyncErrors(
        async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const clientIP = req.ip;

            // Check if client is blocked
            const blockExpiry = await this.memoryStore.get<number>(`block:${clientIP}`);
            if (blockExpiry && blockExpiry > Date.now()) {
                res.status(403).json({ error: "Access denied due to suspicious activity." });
                return;
            }

            // Remove block if expired
            if (blockExpiry && blockExpiry <= Date.now()) {
                await this.memoryStore.delete(`block:${clientIP}`);
            }

            const isSuspicious = detectSuspiciousPatterns(req, this.detectionPatterns);

            const currentScore = await this.memoryStore.get<SuspicionScore>(`score:${clientIP}`);

            if (isSuspicious) {
                if (currentScore && Date.now() < currentScore.resetTime) {
                    // Increment suspicion score
                    currentScore.score += 1;

                    if (currentScore.score >= this.suspicionThreshold) {
                        await this.memoryStore.set(`block:${clientIP}`, Date.now() + this.blockDurationMs, this.blockDurationMs);
                        await this.memoryStore.delete(`score:${clientIP}`);
                        res.status(403).json({ error: "Access denied due to suspicious activity." });
                        return;
                    } else {
                        await this.memoryStore.set(`score:${clientIP}`, currentScore, currentScore.resetTime - Date.now());
                    }
                } else {
                    // Set initial suspicion score
                    await this.memoryStore.set(
                        `score:${clientIP}`,
                        { score: 1, resetTime: Date.now() + this.blockDurationMs },
                        this.blockDurationMs
                    );
                }
            }

            next();
        }
    );

    async flushExpiredScores(): Promise<void> {
        await this.memoryStore.flushExpired();
    }
}