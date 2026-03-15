import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Click } from './entities/click.entity';
import { Url } from '../url/entities/url.entity';

@Injectable()
export class AnalyticsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsWorker.name);
  private isRunning = false;
  private readonly streamName = 'clicks:events';
  private readonly groupName = 'clicks-workers';
  private readonly consumerName = `worker-${process.pid}`;

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Click)
    private readonly clickRepo: Repository<Click>,
    @InjectRepository(Url)
    private readonly urlRepo: Repository<Url>,
  ) {}

  onModuleInit() {
    if (!this.shouldRunWorkers()) {
      this.logger.log('Analytics worker disabled by ENABLE_WORKERS=false');
      return;
    }
    this.startConsuming();
  }

  onModuleDestroy() {
    this.isRunning = false;
  }

  private startConsuming() {
    this.isRunning = true;
    this.logger.log(`Analytics worker started: ${this.consumerName}`);
    this.consumeLoop().catch(err => this.logger.error('Worker failed', err));
  }

  private shouldRunWorkers(): boolean {
    return process.env.ENABLE_WORKERS !== 'false';
  }

  private async consumeLoop() {
    while (this.isRunning) {
      try {
        const messages = await this.redisService.readFromStream(
          this.streamName,
          this.groupName,
          this.consumerName,
          100,
          5000,
        );

        if (messages.length === 0) {
          continue;
        }

        await this.processBatch(messages);
      } catch (err) {
        this.logger.error('Analytics worker loop error', err);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  private async processBatch(
    messages: Array<{ id: string; data: Record<string, any> }>,
  ) {
    const clicksToInsert: Array<Partial<Click>> = [];
    const shortCodeCounts = new Map<string, number>();
    const ackIds: string[] = [];

    for (const message of messages) {
      const { id, data } = message;
      const shortCode = this.resolveShortCode(data);
      if (!shortCode) {
        this.logger.warn(`Skipping click ${id} with no short code`);
        ackIds.push(id);
        continue;
      }

      clicksToInsert.push({
        short_code: shortCode,
        clicked_at: new Date(Number(data.clickedAt || Date.now())),
        ip_address: this.normalizeNullable(data.ipAddress || data.ip_address),
        user_agent: this.normalizeNullable(data.userAgent || data.user_agent),
        referrer: this.normalizeNullable(data.referrer),
        country: this.normalizeNullable(data.country),
        device_type: this.normalizeNullable(
          data.deviceType || data.device_type,
        ),
        browser: this.normalizeNullable(data.browser),
        os: this.normalizeNullable(data.os),
      });

      shortCodeCounts.set(shortCode, (shortCodeCounts.get(shortCode) || 0) + 1);
      ackIds.push(id);
    }

    if (clicksToInsert.length > 0) {
      await this.clickRepo.insert(clicksToInsert);
    }

    for (const [shortCode, count] of shortCodeCounts.entries()) {
      await this.urlRepo
        .createQueryBuilder()
        .update(Url)
        .set({ click_count: () => `click_count + ${count}` })
        .where('short_code = :shortCode', { shortCode })
        .execute();
    }

    // Single batched xack — one Redis round-trip instead of N
    if (ackIds.length > 0) {
      await this.redisService
        .getClient()
        .xack(this.streamName, this.groupName, ...ackIds);
    }
  }

  private resolveShortCode(data: Record<string, any>): string | null {
    const code = data.shortCode || data.short_code;
    return typeof code === 'string' && code.length > 0 ? code : null;
  }

  private normalizeNullable(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
