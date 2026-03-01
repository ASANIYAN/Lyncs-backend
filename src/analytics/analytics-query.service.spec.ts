import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AnalyticsQueryService } from './analytics-query.service';
import { Click } from './entities/click.entity';
import { Url } from '../url/entities/url.entity';

describe('AnalyticsQueryService', () => {
  let service: AnalyticsQueryService;
  let urlRepo: jest.Mocked<Pick<Repository<Url>, 'findOne'>>;
  let clickRepo: Repository<Click>;

  beforeEach(() => {
    urlRepo = {
      findOne: jest.fn(),
    };

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(10),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '3', total: '7' }),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    clickRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn().mockResolvedValue([]),
    } as any;

    service = new AnalyticsQueryService(
      clickRepo,
      urlRepo as unknown as Repository<Url>,
    );
  });

  it('should throw NotFoundException when URL does not exist', async () => {
    urlRepo.findOne.mockResolvedValue(null);
    await expect(
      service.getAnalytics('abc123', '1', '7d'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw ForbiddenException for non-owner', async () => {
    urlRepo.findOne.mockResolvedValue({
      user: { id: 'owner-1' },
    } as Url);

    await expect(
      service.getAnalytics('abc123', 'owner-2', '7d'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
