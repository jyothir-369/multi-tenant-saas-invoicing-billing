import { Test, TestingModule } from '@nestjs/testing';
import { EmailHandlerService } from '../handlers/email-handler.service';
import { SmtpEmailProvider, MockEmailProvider } from '../adapters';
import { QueueService, JOB_NAMES } from '../queues';

describe('EmailHandlerService', () => {
  let service: EmailHandlerService;
  let emailProvider: MockEmailProvider;
  let queueService: any;

  beforeEach(async () => {
    const mockEmailProvider = new MockEmailProvider();
    const mockQueueService = {
      addEmailJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailHandlerService,
        { provide: SmtpEmailProvider, useValue: mockEmailProvider },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<EmailHandlerService>(EmailHandlerService);
    emailProvider = module.get(SmtpEmailProvider) as any;
    queueService = module.get(QueueService);
  });

  describe('sendInvoiceEmail', () => {
    it('should send invoice email with HTML content', async () => {
      const payload = {
        invoiceId: 'inv-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        invoiceNumber: 'INV-001',
        amount: 10000,
        dueDate: '2024-12-31',
        paymentLink: 'https://pay.example.com/inv-1',
      };

      await service.sendInvoiceEmail(payload);

      const sentEmails = (emailProvider as any).sentEmails;
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe('john@example.com');
      expect(sentEmails[0].subject).toContain('INV-001');
      expect(sentEmails[0].html).toBeDefined();
      expect(sentEmails[0].text).toBeDefined();
    });

    it('should include PDF attachment when provided', async () => {
      const pdfBuffer = Buffer.from('fake pdf content');
      const payload = {
        invoiceId: 'inv-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        invoiceNumber: 'INV-001',
        amount: 10000,
        dueDate: '2024-12-31',
        pdfBuffer,
      };

      await service.sendInvoiceEmail(payload);

      const sentEmails = (emailProvider as any).sentEmails;
      expect(sentEmails[0].attachments).toHaveLength(1);
      expect(sentEmails[0].attachments[0].filename).toBe('invoice_INV-001.pdf');
    });

    it('should send email without payment link when not provided', async () => {
      const payload = {
        invoiceId: 'inv-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        invoiceNumber: 'INV-001',
        amount: 10000,
        dueDate: '2024-12-31',
      };

      await service.sendInvoiceEmail(payload);

      const sentEmails = (emailProvider as any).sentEmails;
      expect(sentEmails[0].html).not.toContain('Pay Now');
    });
  });

  describe('sendReceiptEmail', () => {
    it('should send payment receipt email', async () => {
      const payload = {
        paymentId: 'pay-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        amount: 10000,
        paidAt: '2024-12-15T10:30:00Z',
        invoiceNumber: 'INV-001',
      };

      await service.sendReceiptEmail(payload);

      const sentEmails = (emailProvider as any).sentEmails;
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe('john@example.com');
      expect(sentEmails[0].subject).toContain('Receipt');
      expect(sentEmails[0].html).toContain('Thank you for your payment');
    });
  });

  describe('sendOverdueReminder', () => {
    it('should send overdue reminder email', async () => {
      const payload = {
        invoiceId: 'inv-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        invoiceNumber: 'INV-001',
        amount: 10000,
        dueDate: '2024-12-31',
        daysOverdue: 5,
        paymentLink: 'https://pay.example.com/inv-1',
      };

      await service.sendOverdueReminder(payload);

      const sentEmails = (emailProvider as any).sentEmails;
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].subject).toContain('Overdue');
      expect(sentEmails[0].html).toContain('5 days overdue');
    });
  });

  describe('queueInvoiceEmail', () => {
    it('should queue invoice email job', async () => {
      const data = {
        tenantId: 'tenant-1',
        eventId: 'inv-1',
        payload: { invoiceId: 'inv-1' },
      };

      queueService.addEmailJob.mockResolvedValue({ id: 'job-1' });

      await service.queueInvoiceEmail(data);

      expect(queueService.addEmailJob).toHaveBeenCalledWith(
        JOB_NAMES.SEND_INVOICE_EMAIL,
        data,
      );
    });
  });

  describe('queueReceiptEmail', () => {
    it('should queue receipt email job', async () => {
      const data = {
        tenantId: 'tenant-1',
        eventId: 'pay-1',
        payload: { paymentId: 'pay-1' },
      };

      queueService.addEmailJob.mockResolvedValue({ id: 'job-1' });

      await service.queueReceiptEmail(data);

      expect(queueService.addEmailJob).toHaveBeenCalledWith(
        JOB_NAMES.SEND_RECEIPT_EMAIL,
        data,
      );
    });
  });
});
