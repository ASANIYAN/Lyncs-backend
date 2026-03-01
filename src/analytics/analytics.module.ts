import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../common/redis/redis.module';
import { Click } from './entities/click.entity';
import { Url } from '../url/entities/url.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryService } from './analytics-query.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsWorker } from './analytics.worker';

@Module({
  imports: [TypeOrmModule.forFeature([Click, Url]), RedisModule],
  providers: [AnalyticsService, AnalyticsWorker, AnalyticsQueryService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
