import { Url } from '../entities/url.entity';

export class UrlResponseDto {
  id: string;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: Date;
  is_active: boolean;

  static fromEntity(entity: Url): UrlResponseDto {
    return {
      id: entity.id,
      original_url: entity.original_url,
      short_code: entity.short_code,
      click_count: entity.click_count,
      created_at: entity.created_at,
      is_active: entity.is_active,
    };
  }
}

export class PaginatedUrlResponseDto {
  data: UrlResponseDto[];
  total: number;
  page: number;
  last_page: number;
}
