import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis(
      this.configService.getOrThrow<string>('REDIS_URL'),
      {
        maxRetriesPerRequest: 3,
      },
    );

    this.client.on('error', err => {
      this.logger.error('Redis connection error', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    await this.ensureStreamsExist();
  }

  /**
   * Expose raw client for advanced operations when needed
   */
  getClient(): Redis {
    return this.client;
  }

  private async ensureStreamsExist() {
    try {
      // Create consumer groups if they don't exist. MKSTREAM creates stream if missing.
      await this.client
        .xgroup('CREATE', 'clicks:events', 'clicks-workers', '0', 'MKSTREAM')
        .catch(() => {});
      await this.client
        .xgroup('CREATE', 'safety:checks', 'safety-workers', '0', 'MKSTREAM')
        .catch(() => {});
      this.logger.log('Redis streams and groups ensured');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Failed to ensure streams: ${msg}`);
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Failed to set expiry on ${key}: ${msg}`);
      throw new InternalServerErrorException('Cache operation failed');
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  // Atomic increment for Phase 3: Rate Limiting
  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  // -- Stream helpers --
  async addToStream(
    streamName: string,
    data: Record<string, any>,
    maxLen = 10000,
  ): Promise<string | null> {
    const flattened = this.flattenObject(data);
    const id = await this.client.xadd(
      streamName,
      'MAXLEN',
      '~',
      String(maxLen),
      '*',
      ...flattened,
    );
    return id;
  }

  async readFromStream(
    streamName: string,
    groupName: string,
    consumerName: string,
    count = 100,
    blockMs = 5000,
  ): Promise<Array<{ id: string; data: Record<string, any> }>> {
    const res = (await this.client.xreadgroup(
      'GROUP',
      groupName,
      consumerName,
      'COUNT',
      String(count),
      'BLOCK',
      String(blockMs),
      'STREAMS',
      streamName,
      '>',
    )) as unknown;
    if (!res) return [];
    // res format: [[streamName, [[id, [field, value, ...]], ...]]]
    const parsed = res as Array<[string, Array<[string, string[]]>]>;
    const messages = parsed[0][1] ?? [];
    return messages.map(([id, keyvals]) => ({
      id,
      data: this.parseFields(keyvals),
    }));
  }

  async ackMessage(
    streamName: string,
    groupName: string,
    messageId: string,
  ): Promise<void> {
    await this.client.xack(streamName, groupName, messageId);
  }

  async getPendingCount(
    streamName: string,
    groupName: string,
  ): Promise<number> {
    try {
      const info = await this.client.xpending(streamName, groupName);
      // xpending returns array with summary; the count is at index 0 for some clients
      if (Array.isArray(info) && info.length > 0) {
        const count = parseInt(String(info[0]), 10);
        return Number.isFinite(count) ? count : 0;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private flattenObject(obj: Record<string, any>): string[] {
    const result: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      result.push(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return result;
  }

  private parseFields(fields: string[]): Record<string, any> {
    const out: Record<string, any> = {};
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = value;
      }
    }
    return out;
  }
}
