// src/common/redis/redis.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(
      this.configService.getOrThrow<string>('REDIS_URL'),
      {
        maxRetriesPerRequest: 3,
      },
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Universal Set method
   * @param key Redis key
   * @param value Value to store
   * @param ttl Optional Time-to-live in seconds
   */
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
}
