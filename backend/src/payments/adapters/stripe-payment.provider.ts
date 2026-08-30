import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';

export interface PaymentIntentResult {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, string>;
}

export interface RefundResult {
  id: string;
  amount: number;
  status: string;
  paymentIntentId: string;
}

export interface WebhookVerificationResult {
  success: boolean;
  event?: Stripe.Event;
  error?: string;
}

export interface PaymentProviderAdapter {
  createPaymentIntent(
    amount: number,
    currency: string,
    metadata: Record<string, string>,
    idempotencyKey?: string,
  ): Promise<PaymentIntentResult>;

  retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentResult>;

  createRefund(
    paymentIntentId: string,
    amount?: number,
    idempotencyKey?: string,
  ): Promise<RefundResult>;

  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string,
  ): WebhookVerificationResult;

  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string,
  ): Stripe.Event;
}

@Injectable()
export class StripePaymentProvider {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripePaymentProvider.name);

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      this.logger.warn(
        'STRIPE_SECRET_KEY not configured. Using test mode with mock responses.',
      );
    }

    this.stripe = new Stripe(secretKey || 'sk_test_mock', {
      typescript: true,
    });
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata: Record<string, string>,
    idempotencyKey?: string,
  ): Promise<PaymentIntentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount,
          currency,
          metadata,
          automatic_payment_methods: {
            enabled: true,
          },
        },
        {
          idempotencyKey,
        },
      );

      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret || '',
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
      };
    } catch (error) {
      this.logger.error('Failed to create payment intent', error);
      throw new InternalServerErrorException(
        'Failed to create payment intent',
      );
    }
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        paymentIntentId,
      );

      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret || '',
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve payment intent', error);
      throw new InternalServerErrorException(
        'Failed to retrieve payment intent',
      );
    }
  }

  async createRefund(
    paymentIntentId: string,
    amount?: number,
    idempotencyKey?: string,
  ): Promise<RefundResult> {
    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundParams.amount = amount;
      }

      const refund = await this.stripe.refunds.create(refundParams, {
        idempotencyKey,
      });

      return {
        id: refund.id,
        amount: refund.amount,
        status: refund.status || 'pending',
        paymentIntentId,
      };
    } catch (error) {
      this.logger.error('Failed to create refund', error);
      throw new InternalServerErrorException('Failed to create refund');
    }
  }

  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string,
  ): WebhookVerificationResult {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );

      return { success: true, event };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Webhook signature verification failed: ${errorMessage}`);
      return {
        success: false,
        error: `Webhook signature verification failed: ${errorMessage}`,
      };
    }
  }

  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
