import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Url } from './entities/url.entity';
import { Base62Generator } from './utils/base62.generator';
import { User } from '../auth/dto/entities/user.entity';
import { SafetyService } from './safety.service';

// User payload from authenticated request
interface AuthUser {
  id: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class UrlService {
  private readonly logger = new Logger(UrlService.name);
  private readonly MAX_RETRIES = 5;

  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    private readonly generator: Base62Generator,
    private readonly safetyService: SafetyService,
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

  async create(originalUrl: string, user: AuthUser): Promise<Url> {
    const isBlocked = await this.safetyService.isDomainBlocked(originalUrl);
    if (isBlocked) {
      throw new BadRequestException(
        'This domain is blocked for safety reasons',
      );
    }

    const userId = user.id;
    if (!userId) {
      throw new InternalServerErrorException('Invalid user information');
    }

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
          user: { id: userId } as User, // Create relationship with just the ID
          click_count: 0,
        });

        try {
          return await this.urlRepository.save(newUrl);
        } catch (error: unknown) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Error saving URL on retry ${retries + 1}: ${errorMsg}`,
          );
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

  async findAllByUser(
    user: AuthUser,
    page: number = 1,
    limit: number = 10,
  ): Promise<[Url[], number]> {
    const userId = user.id;
    if (!userId) {
      throw new InternalServerErrorException('Invalid user information');
    }

    try {
      return await this.urlRepository.findAndCount({
        where: { user: { id: userId } },
        order: { created_at: 'DESC' }, // Newest first
        take: limit,
        skip: (page - 1) * limit,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching urls by user: ${errorMsg}`);
      throw new InternalServerErrorException('Failed to fetch dashboard data');
    }
  }
}
