import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../common/redis/redis.service';
import { Url } from './entities/url.entity';
import { SafetyService } from './safety.service';

@Injectable()
export class SafetyWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SafetyWorker.name);
  private isRunning = false;
  private readonly streamName = 'safety:checks';
  private readonly groupName = 'safety-workers';
  private readonly consumerName = `safety-worker-${process.pid}`;

  constructor(
    private readonly redisService: RedisService,
    private readonly safetyService: SafetyService,
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
  ) {}

  onModuleInit() {
    if (!this.shouldRunWorkers()) {
      this.logger.log('Safety worker disabled by ENABLE_WORKERS=false');
      return;
    }
    this.startConsuming().catch(err =>
      this.logger.error('Safety worker failed', err),
    );
  }

  onModuleDestroy() {
    this.isRunning = false;
  }

  private async startConsuming() {
    this.isRunning = true;
    this.logger.log(`Safety worker started: ${this.consumerName}`);

    while (this.isRunning) {
      try {
        const messages = await this.redisService.readFromStream(
          this.streamName,
          this.groupName,
          this.consumerName,
          10,
          5000,
        );

        for (const message of messages) {
          await this.processMessage(message.id, message.data);
        }
      } catch (error: unknown) {
        this.logger.error('Safety worker loop error', error);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  private async processMessage(messageId: string, data: Record<string, any>) {
    try {
      const shortCode = String(data.shortCode ?? data.short_code ?? '');
      const originalUrl = String(data.url ?? data.original_url ?? '');
      if (!shortCode || !originalUrl) {
        await this.redisService.ackMessage(
          this.streamName,
          this.groupName,
          messageId,
        );
        return;
      }

      const result = await this.safetyService.checkUrl(String(originalUrl));

      if (result.skipped) {
        // URL was not checked — mark as unchecked so it can be reprocessed
        await this.urlRepository.update(
          { short_code: String(shortCode) },
          { safety_checked: false, safety_checked_at: undefined },
        );
      } else {
        // URL was checked — persist the result
        await this.urlRepository.update(
          { short_code: String(shortCode) },
          {
            safety_checked: true,
            safety_checked_at: new Date(),
            is_active: result.safe,
            safety_status: result.safe ? 'safe' : 'unsafe',
            last_checked_at: new Date(),
          },
        );
      }

      await this.redisService.getClient().del(`url:${String(shortCode)}`);
      await this.redisService.ackMessage(
        this.streamName,
        this.groupName,
        messageId,
      );
    } catch (error: unknown) {
      this.logger.error(`Failed to process safety message ${messageId}`, error);
    }
  }

  private shouldRunWorkers(): boolean {
    return process.env.ENABLE_WORKERS !== 'false';
  }
}
