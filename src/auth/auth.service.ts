import * as bcrypt from 'bcrypt';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from './dto/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.saltRounds = Number(this.configService.get('AUTH_SALT_ROUNDS', 12));
  }

  async hashPassword(password: string): Promise<string> {
    if (Buffer.byteLength(password) > 72) {
      throw new BadRequestException('Password exceeds maximum secure length');
    }

    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error: unknown) {
      // Fixed: Proper parentheses instead of backticks
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Hashing failure: ${errorMessage}`);
      throw new InternalServerErrorException('Security service error');
    }
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;

    try {
      return await bcrypt.compare(password, hash);
    } catch (error: unknown) {
      // Fixed: Proper parentheses instead of backticks
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Comparison failure: ${errorMessage}`);
      return false;
    }
  }

  async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: '30m', // Short-lived Access Token
        secret: process.env.JWT_ACCESS_SECRET,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: '7d', // Long-lived Refresh Token
        secret: process.env.JWT_REFRESH_SECRET,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async logout(token: string) {
    const decoded: any = this.jwtService.decode(token);
    const remainingTime = decoded.exp - Math.floor(Date.now() / 1000);

    if (remainingTime > 0) {
      await this.redisService.set(`bl_${token}`, 'revoked', remainingTime);
    }
  }
}
