import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiterGuard } from './rate-limiter.guard';
import { RedisService } from '../../common/redis/redis.service';

describe('RateLimiterGuard', () => {
  let guard: RateLimiterGuard;
  let evalMock: jest.Mock;
  let redisService: jest.Mocked<Pick<RedisService, 'getClient'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(() => {
    evalMock = jest.fn();
    redisService = {
      getClient: jest.fn().mockReturnValue({ eval: evalMock }),
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

  it('should allow unauthenticated requests without touching Redis', async () => {
    const allowed = await guard.canActivate(makeContext());
    expect(allowed).toBe(true);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it('should allow first request and execute atomic Lua script', async () => {
    evalMock.mockResolvedValue(1);

    const allowed = await guard.canActivate(makeContext('user-1'));

    expect(allowed).toBe(true);
    expect(evalMock).toHaveBeenCalledTimes(1);
    // Verify the Lua script is called with the correct key and window TTL
    const args = evalMock.mock.calls[0] as unknown[];
    expect(args[2]).toBe('ratelimit:user-1:create_url');
    expect(args[3]).toBe('3600');
  });

  it('should throw HttpException when max requests exceeded', async () => {
    // Build a guard with a low limit of 2 directly at construction time
    const lowLimitConfig = {
      get: jest.fn().mockReturnValue(2),
    } as jest.Mocked<Pick<ConfigService, 'get'>>;
    const lowLimitGuard = new RateLimiterGuard(
      redisService as unknown as RedisService,
      lowLimitConfig as unknown as ConfigService,
    );
    evalMock.mockResolvedValue(3); // count 3 > limit 2

    await expect(
      lowLimitGuard.canActivate(makeContext('user-2')),
    ).rejects.toBeInstanceOf(HttpException);
    expect(evalMock).toHaveBeenCalledTimes(1); // still only one Redis call
  });
});
