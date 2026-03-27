import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { GlobalRateLimiterGuard } from './global-rate-limiter.guard';
import { RATE_LIMIT_PROFILES } from './rate-limit.constants';
import {
  RATE_LIMIT_METADATA_KEY,
  SKIP_RATE_LIMIT_METADATA_KEY,
} from './rate-limit.decorator';

describe('GlobalRateLimiterGuard', () => {
  let guard: GlobalRateLimiterGuard;
  let evalMock: jest.Mock;
  let headerMock: jest.Mock;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let configGetMock: jest.Mock;

  const makeContext = (request: Record<string, unknown>): ExecutionContext => {
    const handler = function testHandler() {};
    class TestController {}

    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({
          header: headerMock,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    evalMock = jest.fn().mockResolvedValue([1, 60]);
    headerMock = jest.fn();

    reflector = {
      getAllAndOverride: jest.fn(),
    };

    jwtService = {
      verifyAsync: jest.fn(),
    };

    const redisService = {
      getClient: jest.fn().mockReturnValue({ eval: evalMock }),
    } as unknown as RedisService;

    configGetMock = jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      return undefined;
    });
    const configService = {
      get: configGetMock,
    } as unknown as ConfigService;

    guard = new GlobalRateLimiterGuard(
      redisService,
      reflector as unknown as Reflector,
      jwtService as unknown as JwtService,
      configService,
    );
  });

  it('applies global default policy to unauthenticated routes', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === SKIP_RATE_LIMIT_METADATA_KEY) return false;
      if (metadataKey === RATE_LIMIT_METADATA_KEY) return undefined;
      return undefined;
    });

    const allowed = await guard.canActivate(
      makeContext({
        ip: '127.0.0.1',
        headers: {},
      }),
    );

    expect(allowed).toBe(true);
    expect(evalMock).toHaveBeenCalledTimes(1);

    const args = evalMock.mock.calls[0] as unknown[];
    const redisKey = String(args[2]);

    expect(redisKey).toContain('global_default');
    expect(redisKey).toContain('ip:');
    expect(redisKey).toContain('TestController.testHandler');
    expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Limit', '120');
  });

  it('applies email+ip policy for unauthenticated auth routes and blocks on exceed', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === SKIP_RATE_LIMIT_METADATA_KEY) return false;
      if (metadataKey === RATE_LIMIT_METADATA_KEY) {
        return [RATE_LIMIT_PROFILES.AUTH_LOGIN];
      }
      return undefined;
    });

    evalMock.mockResolvedValue([11, 600]);

    await expect(
      guard.canActivate(
        makeContext({
          ip: '10.0.0.8',
          headers: {},
          body: { email: 'User@Example.com' },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        status: HttpStatus.TOO_MANY_REQUESTS,
      }),
    );

    const args = evalMock.mock.calls[0] as unknown[];
    const redisKey = String(args[2]);
    expect(redisKey).toContain('auth_login');
    expect(redisKey).toContain('em:');
    expect(redisKey).toContain('ip:');

    expect(headerMock).toHaveBeenCalledWith('Retry-After', '600');
    expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });

  it('uses user+ip identity for authenticated policies via bearer token', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === SKIP_RATE_LIMIT_METADATA_KEY) return false;
      if (metadataKey === RATE_LIMIT_METADATA_KEY) {
        return [RATE_LIMIT_PROFILES.AUTH_PROFILE_READ];
      }
      return undefined;
    });

    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-123' });

    await guard.canActivate(
      makeContext({
        ip: '203.0.113.21',
        headers: { authorization: 'Bearer valid-token' },
      }),
    );

    const args = evalMock.mock.calls[0] as unknown[];
    const redisKey = String(args[2]);

    expect(redisKey).toContain('auth_profile_read');
    expect(redisKey).toContain('ip:');
    expect(redisKey).not.toContain('usr:anonymous');
    expect(redisKey).toMatch(/usr:[a-f0-9]{24}/);
  });

  it('allows env override for policy max and window values', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === SKIP_RATE_LIMIT_METADATA_KEY) return false;
      if (metadataKey === RATE_LIMIT_METADATA_KEY) {
        return [RATE_LIMIT_PROFILES.AUTH_LOGIN];
      }
      return undefined;
    });

    configGetMock.mockImplementation((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      if (key === 'RATE_AUTH_LOGIN_MAX') return '7';
      if (key === 'RATE_AUTH_LOGIN_WINDOW') return '300';
      return undefined;
    });

    evalMock.mockResolvedValue([8, 300]);

    await expect(
      guard.canActivate(
        makeContext({
          ip: '192.0.2.10',
          headers: {},
          body: { email: 'rate@example.com' },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        status: HttpStatus.TOO_MANY_REQUESTS,
      }),
    );

    const args = evalMock.mock.calls[0] as unknown[];
    expect(args[3]).toBe('300');
    expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Limit', '7');
  });
});
