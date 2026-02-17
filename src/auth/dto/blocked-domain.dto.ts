import { IsNotEmpty, IsString, IsOptional, IsLowercase } from 'class-validator';

export class CreateBlockedDomainDto {
  @IsNotEmpty()
  @IsString()
  @IsLowercase()
  domain: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
