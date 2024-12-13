// import { ValueDeterminingMiddleware, Store } from "../types";
import type {
    Options,
    AugmentedRequest,
    Store,
    ClientRateLimitInfo,
    ValueDeterminingMiddleware,
    RateLimitExceededEventHandler,
    DraftHeadersVersion,
    RateLimitInfo,
    EnabledValidations,
} from '../types';

import { InMemoryStore } from './memory/inMemoryStore';
import { StoreInterface } from './memory/memoryInterface';

type ArcJetShieldConfiguration = {
    suspicionThreshold?: number | ValueDeterminingMiddleware<number> ;
    blockDurationMs?: number | ValueDeterminingMiddleware<number>;
    detectionPatterns?: Array<RegExp> | ValueDeterminingMiddleware<Array<RegExp>>;
    csrf: boolean | ValueDeterminingMiddleware<boolean>;
    xss: boolean | ValueDeterminingMiddleware<boolean>;
    sqlInjection: boolean | ValueDeterminingMiddleware<boolean>;
    store : StoreInterface;
};

const defaultProtectionConfig: ArcJetShieldConfiguration = {
    suspicionThreshold: 5,
    blockDurationMs: 60000,
    detectionPatterns: [
        /<script>/i,
        /SELECT.*FROM/i,
        /\.\.\//,
        /(;|\||&&)/,
    ],
    csrf: true,
    xss: true,
    sqlInjection: true,
    store : new InMemoryStore,
};

const omitUndefinedOptions = (
    passedOptions: Partial<ArcJetShieldConfiguration>,
): Partial<ArcJetShieldConfiguration> => {
    const omittedOptions: Partial<ArcJetShieldConfiguration> = {};

    for (const k of Object.keys(passedOptions)) {
        const key = k as keyof ArcJetShieldConfiguration;

        if (passedOptions[key] !== undefined) {
            omittedOptions[key] = passedOptions[key] as any; // TypeScript will correctly infer the type here.
        }
    }

    return omittedOptions;
};


const parseShieldOptions = (
    userConfig: ArcJetShieldConfiguration,
): ArcJetShieldConfiguration => {
    const notUndefinedOptions = omitUndefinedOptions(userConfig);

    const config: ArcJetShieldConfiguration = {
        suspicionThreshold : notUndefinedOptions.suspicionThreshold ?? defaultProtectionConfig.suspicionThreshold!,
        blockDurationMs : notUndefinedOptions.blockDurationMs ?? defaultProtectionConfig.blockDurationMs!,
        detectionPatterns : notUndefinedOptions.detectionPatterns ?? defaultProtectionConfig.detectionPatterns!,
        csrf: notUndefinedOptions.csrf ?? defaultProtectionConfig.csrf!,
        xss: notUndefinedOptions.xss ?? defaultProtectionConfig.xss!,
        sqlInjection:
            notUndefinedOptions.sqlInjection ?? defaultProtectionConfig.sqlInjection!,
        store : notUndefinedOptions.store ?? defaultProtectionConfig.store!,
    };
    return config;
};

export {parseShieldOptions, omitUndefinedOptions};
