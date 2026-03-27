import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

type OtpPurpose = 'register' | 'forgot_password' | 'login';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailer: MailerService) {}

  async sendOtpEmail(to: string, code: string, purpose: OtpPurpose) {
    const subjectMap: Record<OtpPurpose, string> = {
      register: 'Your verification code',
      forgot_password: 'Your password reset code',
      login: 'Your login verification code',
    };

    const purposeTextMap: Record<OtpPurpose, string> = {
      register: 'complete your registration',
      forgot_password: 'reset your password',
      login: 'verify your login',
    };

    const subject = subjectMap[purpose];
    const actionText = purposeTextMap[purpose];

    const text = `Your OTP code is ${code}. Use this code to ${actionText}. This code expires soon.`;

    try {
      await this.mailer.sendMail({
        to,
        subject,
        text,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send OTP email: ${msg}`);
      throw error;
    }
  }
}
