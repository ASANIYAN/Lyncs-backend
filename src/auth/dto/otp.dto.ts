import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    example: 'dev.lead@example.com',
    description: 'Email address to receive the OTP',
  })
  @IsEmail()
  email: string;
}

export class VerifyRegisterOtpDto {
  @ApiProperty({
    example: 'dev.lead@example.com',
    description: 'Email address used for registration',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Account password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    example: '123456',
    description: 'OTP code sent to email',
  })
  @IsString()
  @Length(4, 10)
  otp: string;
}

export class VerifyLoginOtpDto {
  @ApiProperty({
    example: 'dev.lead@example.com',
    description: 'Email address used for login',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'OTP code sent to email',
  })
  @IsString()
  @Length(4, 10)
  otp: string;
}

export class ResetPasswordOtpDto {
  @ApiProperty({
    example: 'dev.lead@example.com',
    description: 'Email address for password reset',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'OTP code sent to email',
  })
  @IsString()
  @Length(4, 10)
  otp: string;

  @ApiProperty({
    example: 'NewSecurePass123!',
    description: 'New account password',
  })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}
