import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../common/redis/redis.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './dto/entities/user.entity';
import { RefreshToken } from './dto/entities/refresh-token.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailOtp } from './dto/entities/email-otp.entity';
import { MailerModule } from '../common/mailer/mailer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, EmailOtp]),
    PassportModule,
    JwtModule.register({}),
    ConfigModule,
    RedisModule,
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtModule, TypeOrmModule, JwtAuthGuard],
})
export class AuthModule {}
