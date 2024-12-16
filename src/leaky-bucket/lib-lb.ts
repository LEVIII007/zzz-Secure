import { Request, Response, NextFunction } from 'express';
import debug from 'debug';
import { ClientRateLimitInfo, IncrementResponse, Options } from '../types';

const log = debug('leaky-bucket');
type Store = {
  init?: (options: Options) => void

  get?: (
    key: string,
  ) =>
    | Promise<ClientRateLimitInfo | undefined>
    | ClientRateLimitInfo
    | undefined
  increment: (key: string) => Promise<IncrementResponse> | IncrementResponse
  decrement: (key: string) => Promise<void> | void
  resetKey: (key: string) => Promise<void> | void
  resetAll?: () => Promise<void> | void
  shutdown?: () => Promise<void> | void
  localKeys?: boolean
  prefix?: string
}
interface Input {
  capacity?: number;
  timeout?: number;
  interval?: number;
  store?: Store;
}

interface QueueAction {
  resolve: () => void;
  reject: (error: Error) => void;
  cost: number;
  isPause: boolean;
}


type Timeout = ReturnType<typeof setTimeout>;

export default class LeakyBucket {
  totalCost: number;
  capacity: number;
  currentCapacity: number;
  maxCapacity: number = 0;
  interval: number = 60000;
  lastRefill: number | null;
  queue: QueueAction[];
  timer?: Timeout;
  timeout: number = 60000;
  refillRate: number = 0;
  emptyPromiseResolver?: () => void;
  emptyPromise?: Promise<void>;
  store?: Store;
  constructor({ capacity = 60, timeout, interval = 60000 ,store}: Input = {}) {
    timeout = timeout ?? interval;

    this.queue = [];
    this.totalCost = 0;
    this.currentCapacity = capacity;
    this.capacity = capacity;
    this.lastRefill = null;

    this.setCapacity(capacity);
    this.setTimeout(timeout);
    this.setInterval(interval);
    this.store = store;
  }
  
  async throttle(cost = 1, append = true, isPause = false): Promise<void> {
    
    const maxCurrentCapacity = this.getCurrentMaxCapacity();
    // if (this.store) {
    //   console.log('Using store for rate limiting.');
    // } else {
    //   console.log('Using in-memory rate limiting.');
    // }
    
    if (append && this.totalCost + cost > maxCurrentCapacity) {
      log(`Rejecting item: max capacity exceeded.`);
      throw new Error(`Bucket overflow.`);
    }

    return new Promise((resolve, reject) => {
      const item: QueueAction = { resolve, reject, cost, isPause };
      this.totalCost += cost;

      if (append) {
        this.queue.push(item);
        log(`Added item with cost ${cost}`);
      } else {
        this.queue.unshift(item);
        log(`Added item with cost ${cost}`);
        this.cleanQueue();
      }

      this.startTimer();
    });
  }

  startTimer() {
    if (!this.timer && this.queue.length > 0) {
      const item = this.getFirstItem();
      if (!item) return;

      log(`Processing item with cost ${item.cost}`);
      this.refill();

      if (this.currentCapacity >= item.cost) {
        item.resolve();
        log(`Resolved item with cost ${item.cost}`);
        this.shiftQueue();
        this.pay(item.cost);
        this.startTimer();
      } else {
        const requiredDelta = item.cost - this.currentCapacity;
        const timeToDelta = (requiredDelta / this.refillRate) * 1000;

        log(`Waiting ${timeToDelta} ms to process next item`);
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.startTimer();
        }, timeToDelta);
      }
    }
  }

  shiftQueue() {
    this.queue.shift();
    if (this.queue.length === 0 && this.emptyPromiseResolver) {
      this.emptyPromiseResolver();
    }
  }

  async isEmpty(): Promise<void> {
    if (!this.emptyPromiseResolver) {
      this.emptyPromise = new Promise((resolve) => {
        this.emptyPromiseResolver = () => {
          this.emptyPromiseResolver = undefined;
          this.emptyPromise = undefined;
          resolve();
        };
      });
    }
    return this.emptyPromise;
  }

  end() {
    log(`Ending bucket`);
    this.stopTimer();
    this.clear();
  }

  clear() {
    log(`Clearing queue`);
    this.queue = [];
    this.totalCost = 0;
  }

  pay(cost: number) {
    log(`Paying ${cost}`);
    this.currentCapacity -= cost;
    this.totalCost -= cost;
    if (this.lastRefill === null) {
      this.lastRefill = Date.now();
    }
  }

  stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  refill() {
    if (this.currentCapacity < this.capacity && this.lastRefill !== null) {
      const elapsed = (Date.now() - this.lastRefill) / 1000;
      const refillAmount = elapsed * this.refillRate;

      this.currentCapacity = Math.min(this.currentCapacity + refillAmount, this.capacity);
      log(`Refilled ${refillAmount}, new capacity: ${this.currentCapacity}`);

      if (this.currentCapacity >= this.capacity) {
        this.currentCapacity = this.capacity;
        this.lastRefill = null;
      } else {
        this.lastRefill = Date.now();
      }
    }
  }

  getCurrentMaxCapacity(): number {
    this.refill();
    return this.capacity;
  }

  cleanQueue() {
    const maxCapacity = this.getCurrentMaxCapacity();
    let currentCapacity = 0;

    const index = this.queue.findIndex((item) => {
      currentCapacity += item.cost;
      return currentCapacity > maxCapacity;
    });

    if (index >= 0) {
      this.queue.splice(index).forEach((item) => {
        if (!item.isPause) {
          log(`Rejecting item with cost ${item.cost} due to queue overflow`);
          item.reject(new Error(`Queue overflow`));
          this.totalCost -= item.cost;
        }
      });
    }
  }

  getFirstItem(): QueueAction | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  pauseByCost(cost: number) {
    this.stopTimer();
    log(`Pausing bucket by cost ${cost}`);
    this.throttle(cost, false, true);
  }

  pause(seconds = 1) {
    this.drain();
    this.stopTimer();
    const cost = this.refillRate * seconds;
    log(`Pausing bucket for ${seconds} seconds`);
    this.pauseByCost(cost);
  }

  drain() {
    log(`Draining bucket: capacity reset to 0`);
    this.currentCapacity = 0;
    this.lastRefill = Date.now();
  }

  setTimeout(timeout: number) {
    this.timeout = timeout;
    this.updateVariables();
    return this;
  }

  setInterval(interval: number) {
    this.interval = interval;
    this.updateVariables();
    return this;
  }

  setCapacity(capacity: number) {
    this.capacity = capacity;
    this.maxCapacity = capacity;
    this.currentCapacity = capacity;
    this.updateVariables();
    return this;
  }

  private updateVariables() {
    this.refillRate = this.capacity / (this.interval / 1000);
    log(`Updated refill rate: ${this.refillRate}`);
  }

  // Express middleware
  rateLimitMiddleware = (req: Request, res: Response, next: NextFunction): void => {

    this.throttle()  // throttle can be customized with cost parameters if needed
      .then(() => {
        next();  // Proceed to the next middleware or route handler
      })
      .catch((err: Error) => {
        res.status(429).json({ error: err.message });  // Handle errors if rate limit exceeded
      });
  };
}
