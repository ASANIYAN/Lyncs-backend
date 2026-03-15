import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UrlModule } from './url/url.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false,
        // Log slow queries in development to surface bottlenecks
        logging:
          config.get('NODE_ENV') !== 'production'
            ? ['error', 'warn']
            : ['error'],
        maxQueryExecutionTime: 200, // log any query over 200ms
        // Connection pool — pre-warmed to eliminate per-request TCP overhead in Docker
        extra: {
          max: config.get<number>('DB_POOL_MAX', 20),
          min: config.get<number>('DB_POOL_MIN', 5),
          idleTimeoutMillis: config.get<number>('DB_POOL_IDLE_TIMEOUT', 30000),
          connectionTimeoutMillis: config.get<number>(
            'DB_POOL_ACQUIRE_TIMEOUT',
            5000,
          ),
          // Kill zombie queries that run longer than 10s
          statement_timeout: 10000,
          query_timeout: 10000,
          // Keep connections alive across Docker bridge network idle periods
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        },
      }),
    }),
    RedisModule,
    AuthModule,
    UrlModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
