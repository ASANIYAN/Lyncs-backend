import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'dev.lead@example.com',
    description: 'The email used for registration',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'The user password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Short-lived JWT access token (valid for 30 minutes)',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Long-lived JWT refresh token (valid for 7 days)',
  })
  refreshToken: string;

  @ApiProperty({
    example: 1800,
    description: 'Access token lifetime in seconds (1800 = 30 minutes)',
  })
  expiresIn: number;
}

export class LoginOtpRequiredDto {
  @ApiProperty({
    example: true,
    description: 'Indicates that OTP verification is required to complete login',
  })
  otpRequired: true;

  @ApiProperty({
    example: 'OTP sent to email. Verify to complete login.',
    description: 'User-facing message describing the next step',
  })
  message: string;
}
