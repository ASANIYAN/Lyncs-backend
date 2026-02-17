import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../common/redis/redis.service';
import { BlockedDomain } from '../auth/dto/entities/refresh-token.entity';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);
  private readonly REDIS_BLOCKLIST_KEY = 'cache:blocked_domains';

  constructor(
    @InjectRepository(BlockedDomain)
    private readonly blockedDomainRepository: Repository<BlockedDomain>,
    private readonly redisService: RedisService,
  ) {}

  async isDomainBlocked(url: string): Promise<boolean> {
    try {
      const domain = this.extractDomain(url);
      if (!domain) return true;

      // Check Redis Cache
      const isCached = await this.redisService.exists(
        `${this.REDIS_BLOCKLIST_KEY}:${domain}`,
      );
      if (isCached) return true;

      // Check DB
      const blocked = await this.blockedDomainRepository.findOne({
        where: { domain },
      });

      if (blocked) {
        // Cache result for 1 hour to prevent repeated DB hits
        await this.redisService.set(
          `${this.REDIS_BLOCKLIST_KEY}:${domain}`,
          '1',
          3600,
        );
        return true;
      }

      return false;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Safety check failed: ${msg}`);
      return true;
    }
  }

  private extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
