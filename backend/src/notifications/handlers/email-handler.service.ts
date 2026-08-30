import { Injectable, Logger } from '@nestjs/common';
import { SmtpEmailProvider, EmailOptions } from '../adapters';
import { QueueService, JOB_NAMES, QueueJobData } from '../queues';
import { OutboxEventType } from '../dto';

@Injectable()
export class EmailHandlerService {
  private readonly logger = new Logger(EmailHandlerService.name);

  constructor(
    private readonly emailProvider: SmtpEmailProvider,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Send invoice email.
   */
  async sendInvoiceEmail(payload: {
    invoiceId: string;
    customerName: string;
    customerEmail: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    paymentLink?: string;
    pdfBuffer?: Buffer;
  }): Promise<void> {
    const { customerName, customerEmail, invoiceNumber, amount, dueDate, paymentLink, pdfBuffer } = payload;

    const html = this.generateInvoiceEmailHtml({
      customerName,
      invoiceNumber,
      amount,
      dueDate,
      paymentLink,
    });

    const emailOptions: EmailOptions = {
      to: customerEmail,
      subject: `Invoice ${invoiceNumber} from Your Business`,
      html,
      text: this.generateInvoiceEmailText({
        customerName,
        invoiceNumber,
        amount,
        dueDate,
        paymentLink,
      }),
    };

    // Add PDF attachment if available
    if (pdfBuffer) {
      emailOptions.attachments = [
        {
          filename: `invoice_${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ];
    }

    await this.emailProvider.sendEmail(emailOptions);
    this.logger.log(`Invoice email sent to ${customerEmail} for invoice ${invoiceNumber}`);
  }

  /**
   * Send payment receipt email.
   */
  async sendReceiptEmail(payload: {
    paymentId: string;
    customerName: string;
    customerEmail: string;
    amount: number;
    paidAt: string;
    invoiceNumber?: string;
  }): Promise<void> {
    const { customerName, customerEmail, amount, paidAt, invoiceNumber } = payload;

    const html = this.generateReceiptEmailHtml({
      customerName,
      amount,
      paidAt,
      invoiceNumber,
    });

    const emailOptions: EmailOptions = {
      to: customerEmail,
      subject: `Payment Receipt ${invoiceNumber ? `for Invoice ${invoiceNumber}` : ''}`,
      html,
      text: this.generateReceiptEmailText({
        customerName,
        amount,
        paidAt,
        invoiceNumber,
      }),
    };

    await this.emailProvider.sendEmail(emailOptions);
    this.logger.log(`Receipt email sent to ${customerEmail} for payment ${payload.paymentId}`);
  }

  /**
   * Send overdue reminder email.
   */
  async sendOverdueReminder(payload: {
    invoiceId: string;
    customerName: string;
    customerEmail: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
    paymentLink?: string;
  }): Promise<void> {
    const { customerName, customerEmail, invoiceNumber, amount, daysOverdue, paymentLink } = payload;

    const html = this.generateOverdueReminderHtml({
      customerName,
      invoiceNumber,
      amount,
      daysOverdue,
      paymentLink,
    });

    const emailOptions: EmailOptions = {
      to: customerEmail,
      subject: `Overdue Payment Reminder - Invoice ${invoiceNumber}`,
      html,
      text: this.generateOverdueReminderText({
        customerName,
        invoiceNumber,
        amount,
        daysOverdue,
        paymentLink,
      }),
    };

    await this.emailProvider.sendEmail(emailOptions);
    this.logger.log(`Overdue reminder sent to ${customerEmail} for invoice ${invoiceNumber}`);
  }

  /**
   * Queue email job for async processing.
   */
  async queueInvoiceEmail(data: QueueJobData): Promise<void> {
    await this.queueService.addEmailJob(JOB_NAMES.SEND_INVOICE_EMAIL, data);
  }

  /**
   * Queue receipt email job for async processing.
   */
  async queueReceiptEmail(data: QueueJobData): Promise<void> {
    await this.queueService.addEmailJob(JOB_NAMES.SEND_RECEIPT_EMAIL, data);
  }

  // HTML generators
  private generateInvoiceEmailHtml(data: {
    customerName: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    paymentLink?: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .invoice-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .amount { font-size: 24px; font-weight: bold; color: #4F46E5; }
          .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Invoice ${data.invoiceNumber}</h1>
          </div>
          <div class="content">
            <p>Dear ${data.customerName},</p>
            <p>Please find attached your invoice for the following amount:</p>
            
            <div class="invoice-details">
              <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
              <p><strong>Due Date:</strong> ${data.dueDate}</p>
              <p class="amount">$${(data.amount / 100).toFixed(2)}</p>
            </div>
            
            ${data.paymentLink ? `<p>Click the button below to pay your invoice:</p><p style="text-align: center;"><a href="${data.paymentLink}" class="button">Pay Now</a></p>` : ''}
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p>Thank you for your business!</p>
          </div>
          <div class="footer">
            <p>This email was sent by SaaS Billing Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateInvoiceEmailText(data: {
    customerName: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    paymentLink?: string;
  }): string {
    return `
Dear ${data.customerName},

Please find attached your invoice (${data.invoiceNumber}) for $${(data.amount / 100).toFixed(2)}.

Due Date: ${data.dueDate}

${data.paymentLink ? `Pay online: ${data.paymentLink}` : ''}

Thank you for your business!
    `.trim();
  }

  private generateReceiptEmailHtml(data: {
    customerName: string;
    amount: number;
    paidAt: string;
    invoiceNumber?: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .receipt-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .amount { font-size: 24px; font-weight: bold; color: #10B981; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Receipt</h1>
          </div>
          <div class="content">
            <p>Dear ${data.customerName},</p>
            <p>Thank you for your payment!</p>
            
            <div class="receipt-details">
              <p><strong>Receipt Date:</strong> ${new Date(data.paidAt).toLocaleDateString()}</p>
              ${data.invoiceNumber ? `<p><strong>Invoice:</strong> ${data.invoiceNumber}</p>` : ''}
              <p class="amount">$${(data.amount / 100).toFixed(2)}</p>
            </div>
            
            <p>Your payment has been received and processed successfully.</p>
            <p>We appreciate your business!</p>
          </div>
          <div class="footer">
            <p>This is an automated receipt from SaaS Billing Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateReceiptEmailText(data: {
    customerName: string;
    amount: number;
    paidAt: string;
    invoiceNumber?: string;
  }): string {
    return `
Dear ${data.customerName},

Thank you for your payment!

Receipt Date: ${new Date(data.paidAt).toLocaleDateString()}
${data.invoiceNumber ? `Invoice: ${data.invoiceNumber}` : ''}
Amount Paid: $${(data.amount / 100).toFixed(2)}

Your payment has been processed successfully.
We appreciate your business!
    `.trim();
  }

  private generateOverdueReminderHtml(data: {
    customerName: string;
    invoiceNumber: string;
    amount: number;
    daysOverdue: number;
    paymentLink?: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #DC2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .alert { background: #FEE2E2; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #DC2626; }
          .amount { font-size: 24px; font-weight: bold; color: #DC2626; }
          .button { display: inline-block; padding: 12px 24px; background: #DC2626; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Overdue</h1>
          </div>
          <div class="content">
            <p>Dear ${data.customerName},</p>
            
            <div class="alert">
              <p><strong>Your payment is ${data.daysOverdue} days overdue.</strong></p>
            </div>
            
            <p>Invoice ${data.invoiceNumber} remains unpaid:</p>
            <p class="amount">$${(data.amount / 100).toFixed(2)}</p>
            
            ${data.paymentLink ? `<p style="text-align: center;"><a href="${data.paymentLink}" class="button">Pay Now</a></p>` : ''}
            
            <p>Please arrange payment as soon as possible to avoid further action.</p>
            <p>If you have already paid, please ignore this reminder.</p>
          </div>
          <div class="footer">
            <p>This is an automated reminder from SaaS Billing Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateOverdueReminderText(data: {
    customerName: string;
    invoiceNumber: string;
    amount: number;
    daysOverdue: number;
    paymentLink?: string;
  }): string {
    return `
Dear ${data.customerName},

Your payment for invoice ${data.invoiceNumber} is ${data.daysOverdue} days overdue.

Amount Due: $${(data.amount / 100).toFixed(2)}

${data.paymentLink ? `Pay online: ${data.paymentLink}` : ''}

Please arrange payment as soon as possible.
If you have already paid, please ignore this reminder.
    `.trim();
  }
}
