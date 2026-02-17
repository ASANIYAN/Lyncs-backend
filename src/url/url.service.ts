import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Url } from './entities/url.entity';
import { Base62Generator } from './utils/base62.generator';
import { User } from '../auth/dto/entities/user.entity';

@Injectable()
export class UrlService {
  private readonly logger = new Logger(UrlService.name);
  private readonly MAX_RETRIES = 5;

  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    private readonly generator: Base62Generator,
  ) {}

  async findByCode(short_code: string): Promise<Url | null> {
    try {
      return await this.urlRepository.findOne({
        where: { short_code, is_active: true },
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Database lookup failed';
      this.logger.error(`Error finding URL by code: ${msg}`);
      throw new InternalServerErrorException('Error retrieving URL mapping');
    }
  }

  async create(originalUrl: string, user: User): Promise<Url> {
    let shortCode: string;
    let retries = 0;

    // Collision Detection Loop
    while (retries < this.MAX_RETRIES) {
      shortCode = this.generator.generate();
      const existing = await this.urlRepository.findOne({
        where: { short_code: shortCode },
      });

      if (!existing) {
        const newUrl = this.urlRepository.create({
          original_url: originalUrl,
          short_code: shortCode,
          user: user,
          click_count: 0,
        });

        try {
          return await this.urlRepository.save(newUrl);
        } catch (error: unknown) {
          console.error(error);
          retries++;
          continue;
        }
      }
      retries++;
    }

    this.logger.error(
      `Collision limit reached after ${this.MAX_RETRIES} attempts`,
    );
    throw new InternalServerErrorException(
      'Could not generate a unique short code',
    );
  }
}
