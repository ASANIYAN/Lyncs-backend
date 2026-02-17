import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private redisService: RedisService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      console.log('Unauthorized error: Token not exist');
      throw new UnauthorizedException();
    }

    const isBlacklisted = await this.redisService.exists(`bl_${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Session expired or logged out');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });
      request.user = payload;
      return true;
    } catch (error) {
      console.log('Unauthorized error: ', error);
      throw new UnauthorizedException();
    }
  }

  private extractTokenFromHeader(request: {
    headers?: {
      authorization?: string;
    };
  }): string | undefined {
    const authHeader = request?.headers?.authorization;

    if (!authHeader) {
      console.log('No authorization header found');
      return undefined;
    }

    const parts = authHeader.split(' ');
    const [type, token] = parts;

    if (type !== 'Bearer') {
      console.log(`Invalid auth type: ${type}, expected 'Bearer'`);
      return undefined;
    }

    if (!token) {
      console.log('Token is empty');
      return undefined;
    }

    console.log('Token extracted successfully');
    return token;
  }
}
