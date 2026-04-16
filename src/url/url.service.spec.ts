import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { UrlService } from './url.service';
import { Url } from './entities/url.entity';
import { Base62Generator } from './utils/base62.generator';
import { SafetyService } from './safety.service';
import { RedisService } from '../common/redis/redis.service';
import { UrlNormalizerService } from './url-normalizer.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { User } from '../auth/dto/entities/user.entity';
import type { Repository } from 'typeorm';

type UrlRepositoryMock = Pick<Repository<Url>, 'findOne' | 'create' | 'save'>;
type UserRepositoryMock = Pick<Repository<User>, 'findOne'>;
type AuthUser = {
  id: string;
  email: string;
  iat: number;
  exp: number;
};

// Helper factory to create mock Url objects with all required fields
function createMockUrl(overrides: Partial<Url> = {}): Url {
  return {
    id: '1',
    short_code: 'abc123',
    original_url: 'http://google.com',
    normalized_url: 'https://google.com',
    url_hash: 'hash1',
    user: {
      id: '1',
      public_id: '00000000-0000-4000-8000-000000000001',
      email: 'test@example.com',
      password: 'hashed',
      created_at: new Date(),
      is_active: true,
      urls: [],
    } as User,
    created_at: new Date(),
    expires_at: new Date(),
    is_active: true,
    click_count: 0,
    safety_status: 'pending',
    last_checked_at: new Date(),
    ...overrides,
  } as Url;
}

describe('UrlService', () => {
  let service: UrlService;
  let repo: jest.Mocked<UrlRepositoryMock>;
  let userRepo: jest.Mocked<UserRepositoryMock>;
  let generator: jest.Mocked<Base62Generator>;
  let safetyService: jest.Mocked<SafetyService>;
  let urlNormalizer: jest.Mocked<UrlNormalizerService>;
  let analyticsService: jest.Mocked<AnalyticsService>;

  const mockUser: AuthUser = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'test@example.com',
    iat: 0,
    exp: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlService,
        {
          provide: getRepositoryToken(Url),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: Base62Generator,
          useValue: { generate: jest.fn() },
        },
        {
          provide: SafetyService,
          useValue: { isDomainBlocked: jest.fn() },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            getClient: jest.fn().mockReturnValue({
              del: jest.fn().mockResolvedValue(1),
              keys: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: UrlNormalizerService,
          useValue: { normalizeUrl: jest.fn() },
        },
        {
          provide: AnalyticsService,
          useValue: { queueSafetyCheck: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    repo = module.get(getRepositoryToken(Url));
    userRepo = module.get(getRepositoryToken(User));
    generator = module.get(Base62Generator);
    safetyService = module.get(SafetyService);
    urlNormalizer = module.get(UrlNormalizerService);
    analyticsService = module.get(AnalyticsService);
  });

  it('should throw BadRequestException if domain is blocked', async () => {
    safetyService.isDomainBlocked.mockResolvedValue(true);

    await expect(service.create('http://evil.com', mockUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should succeed on first try if no collision', async () => {
    userRepo.findOne.mockResolvedValue({
      id: '1',
      public_id: mockUser.id,
    } as User);
    safetyService.isDomainBlocked.mockResolvedValue(false);
    urlNormalizer.normalizeUrl.mockReturnValue({
      normalized: 'https://google.com',
      hash: 'hash1',
    });
    generator.generate.mockReturnValue('abc123');
    repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const mockUrl = createMockUrl();
    repo.create.mockReturnValue(mockUrl);
    repo.save.mockResolvedValue(mockUrl);

    const result = await service.create('http://google.com', mockUser);
    expect(result.url.short_code).toBe('abc123');
    expect(result.isNew).toBe(true);
    expect(repo.findOne).toHaveBeenCalledTimes(2);
    expect(analyticsService.queueSafetyCheck.mock.calls).toHaveLength(1);
  });

  it('should retry if a collision occurs', async () => {
    userRepo.findOne.mockResolvedValue({
      id: '1',
      public_id: mockUser.id,
    } as User);
    safetyService.isDomainBlocked.mockResolvedValue(false);
    urlNormalizer.normalizeUrl.mockReturnValue({
      normalized: 'https://google.com',
      hash: 'hash2',
    });
    generator.generate.mockReturnValueOnce('collid').mockReturnValue('unique');

    const collidingUrl = createMockUrl({
      id: 'old',
      short_code: 'collid',
      original_url: 'http://example.com',
    });
    const uniqueUrl = createMockUrl({
      id: '2',
      short_code: 'unique',
    });

    repo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(collidingUrl)
      .mockResolvedValue(null);
    repo.create.mockReturnValue(uniqueUrl);
    repo.save.mockResolvedValue(uniqueUrl);

    const result = await service.create('http://google.com', mockUser);

    expect(result.url.short_code).toBe('unique');
    expect(repo.findOne).toHaveBeenCalledTimes(3);
  });

  it('should fail after 5 consecutive collisions', async () => {
    userRepo.findOne.mockResolvedValue({
      id: '1',
      public_id: mockUser.id,
    } as User);
    safetyService.isDomainBlocked.mockResolvedValue(false);
    urlNormalizer.normalizeUrl.mockReturnValue({
      normalized: 'https://google.com',
      hash: 'hash3',
    });
    generator.generate.mockReturnValue('always-colliding');

    const collidingUrl = createMockUrl({
      id: 'existing',
      short_code: 'always-colliding',
      original_url: 'http://example.com',
    });

    repo.findOne.mockResolvedValueOnce(null).mockResolvedValue(collidingUrl);

    await expect(service.create('http://google.com', mockUser)).rejects.toThrow(
      InternalServerErrorException,
    );

    expect(repo.findOne).toHaveBeenCalledTimes(6);
  });
});
