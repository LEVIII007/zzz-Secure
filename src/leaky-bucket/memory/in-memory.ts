import type { BucketStore, BucketOptions, ClientRateLimitInfo } from '../../types';

type QueuedRequest = {
    clientId: string;
    timestamp: number;
};

export default class MemoryLeakyBucketStore implements BucketStore {
    /**
     * Global queue to store all incoming requests
     */
    private globalQueue: QueuedRequest[] = [];

    /**
     * Tracks number of requests per client in the global queue
     */
    private clientRequestCounts: Map<string, number> = new Map();

    /**
     * Server-wide configuration parameters
     */
    private globalLimit!: number;      // Total requests server can handle in an interval
    private clientMaxRequests!: number; // Max requests per client in the queue
    private leakRate!: number;          // Number of requests processed per interval

    /**
     * Initialize the store with given options
     */
    init(options: BucketOptions): void {
        this.globalLimit = options.Limit ?? 100;           // Default global limit
        this.clientMaxRequests = options.maxTokens ?? 10;  // Default client max requests
        this.leakRate = options.LeakRate ?? 5;             // Default leak rate

        console.debug(`Initialized GlobalLeakyBucketStore: 
            Global Limit: ${this.globalLimit}, 
            Client Max Requests: ${this.clientMaxRequests}, 
            Leak Rate: ${this.leakRate}`);
    }

    /**
     * Add a request to the global queue
     * @returns boolean indicating if request was accepted
     */
    async increment(clientId: string): Promise<ClientRateLimitInfo> {
        const now = Date.now();

        // Check global queue limit
        if (this.globalQueue.length >= this.globalLimit) {
            throw new Error('Server request limit exceeded');
        }

        // Check client-specific request limit
        const clientRequestCount = this.clientRequestCounts.get(clientId) ?? 0;
        if (clientRequestCount >= this.clientMaxRequests) {
            throw new Error('Client request limit exceeded');
        }

        // Add request to global queue
        const request: QueuedRequest = { clientId, timestamp: now };
        this.globalQueue.push(request);

        // Update client request count
        this.clientRequestCounts.set(clientId, clientRequestCount + 1);

        return {
            totalHits: this.globalQueue.length,
            resetTime: new Date(now + 1000)  // Example reset time
        };
    }

    /**
     * Process requests based on leak rate
     * Removes requests from global queue and updates client counts
     */
    async processRequests(): Promise<void> {
        let processedCount = 0;

        while (processedCount < this.leakRate && this.globalQueue.length > 0) {
            const request = this.globalQueue.shift();
            if (!request) break;

            // Decrement client request count
            const clientCurrentCount = this.clientRequestCounts.get(request.clientId) ?? 0;
            if (clientCurrentCount > 1) {
                this.clientRequestCounts.set(request.clientId, clientCurrentCount - 1);
            } else {
                this.clientRequestCounts.delete(request.clientId);
            }

            // Actual request processing would happen here
            this.processRequest(request);

            processedCount++;
        }
    }

    /**
     * Placeholder for actual request processing logic
     */
    private processRequest(request: QueuedRequest): void {
        console.debug(`Processing request for client: ${request.clientId}`);
        // Implement actual request processing logic here
    }

    /**
     * Get current status for a client
     */
    async get(clientId: string): Promise<ClientRateLimitInfo> {
        return {
            totalHits: this.globalQueue.length,
            resetTime: new Date(Date.now() + 1000)
        };
    }

    /**
     * Reset a specific client's requests
     */
    async resetKey(clientId: string): Promise<void> {
        // Remove client's requests from global queue
        this.globalQueue = this.globalQueue.filter(req => req.clientId !== clientId);
        this.clientRequestCounts.delete(clientId);
    }

    /**
     * Reset all requests
     */
    async resetAll(): Promise<void> {
        this.globalQueue = [];
        this.clientRequestCounts.clear();
    }

    /**
     * Shutdown the store
     */
    shutdown(): void {
        this.resetAll();
    }

    /**
     * Decrement method for compatibility (optional)
     */
    async decrement(clientId: string): Promise<void> {
        const clientCurrentCount = this.clientRequestCounts.get(clientId) ?? 0;
        if (clientCurrentCount > 0) {
            this.clientRequestCounts.set(clientId, clientCurrentCount - 1);
        }
    }
}