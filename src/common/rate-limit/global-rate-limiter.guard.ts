import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { RateLimitPolicy, RATE_LIMIT_PROFILES } from './rate-limit.constants';
import {
  RATE_LIMIT_METADATA_KEY,
  SKIP_RATE_LIMIT_METADATA_KEY,
} from './rate-limit.decorator';

type AuthPayload = {
  sub?: string;
  id?: string;
};

type RateLimitRequest = FastifyRequest & {
  user?: {
    id?: unknown;
  };
};

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class GlobalRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(GlobalRateLimiterGuard.name);
  private readonly jwtAccessSecret: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtAccessSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
      '',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipRateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const policies = this.reflector.getAllAndOverride<RateLimitPolicy[]>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [RATE_LIMIT_PROFILES.GLOBAL_DEFAULT];

    const routeId = `${context.getClass().name}.${context.getHandler().name}`;
    const identity = await this.resolveIdentity(request);

    let tightestRemaining: number | null = null;
    let tightestResetSeconds: number | null = null;
    let appliedPolicy: RateLimitPolicy | null = null;

    for (const policy of policies) {
      const effectivePolicy = this.resolvePolicy(policy);
      const key = this.buildKey(effectivePolicy, routeId, request, identity);
      const { count, ttlSeconds } = await this.incrementAndReadWindow(
        key,
        effectivePolicy.windowSeconds,
      );

      const remaining = Math.max(effectivePolicy.maxRequests - count, 0);

      if (
        tightestRemaining === null ||
        remaining < tightestRemaining ||
        (remaining === tightestRemaining &&
          (tightestResetSeconds ?? Infinity) < ttlSeconds)
      ) {
        tightestRemaining = remaining;
        tightestResetSeconds = ttlSeconds;
        appliedPolicy = effectivePolicy;
      }

      if (count > effectivePolicy.maxRequests) {
        reply.header('Retry-After', String(ttlSeconds));
        reply.header('X-RateLimit-Limit', String(effectivePolicy.maxRequests));
        reply.header('X-RateLimit-Remaining', '0');
        reply.header('X-RateLimit-Reset', String(ttlSeconds));

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded. Please try again later.',
            policy: effectivePolicy.name,
            retryAfterSeconds: ttlSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (
      appliedPolicy &&
      tightestRemaining !== null &&
      tightestResetSeconds !== null
    ) {
      reply.header('X-RateLimit-Limit', String(appliedPolicy.maxRequests));
      reply.header('X-RateLimit-Remaining', String(tightestRemaining));
      reply.header('X-RateLimit-Reset', String(tightestResetSeconds));
    }

    return true;
  }

  private async resolveIdentity(request: RateLimitRequest): Promise<{
    userId: string | null;
    normalizedEmail: string | null;
  }> {
    const body = request.body as Record<string, unknown> | undefined;
    const bodyEmail = body?.email;
    const normalizedEmail =
      typeof bodyEmail === 'string' ? bodyEmail.trim().toLowerCase() : null;

    if (
      request.user &&
      typeof request.user === 'object' &&
      'id' in request.user
    ) {
      const userId = request.user.id;
      if (typeof userId === 'string' && userId.length > 0) {
        return { userId, normalizedEmail };
      }
    }

    const token = this.extractBearerToken(request);
    if (!token || !this.jwtAccessSecret) {
      return { userId: null, normalizedEmail };
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthPayload>(token, {
        secret: this.jwtAccessSecret,
      });
      const userId = payload.sub ?? payload.id ?? null;
      return { userId, normalizedEmail };
    } catch {
      this.logger.debug(
        'Unable to resolve user from bearer token for rate limiting',
      );
      return { userId: null, normalizedEmail };
    }
  }

  private buildKey(
    policy: RateLimitPolicy,
    routeId: string,
    request: RateLimitRequest,
    identity: { userId: string | null; normalizedEmail: string | null },
  ): string {
    const parts = [`rl:v2`, policy.name, routeId];

    for (const dimension of policy.dimensions) {
      if (dimension === 'ip') {
        parts.push(`ip:${this.hashPart(request.ip ?? 'unknown')}`);
      }

      if (dimension === 'user') {
        parts.push(
          identity.userId
            ? `usr:${this.hashPart(identity.userId)}`
            : 'usr:anonymous',
        );
      }

      if (dimension === 'email') {
        parts.push(
          identity.normalizedEmail
            ? `em:${this.hashPart(identity.normalizedEmail)}`
            : 'em:none',
        );
      }
    }

    return parts.join(':');
  }

  private async incrementAndReadWindow(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number }> {
    const result = (await this.redisService
      .getClient()
      .eval(RATE_LIMIT_SCRIPT, 1, key, String(windowSeconds))) as [
      number | string,
      number | string,
    ];

    const count = Number(result[0]);
    const ttlSeconds = Number(result[1]);

    return {
      count: Number.isFinite(count) ? count : 0,
      ttlSeconds:
        Number.isFinite(ttlSeconds) && ttlSeconds > 0
          ? ttlSeconds
          : windowSeconds,
    };
  }

  private extractBearerToken(request: RateLimitRequest): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    if (!token) return authHeader.trim() || null;
    if (scheme.toLowerCase() !== 'bearer') return null;

    const parsed = token.trim();
    return parsed.length > 0 ? parsed : null;
  }

  private hashPart(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private resolvePolicy(policy: RateLimitPolicy): RateLimitPolicy {
    const envPrefix = `RATE_${policy.name.toUpperCase()}`;
    const envMax = this.configService.get<string>(`${envPrefix}_MAX`);
    const envWindow = this.configService.get<string>(`${envPrefix}_WINDOW`);

    return {
      ...policy,
      maxRequests: this.parsePositiveInt(envMax, policy.maxRequests),
      windowSeconds: this.parsePositiveInt(envWindow, policy.windowSeconds),
    };
  }

  private parsePositiveInt(
    value: string | undefined,
    fallback: number,
  ): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
