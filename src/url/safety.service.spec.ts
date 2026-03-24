import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { SafetyService, SafetyCheckResult } from './safety.service';
import { RedisService } from '../common/redis/redis.service';
import { BlockedDomain } from '../auth/dto/entities/refresh-token.entity';

const sha256 = (input: string): string =>
  createHash('sha256').update(input).digest('hex');

const SEVEN_DAYS_TTL = 7 * 24 * 60 * 60;
const THIRTY_FIVE_DAYS_TTL = 35 * 24 * 60 * 60;

type MockRedisService = {
  get: jest.Mock<Promise<string | null>, [string]>;
  set: jest.Mock<Promise<void>, [string, string, number?]>;
  exists: jest.Mock<Promise<boolean>, [string]>;
  incr: jest.Mock<Promise<number>, [string]>;
  expire: jest.Mock<Promise<void>, [string, number]>;
};

type MockBlockedDomainRepo = {
  findOne: jest.Mock;
};

function makeRedisService(): MockRedisService {
  return {
    get: jest.fn<Promise<string | null>, [string]>(),
    set: jest
      .fn<Promise<void>, [string, string, number?]>()
      .mockResolvedValue(undefined),
    exists: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false),
    incr: jest.fn<Promise<number>, [string]>().mockResolvedValue(1),
    expire: jest
      .fn<Promise<void>, [string, number]>()
      .mockResolvedValue(undefined),
  };
}

function makeBlockedDomainRepo(): MockBlockedDomainRepo {
  return { findOne: jest.fn().mockResolvedValue(null) };
}

// ---------------------------------------------------------------------------
// fetch mock — hoisted at module level so it intercepts global fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn<
  Promise<Response>,
  [RequestInfo | URL, RequestInit?]
