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
import type { Repository } from 'typeorm';

type UrlRepositoryMock = Pick<Repository<Url>, 'findOne' | 'create' | 'save'>;
type AuthUser = {
  id: string;
  email: string;
  iat: number;
  exp: number;
};

describe('UrlService', () => {
  let service: UrlService;
  let repo: jest.Mocked<UrlRepositoryMock>;
  let generator: jest.Mocked<Base62Generator>;
  let safetyService: jest.Mocked<SafetyService>;

  const mockUser: AuthUser = {
    id: '1',
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
          provide: Base62Generator,
          useValue: { generate: jest.fn() },
        },
        {
          provide: SafetyService,
          useValue: { isDomainBlocked: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    repo = module.get(getRepositoryToken(Url));
    generator = module.get(Base62Generator);
    safetyService = module.get(SafetyService);
  });

  it('should throw BadRequestException if domain is blocked', async () => {
    safetyService.isDomainBlocked.mockResolvedValue(true);

    await expect(service.create('http://evil.com', mockUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should succeed on first try if no collision', async () => {
    safetyService.isDomainBlocked.mockResolvedValue(false);
    generator.generate.mockReturnValue('abc123');
    repo.findOne.mockResolvedValue(null); // No collision
    repo.create.mockReturnValue({
      id: '1',
      short_code: 'abc123',
      original_url: 'http://google.com',
      user: {
        id: '1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: new Date(),
        is_active: true,
        urls: [],
      },
      created_at: new Date(),
      expires_at: new Date(),
      is_active: true,
      click_count: 0,
      safety_status: 'pending',
    } as Url);
    repo.save.mockResolvedValue({
      id: '1',
      short_code: 'abc123',
      original_url: 'http://google.com',
      user: {
        id: '1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: new Date(),
        is_active: true,
        urls: [],
      },
      created_at: new Date(),
      expires_at: new Date(),
      is_active: true,
      click_count: 0,
      safety_status: 'pending',
    } as Url);

    const result = await service.create('http://google.com', mockUser);
    expect(result.short_code).toBe('abc123');
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it('should retry if a collision occurs', async () => {
    safetyService.isDomainBlocked.mockResolvedValue(false);
    generator.generate.mockReturnValueOnce('collid').mockReturnValue('unique');

    // First call returns an existing URL, second returns null
    repo.findOne
      .mockResolvedValueOnce({
        id: 'old',
        short_code: 'collid',
        original_url: 'http://example.com',
        user: {
          id: '1',
          email: 'test@example.com',
          password: 'hashed',
          created_at: new Date(),
          is_active: true,
          urls: [],
        },
        created_at: new Date(),
        expires_at: new Date(),
        is_active: true,
        click_count: 0,
        safety_status: 'pending',
      } as Url)
      .mockResolvedValue(null);
    repo.create.mockReturnValue({
      id: '2',
      short_code: 'unique',
      original_url: 'http://google.com',
      user: {
        id: '1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: new Date(),
        is_active: true,
        urls: [],
      },
      created_at: new Date(),
      expires_at: new Date(),
      is_active: true,
      click_count: 0,
      safety_status: 'pending',
    } as Url);
    repo.save.mockResolvedValue({
      id: '2',
      short_code: 'unique',
      original_url: 'http://google.com',
      user: {
        id: '1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: new Date(),
        is_active: true,
        urls: [],
      },
      created_at: new Date(),
      expires_at: new Date(),
      is_active: true,
      click_count: 0,
      safety_status: 'pending',
    } as Url);

    const result = await service.create('http://google.com', mockUser);

    expect(result.short_code).toBe('unique');
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('should fail after 5 consecutive collisions', async () => {
    safetyService.isDomainBlocked.mockResolvedValue(false);
    generator.generate.mockReturnValue('always-colliding');
    repo.findOne.mockResolvedValue({
      id: 'existing',
      short_code: 'always-colliding',
      original_url: 'http://example.com',
      user: {
        id: '1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: new Date(),
        is_active: true,
        urls: [],
      },
      created_at: new Date(),
      expires_at: new Date(),
      is_active: true,
      click_count: 0,
      safety_status: 'pending',
    } as Url);

    await expect(service.create('http://google.com', mockUser)).rejects.toThrow(
      InternalServerErrorException,
    );

    expect(repo.findOne).toHaveBeenCalledTimes(5);
  });
});
