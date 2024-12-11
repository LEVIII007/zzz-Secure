

type ProtectionConfig = {
    suspicionThreshold?: number;
    blockDurationMs?: number;
    detectionPatterns?: Array<RegExp>;
    csrf?: boolean; // Cross-Site Request Forgery protection
    xss?: boolean;  // Cross-Site Scripting protection
    sqlInjection?: boolean; // SQL Injection protection
};

type ArcJetShieldConfiguration = {
    suspicionThreshold?: number;
    blockDurationMs?: number;
    detectionPatterns?: Array<RegExp>;
    csrf: boolean;
    xss: boolean;
    sqlInjection: boolean;
};

const defaultProtectionConfig: ProtectionConfig = {
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
};

const omitUndefinedFields = <T>(config: Partial<T>): Partial<T> => {
    const result: Partial<T> = {};
    for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
            result[key as keyof T] = value;
        }
    }
    return result;
};

const parseShieldOptions = (
    userConfig: ProtectionConfig = {},
): ArcJetShieldConfiguration => {
    const notUndefinedOptions = omitUndefinedFields(userConfig);

    const validations = getValidations(true);
    validations.validationsConfig();

    const config: ArcJetShieldConfiguration = {
        csrf: notUndefinedOptions.csrf ?? defaultProtectionConfig.csrf!,
        xss: notUndefinedOptions.xss ?? defaultProtectionConfig.xss!,
        sqlInjection:
            notUndefinedOptions.sqlInjection ?? defaultProtectionConfig.sqlInjection!,
        rateLimiting: {
            ...defaultProtectionConfig.rateLimiting,
            ...notUndefinedOptions.rateLimiting,
        },
        validations,
    };

    validations.rateLimitingConfig(config.rateLimiting); // Example: validate the rate-limiting config

    return config;
};
