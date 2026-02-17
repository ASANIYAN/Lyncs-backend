import {
  IsNotEmpty,
  IsUrl,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateUrlDto {
  @IsNotEmpty({ message: 'URL is required' })
  @IsString({ message: 'URL must be a string' })
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
    },
    { message: 'Please provide a valid URL with http or https protocol' },
  )
  @MaxLength(2048, { message: 'URL is too long (max 2048 characters)' })
  @Matches(/^(?!.*yourdomain\.com).*$/, {
    message: 'Cannot shorten URLs from this domain',
  })
  url: string;
}
