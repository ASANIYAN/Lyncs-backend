import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Url } from './entities/url.entity';
import { UrlService } from './url.service';
import { SafetyService } from './safety.service';
import { Base62Generator } from './utils/base62.generator';
import { BlockedDomain } from '../auth/dto/entities/refresh-token.entity';
import { RedirectController, UrlController } from './url.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { UrlNormalizerService } from './url-normalizer.service';
import { SafetyWorker } from './safety.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([Url, BlockedDomain]),
    AnalyticsModule,
    AuthModule,
  ],
  providers: [
    UrlService,
    SafetyService,
    Base62Generator,
    UrlNormalizerService,
    SafetyWorker,
  ],
  controllers: [UrlController, RedirectController],
  exports: [UrlService],
})
export class UrlModule {}
