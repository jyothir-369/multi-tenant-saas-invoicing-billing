import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from '../webhooks.controller';
import { PaymentsService } from '../payments.service';
import { WebhookRateLimitGuard } from '../guards';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let paymentsService: jest.Mocked<PaymentsService>;

  const mockPaymentsService = {
    verifyWebhookSignature: jest.fn(),
    processSuccessfulPayment: jest.fn(),
    processFailedPayment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
      ],
    })
    .overrideGuard(WebhookRateLimitGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<WebhooksController>(WebhooksController);
    paymentsService = module.get(PaymentsService);

    jest.clearAllMocks();
  });

  describe('handleStripeWebhook', () => {
    const createMockRequest = (body: any) => ({
      rawBody: Buffer.from(JSON.stringify(body)),
      body,
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': undefined },
    });

    it('should process successful payment_intent.succeeded event', async () => {
      const paymentIntent = {
        id: 'pi_test_123',
        amount: 5000,
        metadata: {
          tenantId: 'tenant-1',
          invoiceId: 'invoice-1',
          customerId: 'customer-1',
        },
      };

      const event = {
        type: 'payment_intent.succeeded',
        data: { object: paymentIntent },
      };

      mockPaymentsService.verifyWebhookSignature.mockReturnValue({
        success: true,
        event,
      });

      mockPaymentsService.processSuccessfulPayment.mockResolvedValue({
        success: true,
        payment: { id: 'payment-1' },
      });

      const request = createMockRequest(event);

      const result = await controller.handleStripeWebhook(
        request as any,
        'valid-signature',
        event,
      );

      expect(result.received).toBe(true);
      expect(result.processed).toBe(true);
      expect(mockPaymentsService.processSuccessfulPayment).toHaveBeenCalledWith(
        'pi_test_123',
        5000,
        'invoice-1',
        'tenant-1',
      );
    });

    it('should process failed payment_intent.payment_failed event', async () => {
      const paymentIntent = {
        id: 'pi_failed_123',
        metadata: {
          tenantId: 'tenant-1',
          invoiceId: 'invoice-1',
        },
        last_payment_error: {
          message: 'Card declined',
        },
      };

      const event = {
        type: 'payment_intent.payment_failed',
        data: { object: paymentIntent },
      };

      mockPaymentsService.verifyWebhookSignature.mockReturnValue({
        success: true,
        event,
      });

      mockPaymentsService.processFailedPayment.mockResolvedValue({
        success: true,
        payment: { id: 'payment-failed-1' },
      });

      const request = createMockRequest(event);

      const result = await controller.handleStripeWebhook(
        request as any,
        'valid-signature',
        event,
      );

      expect(result.received).toBe(true);
      expect(result.processed).toBe(true);
      expect(mockPaymentsService.processFailedPayment).toHaveBeenCalledWith(
        'pi_failed_123',
        'invoice-1',
        'tenant-1',
        'Card declined',
      );
    });

    it('should handle payment_intent.created event (no-op)', async () => {
      const paymentIntent = {
        id: 'pi_created_123',
        metadata: {},
      };

      const event = {
        type: 'payment_intent.created',
        data: { object: paymentIntent },
      };

      mockPaymentsService.verifyWebhookSignature.mockReturnValue({
        success: true,
        event,
      });

      const request = createMockRequest(event);

      const result = await controller.handleStripeWebhook(
        request as any,
        'valid-signature',
        event,
      );

      expect(result.received).toBe(true);
      expect(result.processed).toBe(true);
      expect(mockPaymentsService.processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it('should handle unhandled event types gracefully', async () => {
      const event = {
        type: 'unknown.event.type',
        data: { object: {} },
      };

      mockPaymentsService.verifyWebhookSignature.mockReturnValue({
        success: true,
        event,
      });

      const request = createMockRequest(event);

      const result = await controller.handleStripeWebhook(
        request as any,
        'valid-signature',
        event,
      );

      expect(result.received).toBe(true);
      expect(result.processed).toBe(true);
    });

    it('should reject webhook with invalid signature', async () => {
      const event = { type: 'payment_intent.succeeded' };

      mockPaymentsService.verifyWebhookSignature.mockReturnValue({
        success: false,
        error: 'Invalid signature',
      });

      const request = createMockRequest(event);

      await expect(
        controller.handleStripeWebhook(
          request as any,
          'invalid-signature',
          event,
        ),
      ).rejects.toThrow('Invalid signature');
    });

    it('should handle processing errors gracefully', async () => {
      const paymentIntent = {
        id: 'pi_error_123',
        amount: 5000,
        metadata: {
          tenantId: 'tenant-1',
          invoiceId: 'invoice-1',
        },
      };

      const event = {
        type: 'payment_intent.succeeded',
        data: { object: paymentIntent },
      };

      mockPaymentsService.verifyWebhookSignature.mockReturnValue({
        success: true,
        event,
      });

      mockPaymentsService.processSuccessfulPayment.mockRejectedValue(
        new Error('Database error'),
      );

      const request = createMockRequest(event);

      const result = await controller.handleStripeWebhook(
        request as any,
        'valid-signature',
        event,
      );

      expect(result.received).toBe(true);
      expect(result.processed).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should skip processing event with missing metadata', async () => {
      const paymentIntent = {
        id: 'pi_no_meta_123',
        amount: 5000,
        metadata: {},
      };

      const event = {
        type: 'payment_intent.succeeded',
        data: { object: paymentIntent },
      };

      mockPaymentsService.verifyWebhookSignature.mockReturnValue({
        success: true,
        event,
      });

      const request = createMockRequest(event);

      const result = await controller.handleStripeWebhook(
        request as any,
        'valid-signature',
        event,
      );

      expect(result.received).toBe(true);
      expect(result.processed).toBe(true);
      expect(mockPaymentsService.processSuccessfulPayment).not.toHaveBeenCalled();
    });
  });
});

describe('WebhookRateLimitGuard', () => {
  let guard: any;

  beforeEach(() => {
    const { WebhookRateLimitGuard } = require('../guards');
    guard = new WebhookRateLimitGuard();
  });

  it('should allow requests within rate limit', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '127.0.0.1',
          headers: { 'x-forwarded-for': undefined },
          body: { data: { object: { metadata: { tenantId: 'tenant-1' } } } },
        }),
      }),
    };

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should allow requests without tenant identification', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '127.0.0.1',
          headers: {},
          body: {},
        }),
      }),
    };

    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
