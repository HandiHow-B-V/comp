import 'server-only';

import * as net from 'node:net';
import * as tls from 'node:tls';
import { Redis } from '@upstash/redis';

const mockRedisStorage = ((globalThis as typeof globalThis & {
  __trycompaiMockRedisStorage?: Map<string, any>;
}).__trycompaiMockRedisStorage ??= new Map<string, any>());

// Mock Redis client for E2E tests
class MockRedis {
  private storage = mockRedisStorage;

  async get(key: string) {
    return this.storage.get(key) || null;
  }

  async set(key: string, value: any, options?: { ex?: number }) {
    this.storage.set(key, value);
    if (options?.ex) {
      // Simple expiration simulation
      setTimeout(() => {
        this.storage.delete(key);
      }, options.ex * 1000);
    }
    return 'OK';
  }

  async del(key: string) {
    this.storage.delete(key);
    return 1;
  }

  async exists(key: string) {
    return this.storage.has(key) ? 1 : 0;
  }

  async keys(pattern: string) {
    const keys = Array.from(this.storage.keys());
    if (pattern === '*') return keys;

    // Simple pattern matching for E2E tests
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return keys.filter((key) => regex.test(key));
  }

  async expire(key: string, seconds: number) {
    if (this.storage.has(key)) {
      setTimeout(() => {
        this.storage.delete(key);
      }, seconds * 1000);
      return 1;
    }
    return 0;
  }
}

class RedisUrlClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private connectPromise: Promise<net.Socket | tls.TLSSocket> | null = null;
  private buffer = Buffer.alloc(0);
  private pending: Array<{
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private url: string) {}

  private async getSocket() {
    if (this.socket && !this.socket.destroyed) {
      return this.socket;
    }

    this.connectPromise ??= this.createConnection();
    const socket = await this.connectPromise;
    return socket;
  }

  private async createConnection() {
    const redisUrl = new URL(this.url);
    const port = Number(redisUrl.port || (redisUrl.protocol === 'rediss:' ? 6380 : 6379));
    const host = redisUrl.hostname;
    const useTls = redisUrl.protocol === 'rediss:';

    const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      const socket = useTls
        ? tls.connect({ host, port })
        : net.connect({ host, port });

      socket.once('error', onError);
      socket.once(useTls ? 'secureConnect' : 'connect', () => {
        socket.off('error', onError);
        resolve(socket);
      });
    });

    this.socket = socket;
    socket.on('data', (chunk) => this.handleData(chunk));
    socket.on('error', (error) => this.rejectPending(error));
    socket.on('close', () => {
      this.socket = null;
      this.connectPromise = null;
    });

    if (redisUrl.password) {
      const username = decodeURIComponent(redisUrl.username || 'default');
      const password = decodeURIComponent(redisUrl.password);
      await this.sendCommand(socket, ['AUTH', username, password]);
    }

    const database = redisUrl.pathname.replace('/', '');
    if (database) {
      await this.sendCommand(socket, ['SELECT', database]);
    }

    return socket;
  }

  private encodeCommand(parts: Array<string | number>) {
    const values = parts.map((part) => String(part));
    return `*${values.length}\r\n${values
      .map((value) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`)
      .join('')}`;
  }

  private sendCommand(socket: net.Socket | tls.TLSSocket, parts: Array<string | number>) {
    return new Promise<unknown>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      socket.write(this.encodeCommand(parts));
    });
  }

  private async command(parts: Array<string | number>) {
    const socket = await this.getSocket();
    return this.sendCommand(socket, parts);
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.pending.length > 0) {
      const parsed = this.parseReply(0);
      if (!parsed) {
        return;
      }

      this.buffer = this.buffer.subarray(parsed.offset);
      const pending = this.pending.shift();
      if (!pending) {
        return;
      }

      if (parsed.error) {
        pending.reject(parsed.error);
      } else {
        pending.resolve(parsed.value);
      }
    }
  }

  private parseReply(offset: number): {
    value: unknown;
    offset: number;
    error?: Error;
  } | null {
    if (offset >= this.buffer.length) {
      return null;
    }

    const byte = this.buffer[offset];
    if (byte === undefined) {
      return null;
    }

    const type = String.fromCharCode(byte);
    const lineEnd = this.buffer.indexOf('\r\n', offset);
    if (lineEnd === -1) {
      return null;
    }

    const line = this.buffer.toString('utf8', offset + 1, lineEnd);
    const nextOffset = lineEnd + 2;

    if (type === '+') {
      return { value: line, offset: nextOffset };
    }

    if (type === '-') {
      return { value: null, offset: nextOffset, error: new Error(line) };
    }

    if (type === ':') {
      return { value: Number(line), offset: nextOffset };
    }

    if (type === '$') {
      const length = Number(line);
      if (length === -1) {
        return { value: null, offset: nextOffset };
      }

      const end = nextOffset + length;
      if (this.buffer.length < end + 2) {
        return null;
      }

      return {
        value: this.buffer.toString('utf8', nextOffset, end),
        offset: end + 2,
      };
    }

    if (type === '*') {
      const length = Number(line);
      if (length === -1) {
        return { value: null, offset: nextOffset };
      }

      const values: unknown[] = [];
      let currentOffset = nextOffset;
      for (let index = 0; index < length; index += 1) {
        const item = this.parseReply(currentOffset);
        if (!item) {
          return null;
        }
        values.push(item.value);
        currentOffset = item.offset;
      }

      return { value: values, offset: currentOffset };
    }

    return {
      value: null,
      offset: nextOffset,
      error: new Error(`Unsupported Redis response type: ${type}`),
    };
  }

  private rejectPending(error: Error) {
    const pending = this.pending.splice(0);
    for (const item of pending) {
      item.reject(error);
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.command(['GET', key]);

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value as string) as T;
    } catch {
      return value as T;
    }
  }

  async set(key: string, value: unknown, options?: { ex?: number }) {
    const serialized = JSON.stringify(value);

    if (options?.ex) {
      await this.command(['SET', key, serialized, 'EX', options.ex]);
    } else {
      await this.command(['SET', key, serialized]);
    }

    return 'OK';
  }

  async del(key: string) {
    return this.command(['DEL', key]);
  }

  async exists(key: string) {
    return this.command(['EXISTS', key]);
  }

  async keys(pattern: string) {
    return this.command(['KEYS', pattern]);
  }

  async expire(key: string, seconds: number) {
    return this.command(['EXPIRE', key, seconds]);
  }
}

// Use mock client for E2E tests in CI or when explicitly mocked
const isE2ETest = process.env.E2E_TEST_MODE === 'true' && process.env.CI === 'true';
const isMockRequired = process.env.MOCK_REDIS === 'true';
const hasUpstashConfig =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRedisUrl = !!process.env.REDIS_URL;

export const client =
  isE2ETest || isMockRequired || !hasUpstashConfig
    ? hasRedisUrl && !isE2ETest && !isMockRequired
      ? (new RedisUrlClient(process.env.REDIS_URL!) as any as Redis)
      : (new MockRedis() as any as Redis)
    : new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });

// Re-export Redis types for convenience
export type { Redis } from '@upstash/redis';
