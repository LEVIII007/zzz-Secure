// src/algorithm/ArcjetShield.ts
import { InMemoryStore } from './memory/inMemoryStore';
import { Request, Response, NextFunction } from 'express';
import { handleAsyncErrors } from '../parseConfig';
import { StoreInterface } from './memory/memoryInterface';

type SuspicionScore = {
    score: number;
    resetTime: number;
};

interface ShieldOptions {
    suspicionThreshold?: number;
    blockDurationMs?: number;
    detectionPatterns?: Array<RegExp>;
    csrf?: boolean;
    xss?: boolean;
    sqlInjection?: boolean;
    lfi?: boolean;
    rfi?: boolean;
    shellInjection?: boolean;
    store: StoreInterface;
}

function detectAttackPatterns(
    req: Request, 
    options: ShieldOptions
): { isSuspicious: boolean; attackTypes: string[] } {
    const attackTypes: string[] = [];

    // XSS Detection
    if (options.xss) {
        const xssPatterns = [
            /<script>/i,
            /javascript:/i,
            /onerror=/i,
            /\balert\(/i
        ];
        if (xssPatterns.some(pattern => 
            Object.values(req.body).some(value => 
                typeof value === 'string' && pattern.test(value)
            ) ||
            Object.values(req.query).some(value => 
                typeof value === 'string' && pattern.test(value)
            )
        )) {
            attackTypes.push('XSS');
        }
    }

    // SQL Injection Detection
    if (options.sqlInjection) {
        const sqlInjectionPatterns = [
            /SELECT.*FROM/i,
            /\b(OR|AND)\s+1\s*=\s*1/i,
            /\b(UNION|CONCAT|CHAR)\b/i,
            /--\s/,
            /;\s*DROP\s+/i
        ];
        if (sqlInjectionPatterns.some(pattern => 
            Object.values(req.body).some(value => 
                typeof value === 'string' && pattern.test(value)
            ) ||
            Object.values(req.query).some(value => 
                typeof value === 'string' && pattern.test(value)
            )
        )) {
            attackTypes.push('SQL Injection');
        }
    }

    // Local File Inclusion (LFI) Detection
    if (options.lfi) {
        const lfiPatterns = [
            /\.\.\//,
            /etc\/passwd/i,
            /proc\/self/i
        ];
        if (lfiPatterns.some(pattern => 
            Object.values(req.query).some(value => 
                typeof value === 'string' && pattern.test(value)
            )
        )) {
            attackTypes.push('LFI');
        }
    }

    // Remote File Inclusion (RFI) Detection
    if (options.rfi) {
        const rfiPatterns = [
            /^(http|https):\/\//i,
            /\?php:\/\//i
        ];
        if (rfiPatterns.some(pattern => 
            Object.values(req.query).some(value => 
                typeof value === 'string' && pattern.test(value)
            )
        )) {
            attackTypes.push('RFI');
        }
    }

    // Shell Injection Detection
    if (options.shellInjection) {
        const shellInjectionPatterns = [
            /\|\|/,
            /&&/,
            /;/,
            /\$\(/,
            /`/
        ];
        if (shellInjectionPatterns.some(pattern => 
            Object.values(req.body).some(value => 
                typeof value === 'string' && pattern.test(value)
            ) ||
            Object.values(req.query).some(value => 
                typeof value === 'string' && pattern.test(value)
            )
        )) {
            attackTypes.push('Shell Injection');
        }
    }

    return {
        isSuspicious: attackTypes.length > 0,
        attackTypes
    };
}

export default class ZShield {
    private suspicionThreshold: number;
    private blockDurationMs: number;
    private memoryStore: StoreInterface;
    private options: ShieldOptions;

    constructor(options: Partial<ShieldOptions> = {}) {
        this.options = {
            suspicionThreshold: 5,
            blockDurationMs: 60000,
            csrf: true,
            xss: true,
            sqlInjection: true,
            lfi: true,
            rfi: true,
            shellInjection: true,
            store: new InMemoryStore(),
            ...options
        };

        this.memoryStore = this.options.store;
        this.suspicionThreshold = this.options.suspicionThreshold ?? 5;
        this.blockDurationMs = this.options.blockDurationMs ?? 60000;
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

            // Detect attack patterns based on enabled options
            const { isSuspicious, attackTypes } = detectAttackPatterns(req, this.options);

            const currentScore = await this.memoryStore.get<SuspicionScore>(`score:${clientIP}`);

            if (isSuspicious) {
                // Log detected attack types
                console.log(`Suspicious activity detected from ${clientIP}: ${attackTypes.join(', ')}`);

                if (currentScore && Date.now() < currentScore.resetTime) {
                    // Increment suspicion score
                    currentScore.score += attackTypes.length; // Increase by number of attack types

                    if (currentScore.score >= this.suspicionThreshold) {
                        await this.memoryStore.set(`block:${clientIP}`, Date.now() + this.blockDurationMs, this.blockDurationMs);
                        await this.memoryStore.delete(`score:${clientIP}`);
                        res.status(403).json({ 
                            error: "Access denied due to suspicious activity.",
                            detectedAttacks: attackTypes 
                        });
                        return;
                    } else {
                        await this.memoryStore.set(`score:${clientIP}`, currentScore, currentScore.resetTime - Date.now());
                    }
                } else {
                    // Set initial suspicion score
                    await this.memoryStore.set(
                        `score:${clientIP}`,
                        { score: attackTypes.length, resetTime: Date.now() + this.blockDurationMs },
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