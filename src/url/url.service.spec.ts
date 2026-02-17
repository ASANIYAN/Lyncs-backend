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
import { User } from '../auth/dto/entities/user.entity';

describe('UrlService', () => {
  let service: UrlService;
  let repo: any;
  let generator: any;
  let safetyService: any;

  const mockUser = { id: '1', email: 'test@example.com' } as User;

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
    repo.create.mockReturnValue({ short_code: 'abc123' });
    repo.save.mockResolvedValue({ id: '1', short_code: 'abc123' });

    const result = await service.create('http://google.com', mockUser);
    expect(result.short_code).toBe('abc123');
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it('should retry if a collision occurs', async () => {
    safetyService.isDomainBlocked.mockResolvedValue(false);
    generator.generate.mockReturnValueOnce('collid').mockReturnValue('unique');

    // First call returns an existing URL, second returns null
    repo.findOne.mockResolvedValueOnce({ id: 'old' }).mockResolvedValue(null);
    repo.create.mockReturnValue({ short_code: 'unique' });
    repo.save.mockResolvedValue({ short_code: 'unique' });

    const result = await service.create('http://google.com', mockUser);

    expect(result.short_code).toBe('unique');
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('should fail after 5 consecutive collisions', async () => {
    safetyService.isDomainBlocked.mockResolvedValue(false);
    generator.generate.mockReturnValue('always-colliding');
    repo.findOne.mockResolvedValue({ id: 'existing' });

    await expect(service.create('http://google.com', mockUser)).rejects.toThrow(
      InternalServerErrorException,
    );

    expect(repo.findOne).toHaveBeenCalledTimes(5);
  });
});
