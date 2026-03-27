import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  UseGuards,
  Get,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { AuthService } from './auth.service';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  LoginDto,
  LoginResponseDto,
  LoginOtpRequiredDto,
} from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  RequestOtpDto,
  VerifyRegisterOtpDto,
  VerifyLoginOtpDto,
  ResetPasswordOtpDto,
} from './dto/otp.dto';
import type { FastifyRequest } from 'fastify';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/request-otp')
  @ApiOperation({ summary: 'Request OTP to create a new account' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  @ApiResponse({
    status: 409,
    description: 'Email already exists',
    type: ErrorResponseDto,
  })
  requestRegisterOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestRegisterOtp(dto.email);
  }

  @Post('register')
  @ApiOperation({ summary: 'Create a new user account' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists',
    type: ErrorResponseDto,
  })
  @ApiBody({ type: VerifyRegisterOtpDto })
  register(@Body() registerDto: VerifyRegisterOtpDto) {
    return this.authService.verifyRegisterOtp(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive access tokens' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: 'OTP required to complete login',
    type: LoginOtpRequiredDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ErrorResponseDto,
  })
  login(@Body() loginDto: LoginDto, @Req() req: FastifyRequest) {
    const userAgent = req.headers['user-agent'] ?? null;
    return this.authService.login(loginDto, { ip: req.ip, userAgent });
  }

  @Post('login/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for login on new device/IP' })
  @ApiBody({ type: VerifyLoginOtpDto })
  @ApiResponse({
    status: 200,
    description: 'Login verified successfully',
    type: LoginResponseDto,
  })
  verifyLoginOtp(@Body() dto: VerifyLoginOtpDto, @Req() req: FastifyRequest) {
    const userAgent = req.headers['user-agent'] ?? null;
    return this.authService.verifyLoginOtp(dto, { ip: req.ip, userAgent });
  }

  @Post('forgot-password/request-otp')
  @ApiOperation({ summary: 'Request OTP to reset password' })
  @ApiResponse({ status: 200, description: 'OTP sent if email exists' })
  requestForgotPasswordOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestForgotPasswordOtp(dto.email);
  }

  @Post('forgot-password/confirm')
  @ApiOperation({ summary: 'Reset password using OTP' })
  @ApiBody({ type: ResetPasswordOtpDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  resetPassword(@Body() dto: ResetPasswordOtpDto) {
    return this.authService.resetPasswordWithOtp(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new tokens' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
    type: ErrorResponseDto,
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout and blacklist current token' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing bearer token',
    type: ErrorResponseDto,
  })
  async logout(@Headers('authorization') authHeader: string) {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
    if (!token) return;
    await this.authService.logout(token);
    return;
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Get authenticated user profile and usage stats' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing bearer token',
    type: ErrorResponseDto,
  })
  getProfile(
    @Req()
    req: {
      user: {
        id: string;
      };
    },
  ) {
    return this.authService.getProfile(req.user.id);
  }
}
