import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface EmailProviderAdapter {
  sendEmail(options: EmailOptions): Promise<EmailResult>;
}

@Injectable()
export class SmtpEmailProvider implements EmailProviderAdapter {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly fromAddress: string;

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.mailtrap.io';
    const port = parseInt(process.env.SMTP_PORT || '2525', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    this.fromAddress = process.env.SMTP_FROM || 'noreply@saas-billing.com';

    // Configure transporter based on environment
    if (process.env.NODE_ENV === 'production' && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    } else {
      // Use Ethereal for testing in development
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'ethereal-test@test.com',
          pass: 'ethereal-test-pass',
        },
      });
      this.logger.warn('Using Ethereal email for testing. Set SMTP credentials for production.');
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);

      this.logger.log(`Email sent successfully: ${info.messageId}`);

      return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send email: ${errorMessage}`, error);
      throw new InternalServerErrorException(`Failed to send email: ${errorMessage}`);
    }
  }
}

@Injectable()
export class MockEmailProvider implements EmailProviderAdapter {
  private readonly logger = new Logger(MockEmailProvider.name);
  private readonly sentEmails: EmailOptions[] = [];

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    this.logger.log(`[MOCK] Sending email to: ${options.to}`);
    this.logger.log(`[MOCK] Subject: ${options.subject}`);
    
    this.sentEmails.push(options);

    return {
      messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      accepted: [options.to],
      rejected: [],
    };
  }

  getSentEmails(): EmailOptions[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails.length = 0;
  }
}
