export const detectXSSPatterns: RegExp[] = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i, // Full <script> tag
    /javascript:/i,                       // Inline JavaScript
    /on\w+=['"]?[^'"]+['"]?/i,            // Event handlers (e.g., onerror, onclick)
    /alert\(['"]?.*?['"]?\)/i,            // `alert()` function
    /document\.(cookie|write|location)/i, // Accessing cookies or writing to DOM
    /eval\(['"]?.*?['"]?\)/i,             // Use of `eval()` function
    /window\.open\(/i,                    // Malicious pop-ups
    /\bfetch\(/i,                         // JavaScript fetch API for malicious requests
    /<\/?[a-z][\s\S]*?>/i,                // General HTML tags (potential HTML injection)
];


export const detectSQLInjectionPatterns: RegExp[] = [
    /SELECT.*FROM/i,                     // Basic SQL SELECT injection
    /INSERT\s+INTO/i,                    // Basic SQL INSERT injection
    /\b(OR|AND)\s+1\s*=\s*1\b/i,         // Boolean-based SQL injection
    /\bUNION\s+(ALL\s+)?SELECT\b/i,      // UNION-based injection
    /;\s*DROP\s+(TABLE|DATABASE)/i,      // Drop table or database
    /;\s*(ALTER|CREATE|EXECUTE|INSERT)/i, // Other SQL manipulation
    /\b(CHAR|CONCAT|LOAD_FILE|SLEEP)\b/i, // SQL functions commonly used in injection
    /--\s/i,                             // Comment marker for SQL injection
    /\/\*.*\*\//,                        // Block comments
    /\b\d+\s*=\s*\d+\b/,                 // Tautology expressions (e.g., 1=1)
];

export const detectLfiPatterns: RegExp[] = [
    /\.\.\//,                             // Directory traversal (../)
    /\/etc\/passwd/i,                     // Attempt to access Unix password file
    /\/proc\/self/i,                      // Attempt to access Linux proc files
    /\bwindows\\system32\b/i,             // Windows system directory access
    /\bboot\.ini\b/i,                     // Windows boot configuration file
    /\.htaccess/i,                        // Apache configuration file
    /php:\/\/input/i,                     // Accessing PHP input stream
    /php:\/\/filter/i,                    // PHP filter wrapper
    /data:\/\//i,                         // Data stream wrapper
];

export const detectAttackPatterns = {
    xss: detectXSSPatterns,
    sqlInjection: detectSQLInjectionPatterns,
    lfi: detectLfiPatterns,
};



// What to Scan for Each Attack?
// Attack Type	Request Part	Examples
// SQL Injection	Query, Body, Headers, Cookies	?id=1' OR 1=1--, Authorization: ' OR '1'='1, body: {"email": "test' UNION SELECT ..."}


// XSS	Query, Body, Cookies	?search=<script>alert(1)</script>, body: {"message": "<img src=x onerror=alert(1)>}


// LFI	Query, Body	?file=../../etc/passwd, body: {"file": "/var/log/secure"}





