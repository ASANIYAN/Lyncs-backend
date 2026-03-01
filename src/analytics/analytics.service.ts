import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly clicksStreamName = 'clicks:events';
  private readonly safetyStreamName = 'safety:checks';
  private readonly streamMaxLength = 10000;

  constructor(private readonly redisService: RedisService) {}

  // Enqueue a click event into Redis stream for asynchronous processing
  async enqueueClick(payload: Record<string, any>): Promise<void> {
    try {
      await this.redisService.addToStream(
        this.clicksStreamName,
        payload,
        this.streamMaxLength,
      );
    } catch (err) {
      this.logger.warn('Failed to enqueue analytics event', err);
    }
  }

  // Enqueue a safety check job
  async queueSafetyCheck(payload: Record<string, any>): Promise<void> {
    try {
      await this.redisService.addToStream(
        this.safetyStreamName,
        payload,
        this.streamMaxLength,
      );
    } catch (err) {
      this.logger.warn('Failed to enqueue safety check', err);
    }
  }

  // Queue click events so redirects never block on synchronous DB writes.
  async trackClick(shortCode: string, req: FastifyRequest): Promise<void> {
    try {
      const clickData = this.extractClickData(shortCode, req);
      await this.redisService.addToStream(
        this.clicksStreamName,
        clickData,
        this.streamMaxLength,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to queue click for ${shortCode}: ${msg}`);
    }
  }

  async getQueueHealth() {
    try {
      const pendingCount = await this.redisService.getPendingCount(
        this.clicksStreamName,
        'clicks-workers',
      );
      const totalLength = await this.redisService
        .getClient()
        .xlen(this.clicksStreamName);

      return {
        streamName: this.clicksStreamName,
        pendingEvents: pendingCount,
        totalLength,
        healthy: pendingCount < 1000,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        streamName: this.clicksStreamName,
        healthy: false,
        error: message,
      };
    }
  }

  private extractClickData(shortCode: string, req: FastifyRequest) {
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';
    const referrer = (req.headers['referer'] as string) || 'direct';
    const ipAddress = req.ip || 'unknown';
    const countryHeader = req.headers['cf-ipcountry'];
    const country =
      typeof countryHeader === 'string' && countryHeader.length > 0
        ? countryHeader
        : 'XX';
    const parsed = this.parseUserAgent(userAgent);

    return {
      shortCode,
      clickedAt: Date.now(),
      ipAddress,
      userAgent,
      referrer,
      country,
      deviceType: parsed.deviceType,
      browser: parsed.browser,
      os: parsed.os,
    };
  }

  private parseUserAgent(userAgent: string): {
    deviceType: string;
    browser: string;
    os: string;
  } {
    const ua = userAgent.toLowerCase();
    const isBot =
      ua.includes('bot') || ua.includes('crawler') || ua.includes('spider');

    const browser = ua.includes('edg/')
      ? 'Edge'
      : ua.includes('chrome/')
        ? 'Chrome'
        : ua.includes('firefox/')
          ? 'Firefox'
          : ua.includes('safari/') && !ua.includes('chrome/')
            ? 'Safari'
            : isBot
              ? 'Bot'
              : 'Unknown';

    const os = ua.includes('windows')
      ? 'Windows'
      : ua.includes('mac os') || ua.includes('macintosh')
        ? 'macOS'
        : ua.includes('android')
          ? 'Android'
          : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')
            ? 'iOS'
            : ua.includes('linux')
              ? 'Linux'
              : 'Unknown';

    const deviceType = isBot
      ? 'bot'
      : ua.includes('mobile')
        ? 'mobile'
        : ua.includes('tablet') || ua.includes('ipad')
          ? 'tablet'
          : 'desktop';

    return { deviceType, browser, os };
  }
}
