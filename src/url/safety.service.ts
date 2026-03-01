import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../common/redis/redis.service';
import { BlockedDomain } from '../auth/dto/entities/refresh-token.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);
  private readonly REDIS_BLOCKLIST_KEY = 'cache:blocked_domains';
  private readonly REDIS_SAFETY_KEY = 'cache:safety';
  private readonly SAFETY_SAFE_TTL_SECONDS = 86400;
  private readonly SAFETY_UNSAFE_TTL_SECONDS = 3600;
  private readonly WEB_RISK_BASE_URL =
    'https://webrisk.googleapis.com/v1/uris:search';
  private readonly WEB_RISK_THREAT_TYPES = [
    'MALWARE',
    'SOCIAL_ENGINEERING',
  ] as const;
  private readonly LOCAL_HOSTNAMES = new Set(['localhost']);
  private readonly LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
  private readonly safeBrowsingApiKey?: string;

  constructor(
    @InjectRepository(BlockedDomain)
    private readonly blockedDomainRepository: Repository<BlockedDomain>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.safeBrowsingApiKey = this.configService.get<string>(
      'GOOGLE_SAFE_BROWSING_API_KEY',
    );
  }

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

  async checkUrlSafety(url: string): Promise<'safe' | 'unsafe' | 'unknown'> {
    if (!this.safeBrowsingApiKey) {
      return 'unknown';
    }

    if (this.isLocalUrl(url)) {
      return 'safe';
    }

    const cacheKey = `${this.REDIS_SAFETY_KEY}:${encodeURIComponent(url)}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached === 'safe' || cached === 'unsafe') {
      return cached;
    }

    try {
      const params = new URLSearchParams({
        key: this.safeBrowsingApiKey,
        uri: url,
      });
      this.WEB_RISK_THREAT_TYPES.forEach(type =>
        params.append('threatTypes', type),
      );
      const response = await fetch(
        `${this.WEB_RISK_BASE_URL}?${params.toString()}`,
      );

      if (!response.ok) {
        this.logger.warn(`Safety API returned ${response.status}`);
        return 'unknown';
      }

      const body = (await response.json()) as { threat?: unknown };
      const verdict: 'safe' | 'unsafe' = body.threat ? 'unsafe' : 'safe';
      await this.redisService.set(
        cacheKey,
        verdict,
        verdict === 'safe'
          ? this.SAFETY_SAFE_TTL_SECONDS
          : this.SAFETY_UNSAFE_TTL_SECONDS,
      );
      return verdict;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Safety check failed: ${msg}`);
      return 'unknown';
    }
  }

  private isLocalUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return this.LOCAL_HOSTNAMES.has(host) || this.LOOPBACK_HOSTS.has(host);
    } catch {
      return false;
    }
  }
}
