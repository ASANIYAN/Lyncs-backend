import * as bcrypt from 'bcrypt';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../common/redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { Repository } from 'typeorm';
import { RegisterDto } from './dto/register.dto';
import { User } from './dto/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

  async register(registerDto: RegisterDto): Promise<{ message: string }> {
    const { email, password } = registerDto;

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    try {
      const saltRounds = this.configService.get<number>('AUTH_SALT_ROUNDS', 12);
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const user = this.userRepository.create({
        email,
        password: hashedPassword,
      });

      await this.userRepository.save(user);
      return { message: 'User registered successfully' };
    } catch (error) {
      console.log('Error registering:', error);
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password'], // Explicitly select password
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);

    return { accessToken, refreshToken };
  }

  async logout(token: string): Promise<void> {
    try {
      // Decode without verification just to get the 'exp' claim
      const decoded = this.jwtService.decode(token);

      if (!decoded || !decoded.exp) {
        // If token is malformed, we just return
        return;
      }

      // Calculate TTL: expiration timestamp minus current time (in seconds)
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = decoded.exp - now;

      if (remainingTime > 0) {
        // Store in Redis with the specific TTL
        await this.redisService.set(`bl_${token}`, 'revoked', remainingTime);
      }
    } catch (error) {
      console.log('error: ', error);
      this.logger.error(`Logout failed for token: ${token}`);
    }
  }
}
