import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { RedisService } from '../common/redis/redis.service';
import { BlockedDomain } from '../auth/dto/entities/refresh-token.entity';
import { ConfigService } from '@nestjs/config';

export interface SafetyCheckResult {
  safe: boolean;
  skipped: boolean;
  reason?: 'trusted_domain' | 'quota_exhausted' | 'api_checked';
}

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);
  private readonly REDIS_BLOCKLIST_KEY = 'cache:blocked_domains';
  private readonly MONTHLY_QUOTA = 900;
  private readonly WEB_RISK_BASE_URL =
    'https://webrisk.googleapis.com/v1/uris:search';
  private readonly WEB_RISK_THREAT_TYPES = [
    'MALWARE',
    'SOCIAL_ENGINEERING',
  ] as const;
  private readonly LOCAL_HOSTNAMES = new Set(['localhost']);
  private readonly LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
  private readonly TRUSTED_DOMAINS = [
    'github.com',
    'google.com',
    'youtube.com',
    'twitter.com',
    'linkedin.com',
    'stackoverflow.com',
    'wikipedia.org',
    'amazon.com',
    'docs.google.com',
    'notion.so',
    'figma.com',
  ];
  private readonly webRiskApiKey?: string;

  constructor(
    @InjectRepository(BlockedDomain)
    private readonly blockedDomainRepository: Repository<BlockedDomain>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.webRiskApiKey = this.configService.get<string>(
      'GOOGLE_WEB_RISK_API_KEY',
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

  /**
   * Main entry point for async safety checking (called by SafetyWorker).
   * Applies three guards in order: trusted domain → cache → quota → API call.
   */
  async checkUrl(url: string): Promise<SafetyCheckResult> {
    // Step 1 — Trusted domain: skip API call entirely
    if (this.isTrustedDomain(url)) {
      return { safe: true, skipped: true, reason: 'trusted_domain' };
    }

    // Step 2 — Cache: return previously stored result
    const cacheKey = `safety:${createHash('sha256').update(url).digest('hex')}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as SafetyCheckResult;
    }

    // Step 3 — Quota guard: fail open when monthly limit is reached
    const hasQuota = await this.isSafetyQuotaAvailable();
    if (!hasQuota) {
      return { safe: true, skipped: true, reason: 'quota_exhausted' };
    }

    // Step 4 — API call
    if (!this.webRiskApiKey) {
      return { safe: true, skipped: true, reason: 'quota_exhausted' };
    }

    if (this.isLocalUrl(url)) {
      return { safe: true, skipped: false, reason: 'api_checked' };
    }

    try {
      const params = new URLSearchParams({ key: this.webRiskApiKey, uri: url });
      this.WEB_RISK_THREAT_TYPES.forEach(type =>
        params.append('threatTypes', type),
      );
      const response = await fetch(
        `${this.WEB_RISK_BASE_URL}?${params.toString()}`,
      );

      if (!response.ok) {
        this.logger.warn(`Web Risk API returned ${response.status} for ${url}`);
        return { safe: true, skipped: true, reason: 'quota_exhausted' };
      }

      const body = (await response.json()) as { threat?: unknown };
      const result: SafetyCheckResult = {
        safe: !body.threat,
        skipped: false,
        reason: 'api_checked',
      };

      // Cache the result for 7 days
      await this.redisService.set(
        cacheKey,
        JSON.stringify(result),
        7 * 24 * 60 * 60,
      );
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Web Risk API call failed: ${msg}`);
      return { safe: true, skipped: true, reason: 'quota_exhausted' };
    }
  }

  /**
   * Legacy method kept for callers that only need a simple string verdict
   * (e.g. synchronous inline checks). Delegates to checkUrl() internally.
   */
  async checkUrlSafety(url: string): Promise<'safe' | 'unsafe' | 'unknown'> {
    const result = await this.checkUrl(url);
    if (result.skipped) return 'unknown';
    return result.safe ? 'safe' : 'unsafe';
  }

  private isTrustedDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname
        .toLowerCase()
        .replace(/^www\./, '');
      return this.TRUSTED_DOMAINS.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`),
      );
    } catch {
      return false;
    }
  }

  private async isSafetyQuotaAvailable(): Promise<boolean> {
    const key = `web_risk:quota:${new Date().toISOString().slice(0, 7)}`;
    const count = await this.redisService.incr(key);

    // On first increment, set TTL so key auto-expires after 35 days
    if (count === 1) {
      await this.redisService.expire(key, 35 * 24 * 60 * 60);
    }

    if (count > this.MONTHLY_QUOTA) {
      this.logger.warn(
        `Web Risk monthly quota exhausted for ${key} — skipping API call`,
      );
      return false;
    }

    return true;
  }

  private extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
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
