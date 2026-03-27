import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import configuration from './config/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UrlModule } from './url/url.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GlobalRateLimiterGuard } from './common/rate-limit/global-rate-limiter.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // PRODUCTION: Use DATABASE_URL (Supabase/Render)
        const databaseUrl = config.get<string>('DATABASE_URL');

        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            ssl: {
              rejectUnauthorized: false, // Required for Supabase
            },
            autoLoadEntities: true,
            synchronize: false,
            logging:
              config.get('NODE_ENV') !== 'production'
                ? ['error', 'warn']
                : ['error'],
            maxQueryExecutionTime: 200,
            extra: {
              max: config.get<number>('DB_POOL_MAX', 10), // Lower for Supabase pooler
              min: config.get<number>('DB_POOL_MIN', 2),
              idleTimeoutMillis: config.get<number>(
                'DB_POOL_IDLE_TIMEOUT',
                30000,
              ),
              connectionTimeoutMillis: config.get<number>(
                'DB_POOL_ACQUIRE_TIMEOUT',
                5000,
              ),
              statement_timeout: 10000,
              query_timeout: 10000,
              keepAlive: true,
              keepAliveInitialDelayMillis: 10000,
            },
          };
        }

        // LOCAL DEVELOPMENT: Use individual env vars
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT'),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          autoLoadEntities: true,
          synchronize: false,
          logging:
            config.get('NODE_ENV') !== 'production'
              ? ['error', 'warn']
              : ['error'],
          maxQueryExecutionTime: 200,
          extra: {
            max: config.get<number>('DB_POOL_MAX', 20),
            min: config.get<number>('DB_POOL_MIN', 5),
            idleTimeoutMillis: config.get<number>(
              'DB_POOL_IDLE_TIMEOUT',
              30000,
            ),
            connectionTimeoutMillis: config.get<number>(
              'DB_POOL_ACQUIRE_TIMEOUT',
              5000,
            ),
            statement_timeout: 10000,
            query_timeout: 10000,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
          },
        };
      },
    }),
    RedisModule,
    AuthModule,
    UrlModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: GlobalRateLimiterGuard,
    },
  ],
})
export class AppModule {}
