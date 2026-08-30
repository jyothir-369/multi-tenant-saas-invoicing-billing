import { Test, TestingModule } from '@nestjs/testing';
import { StripePaymentProvider } from '../adapters/stripe-payment.provider';

// Mock Stripe module
jest.mock('stripe', () => {
  const mStripe = {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
  return jest.fn(() => mStripe);
});

describe('StripePaymentProvider', () => {
  let provider: StripePaymentProvider;
  let mockStripe: any;

  beforeEach(async () => {
    // Set environment variables
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    const module: TestingModule = await Test.createTestingModule({
      providers: [StripePaymentProvider],
    }).compile();

    provider = module.get<StripePaymentProvider>(StripePaymentProvider);
    mockStripe = (provider as any).stripe;

    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent with correct parameters', async () => {
      const mockResponse = {
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        metadata: { tenantId: 'tenant-1' },
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockResponse);

      const result = await provider.createPaymentIntent(
        5000,
        'usd',
        { tenantId: 'tenant-1' },
        'idempotency-key-1',
      );

      expect(result).toEqual({
        id: 'pi_123',
        clientSecret: 'pi_123_secret',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        metadata: { tenantId: 'tenant-1' },
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 5000,
          currency: 'usd',
          metadata: { tenantId: 'tenant-1' },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: 'idempotency-key-1' },
      );
    });

    it('should throw InternalServerErrorException on Stripe failure', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Stripe API error'));

      await expect(
        provider.createPaymentIntent(5000, 'usd', {}),
      ).rejects.toThrow('Failed to create payment intent');
    });
  });

  describe('retrievePaymentIntent', () => {
    it('should retrieve payment intent by ID', async () => {
      const mockResponse = {
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        amount: 5000,
        currency: 'usd',
        status: 'succeeded',
        metadata: {},
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockResponse);

      const result = await provider.retrievePaymentIntent('pi_123');

      expect(result.id).toBe('pi_123');
      expect(result.status).toBe('succeeded');
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_123');
    });

    it('should throw InternalServerErrorException on retrieval failure', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValue(
        new Error('Not found'),
      );

      await expect(
        provider.retrievePaymentIntent('pi_invalid'),
      ).rejects.toThrow('Failed to retrieve payment intent');
    });
  });

  describe('createRefund', () => {
    it('should create full refund without amount', async () => {
      const mockResponse = {
        id: 're_123',
        amount: 5000,
        status: 'succeeded',
      };

      mockStripe.refunds.create.mockResolvedValue(mockResponse);

      const result = await provider.createRefund('pi_123', undefined, 'refund-key');

      expect(result).toEqual({
        id: 're_123',
        amount: 5000,
        status: 'succeeded',
        paymentIntentId: 'pi_123',
      });

      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_123' },
        { idempotencyKey: 'refund-key' },
      );
    });

    it('should create partial refund with amount', async () => {
      const mockResponse = {
        id: 're_123',
        amount: 2500,
        status: 'succeeded',
      };

      mockStripe.refunds.create.mockResolvedValue(mockResponse);

      const result = await provider.createRefund('pi_123', 2500);

      expect(result.amount).toBe(2500);
      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_123', amount: 2500 },
        { idempotencyKey: undefined },
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const mockEvent = { type: 'payment_intent.succeeded' };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = provider.verifyWebhookSignature(
        'payload',
        'valid-signature',
        'webhook-secret',
      );

      expect(result.success).toBe(true);
      expect(result.event).toEqual(mockEvent);
    });

    it('should return error for invalid signature', () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = provider.verifyWebhookSignature(
        'payload',
        'invalid-signature',
        'webhook-secret',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Webhook signature verification failed');
    });
  });

  describe('constructWebhookEvent', () => {
    it('should construct event from payload', () => {
      const mockEvent = { type: 'charge.refunded', data: {} };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = provider.constructWebhookEvent(
        'payload',
        'signature',
        'secret',
      );

      expect(result).toEqual(mockEvent);
    });

    it('should throw error for invalid payload', () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid payload');
      });

      expect(() =>
        provider.constructWebhookEvent('payload', 'sig', 'secret'),
      ).toThrow('Invalid payload');
    });
  });
});
