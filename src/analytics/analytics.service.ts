import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Click } from './entities/click.entity';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
  ) {}

  // Tracks click event asynchronously
  // Extracts metadata from the request object.
  async trackClick(shortCode: string, req: FastifyRequest): Promise<void> {
    try {
      const userAgent = req.headers['user-agent'] || 'unknown';
      const referrer = req.headers['referer'] || 'direct';

      const ipAddress = req.ip;

      const country = (req.headers['cf-ipcountry'] as string) || 'XX';

      const click = this.clickRepository.create({
        short_code: shortCode,
        ip_address: ipAddress,
        user_agent: userAgent,
        referrer: referrer,
        country: country,
      });

      await this.clickRepository.save(click);

      await this.incrementUrlClickCount(shortCode);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to track click for ${shortCode}: ${msg}`);
    }
  }

  private async incrementUrlClickCount(shortCode: string): Promise<void> {
    // raw increment query to avoid race conditions with .save()
    await this.clickRepository.manager.query(
      `UPDATE urls SET click_count = click_count + 1 WHERE short_code = $1`,
      [shortCode],
    );
  }
}
