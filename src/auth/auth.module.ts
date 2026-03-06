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
import { Url } from '../url/entities/url.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, Url]),
    PassportModule,
    JwtModule.register({}),
    ConfigModule,
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtModule, TypeOrmModule, JwtAuthGuard],
})
export class AuthModule {}
