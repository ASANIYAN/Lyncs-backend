import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Url } from './entities/url.entity';
import { UrlService } from './url.service';
import { SafetyService } from './safety.service';
import { Base62Generator } from './utils/base62.generator';
import { BlockedDomain } from '../auth/dto/entities/refresh-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Url, BlockedDomain])],
  providers: [UrlService, SafetyService, Base62Generator],
  exports: [UrlService],
})
export class UrlModule {}
