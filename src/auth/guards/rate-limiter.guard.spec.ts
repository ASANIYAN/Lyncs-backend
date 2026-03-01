import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiterGuard } from './rate-limiter.guard';
import { RedisService } from '../../common/redis/redis.service';

describe('RateLimiterGuard', () => {
  let guard: RateLimiterGuard;
  let redisService: jest.Mocked<Pick<RedisService, 'incr' | 'expire'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(() => {
    redisService = {
      incr: jest.fn(),
      expire: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue(100),
    };

    guard = new RateLimiterGuard(
      redisService as unknown as RedisService,
      configService as unknown as ConfigService,
    );
  });

  const makeContext = (userId?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: userId ? { id: userId } : undefined,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('should allow unauthenticated requests', async () => {
    const allowed = await guard.canActivate(makeContext());
    expect(allowed).toBe(true);
    expect(redisService.incr).not.toHaveBeenCalled();
  });

  it('should set expiry for first request in window', async () => {
    redisService.incr.mockResolvedValue(1);

    const allowed = await guard.canActivate(makeContext('user-1'));

    expect(allowed).toBe(true);
    expect(redisService.incr).toHaveBeenCalledWith(
      'ratelimit:user-1:create_url',
    );
    expect(redisService.expire).toHaveBeenCalledWith(
      'ratelimit:user-1:create_url',
      3600,
    );
  });

  it('should throw when max requests exceeded', async () => {
    configService.get.mockReturnValue(2);
    redisService.incr.mockResolvedValue(3);

    await expect(
      guard.canActivate(makeContext('user-2')),
    ).rejects.toBeInstanceOf(HttpException);
    expect(redisService.expire).not.toHaveBeenCalled();
  });
});
