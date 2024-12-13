interface MemoryStore {
    // Stores the bucket state (e.g., number of requests, last leak time, etc.)
    set(key: string, value: any): void;
  
    // Retrieves the stored value by key
    get<T>(key: string): T | undefined;
  
    // Deletes the stored value by key
    delete(key: string): void;
  
    // Checks if the key exists in the store
    has(key: string): boolean;
  
    // Clears the store (optional, for testing or resetting)
    clear(): void;
  }

export { MemoryStore };