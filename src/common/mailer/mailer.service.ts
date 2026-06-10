import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type OtpPurpose = 'register' | 'forgot_password' | 'login';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly mailFrom: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('BREVO_API_KEY');
    this.mailFrom = this.config.getOrThrow<string>('MAIL_FROM');
  }

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

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.mailFrom },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const msg = `Brevo API error ${response.status}: ${body}`;
      this.logger.error(`Failed to send OTP email: ${msg}`);
      throw new Error(msg);
    }
  }
}