>();
global.fetch = mockFetch as typeof global.fetch;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SafetyService', () => {
  let service: SafetyService;
  let redisService: MockRedisService;
  let blockedDomainRepo: MockBlockedDomainRepo;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    redisService = makeRedisService();
    blockedDomainRepo = makeBlockedDomainRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyService,
        { provide: RedisService, useValue: redisService },
        {
          provide: getRepositoryToken(BlockedDomain),
          useValue: blockedDomainRepo,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-web-risk-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get<SafetyService>(SafetyService);

    // Spy on the NestJS logger attached to this service instance
    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    jest.clearAllMocks();
    mockFetch.mockReset();

    // Re-apply default resolved values after clearAllMocks
    redisService.set.mockResolvedValue(undefined);
    redisService.exists.mockResolvedValue(false);
    redisService.incr.mockResolvedValue(1);
    redisService.expire.mockResolvedValue(undefined);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // isTrustedDomain (tested indirectly via checkUrl — the method is private,
  // so we assert on the observable output: skipped=true with reason=trusted_domain)
  // ─────────────────────────────────────────────────────────────────────────

  describe('isTrustedDomain (via checkUrl)', () => {
    it('should return skipped:true for an exact trusted domain match', async () => {
      const result = await service.checkUrl('https://github.com/some/repo');
      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'trusted_domain',
      });
    });

    it('should return skipped:true for a www. prefixed trusted domain', async () => {
      const result = await service.checkUrl('https://www.github.com/some/repo');
      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'trusted_domain',
      });
    });

    it('should return skipped:true for a subdomain of a trusted domain', async () => {
      const result = await service.checkUrl(
        'https://docs.github.com/en/actions',
      );
      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'trusted_domain',
      });
    });

    it('should NOT return skipped:true for an untrusted domain', async () => {
      // Quota will fire — just ensure isTrustedDomain path is NOT taken
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({ threat: undefined }),
      } as unknown as Response);

      const result = await service.checkUrl(
        'https://malicious-site.com/phishing',
      );
      expect(result.reason).not.toBe('trusted_domain');
    });

    it('should NOT skip a domain that only partially matches a trusted domain as a substring', async () => {
      // 'notgithub.com' ends with 'github.com' but is not a subdomain
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({ threat: undefined }),
      } as unknown as Response);

      const result = await service.checkUrl('https://notgithub.com');
      expect(result.reason).not.toBe('trusted_domain');
    });

    it('should not throw and should proceed to cache/quota path for a malformed URL', async () => {
      // isTrustedDomain returns false, falls through to cache check
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(901); // quota exhausted — clean exit

      const result = await service.checkUrl('not-a-valid-url');
      expect(result.reason).not.toBe('trusted_domain');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // isSafetyQuotaAvailable (tested via checkUrl after a cache miss)
  // ─────────────────────────────────────────────────────────────────────────

  describe('isSafetyQuotaAvailable (via checkUrl)', () => {
    const untrustedUrl = 'https://some-unique-url.com';

    beforeEach(() => {
      // Ensure cache always misses for this group
      redisService.get.mockResolvedValue(null);
    });

    it('should call expire with 35-day TTL when it is the first call this month', async () => {
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({}),
      } as unknown as Response);

      await service.checkUrl(untrustedUrl);

      expect(redisService.expire).toHaveBeenCalledTimes(1);
      expect(redisService.expire).toHaveBeenCalledWith(
        expect.stringMatching(/^web_risk:quota:/),
        THIRTY_FIVE_DAYS_TTL,
      );
    });

    it('should NOT call expire when count is above 1 (TTL already set)', async () => {
      redisService.incr.mockResolvedValue(500);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({}),
      } as unknown as Response);

      await service.checkUrl(untrustedUrl);

      expect(redisService.expire).not.toHaveBeenCalled();
    });

    it('should return a non-skipped result and not warn when count is exactly at the limit (900)', async () => {
      redisService.incr.mockResolvedValue(900);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({}),
      } as unknown as Response);

      const result = await service.checkUrl(untrustedUrl);

      expect(result.skipped).toBe(false);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('should return quota_exhausted and log a warning when count exceeds 900', async () => {
      redisService.incr.mockResolvedValue(901);

      const result = await service.checkUrl(untrustedUrl);

      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'quota_exhausted',
      });
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('should log a warning message that references the quota key', async () => {
      redisService.incr.mockResolvedValue(901);

      await service.checkUrl(untrustedUrl);

      const warnCalls = loggerWarnSpy.mock.calls as [string, ...unknown[]][];
      const warnArg = warnCalls[0][0];
      expect(warnArg).toMatch(/web_risk:quota:/);
    });

    it('should scope the quota key to the current month', async () => {
      // Pin time to 2026-03-24
      const fixedDate = new Date('2026-03-24T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(fixedDate);

      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({}),
      } as unknown as Response);

      await service.checkUrl(untrustedUrl);

      expect(redisService.incr).toHaveBeenCalledWith('web_risk:quota:2026-03');

      jest.useRealTimers();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // checkUrl — full orchestration
  // ─────────────────────────────────────────────────────────────────────────

  describe('checkUrl', () => {
    const untrustedUrl = 'https://some-url.com';

    it('should return trusted_domain without touching Redis or the API', async () => {
      const result = await service.checkUrl('https://github.com/foo');

      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'trusted_domain',
      });
      expect(redisService.get).not.toHaveBeenCalled();
      expect(redisService.incr).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return the cached result without calling the API or incrementing quota', async () => {
      const cachedResult: SafetyCheckResult = {
        safe: true,
        skipped: false,
        reason: 'api_checked',
      };
      redisService.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await service.checkUrl(untrustedUrl);

      expect(result).toEqual(cachedResult);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(redisService.incr).not.toHaveBeenCalled();
    });

    it('should use a SHA-256 prefixed key for the cache lookup', async () => {
      const expectedKey = `safety:${sha256(untrustedUrl)}`;
      redisService.get.mockResolvedValue(
        JSON.stringify({ safe: true, skipped: false }),
      );

      await service.checkUrl(untrustedUrl);

      expect(redisService.get).toHaveBeenCalledWith(expectedKey);
    });

    it('should return quota_exhausted without calling the API when quota is exceeded', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(901);

      const result = await service.checkUrl(untrustedUrl);

      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'quota_exhausted',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should NOT call redisService.set when quota is exhausted', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(901);

      await service.checkUrl(untrustedUrl);

      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('should call the Web Risk API when all guards pass', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({}),
      } as unknown as Response);

      await service.checkUrl(untrustedUrl);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return safe:true and skipped:false when the API finds no threat', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({}), // no 'threat' key → safe
      } as unknown as Response);

      const result = await service.checkUrl(untrustedUrl);

      expect(result.safe).toBe(true);
      expect(result.skipped).toBe(false);
    });

    it('should cache the safe result with a 7-day TTL after a successful API call', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({}),
      } as unknown as Response);

      await service.checkUrl(untrustedUrl);

      const expectedKey = `safety:${sha256(untrustedUrl)}`;
      const expectedValue = JSON.stringify({
        safe: true,
        skipped: false,
        reason: 'api_checked',
      });
      expect(redisService.set).toHaveBeenCalledWith(
        expectedKey,
        expectedValue,
        SEVEN_DAYS_TTL,
      );
    });

    it('should return safe:false and cache it when the API flags the URL as unsafe', async () => {
      const unsafeUrl = 'https://malware-site.com';
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({ threat: { threatTypes: ['MALWARE'] } }), // threat present → unsafe
      } as unknown as Response);

      const result = await service.checkUrl(unsafeUrl);

      expect(result.safe).toBe(false);
      expect(result.skipped).toBe(false);

      const expectedKey = `safety:${sha256(unsafeUrl)}`;
      const cachedArg = redisService.set.mock.calls[0];
      const cachedValue = JSON.parse(cachedArg[1]) as SafetyCheckResult;
      expect(cachedValue.safe).toBe(false);
      expect(cachedArg[0]).toBe(expectedKey);
    });

    it('should return quota_exhausted and NOT cache when the API returns a non-2xx status', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => ({}),
      } as unknown as Response);

      const result = await service.checkUrl(untrustedUrl);

      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'quota_exhausted',
      });
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('should return quota_exhausted and NOT cache when the fetch call throws', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const result = await service.checkUrl(untrustedUrl);

      // checkUrl catches fetch errors internally and returns a skipped result
      expect(result).toEqual({
        safe: true,
        skipped: true,
        reason: 'quota_exhausted',
      });
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('should log an error when the fetch call throws', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.incr.mockResolvedValue(1);
      mockFetch.mockRejectedValue(new Error('Network failure'));

      await service.checkUrl(untrustedUrl);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
