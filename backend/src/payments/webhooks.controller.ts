import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { WebhookRateLimitGuard } from './guards';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Handle Stripe webhook events.
   * 
   * Stripe sends webhook events with signature verification.
   * This endpoint must use raw body parsing (disabled globally).
   * 
   * Supported events:
   * - payment_intent.succeeded: Record successful payment
   * - payment_intent.payment_failed: Record failed payment
   * - charge.refunded: Handle refunds initiated on Stripe dashboard
   */
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') signature: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ received: boolean; processed?: boolean; error?: string }> {
    this.logger.log(`Received Stripe webhook: ${JSON.stringify(body?.type || 'unknown')}`);

    // Apply rate limiting
    const rateLimitGuard = new WebhookRateLimitGuard();
    if (!rateLimitGuard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any)) {
      throw new BadRequestException('Rate limit exceeded');
    }

    // Get raw body for signature verification
    const rawBody = request.rawBody;

    if (!rawBody) {
      this.logger.error('Raw body not available for webhook processing');
      throw new BadRequestException('Raw body required for webhook processing');
    }

    // Verify webhook signature
    const verificationResult = this.paymentsService.verifyWebhookSignature(
      rawBody,
      signature,
    );

    if (!verificationResult.success) {
      this.logger.error(`Webhook signature verification failed: ${verificationResult.error}`);
      throw new BadRequestException(verificationResult.error);
    }

    const event = verificationResult.event;
    const eventType = event.type;
    const eventData = event.data.object as Record<string, unknown>;

    this.logger.log(`Processing webhook event: ${eventType}`);

    try {
      switch (eventType) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(eventData);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(eventData);
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(eventData);
          break;

        case 'payment_intent.created':
          this.logger.log(`Payment intent created: ${eventData.id}`);
          break;

        default:
          this.logger.log(`Unhandled webhook event type: ${eventType}`);
      }

      return { received: true, processed: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing webhook: ${errorMessage}`, error);
      return { received: true, processed: false, error: errorMessage };
    }
  }

  /**
   * Handle successful payment intent.
   */
  private async handlePaymentIntentSucceeded(paymentIntent: Record<string, unknown>): Promise<void> {
    const id = paymentIntent.id as string;
    const amount = paymentIntent.amount as number;
    const metadata = paymentIntent.metadata as Record<string, string> | undefined;

    const tenantId = metadata?.tenantId;
    const invoiceId = metadata?.invoiceId;

    if (!tenantId || !invoiceId) {
      this.logger.warn(
        `Payment intent ${id} missing required metadata (tenantId or invoiceId)`,
      );
      return;
    }

    this.logger.log(
      `Processing successful payment: ${id}, amount: ${amount}, invoice: ${invoiceId}`,
    );

    const result = await this.paymentsService.processSuccessfulPayment(
      id,
      amount,
      invoiceId,
      tenantId,
    );

    if (result.success) {
      this.logger.log(`Successfully processed payment ${id}`);
    } else {
      this.logger.error(`Failed to process payment ${id}: ${result.error}`);
    }
  }

  /**
   * Handle failed payment intent.
   */
  private async handlePaymentIntentFailed(paymentIntent: Record<string, unknown>): Promise<void> {
    const id = paymentIntent.id as string;
    const metadata = paymentIntent.metadata as Record<string, string> | undefined;
    const lastPaymentError = paymentIntent.last_payment_error as { message?: string } | undefined;

    const tenantId = metadata?.tenantId;
    const invoiceId = metadata?.invoiceId;

    if (!tenantId || !invoiceId) {
      this.logger.warn(
        `Payment intent ${id} missing required metadata (tenantId or invoiceId)`,
      );
      return;
    }

    const errorMessage = lastPaymentError?.message || 'Payment failed';

    this.logger.log(
      `Processing failed payment: ${id}, invoice: ${invoiceId}, error: ${errorMessage}`,
    );

    await this.paymentsService.processFailedPayment(
      id,
      invoiceId,
      tenantId,
      errorMessage,
    );
  }

  /**
   * Handle charge refunded (refunds initiated from Stripe dashboard).
   */
  private async handleChargeRefunded(charge: Record<string, unknown>): Promise<void> {
    const paymentIntent = charge.payment_intent as string | undefined;
    const amountRefunded = charge.amount_refunded as number | undefined;
    const id = charge.id as string;

    if (!paymentIntent) {
      this.logger.warn(`Charge ${id} missing payment_intent reference`);
      return;
    }

    this.logger.log(
      `Processing refund for payment intent: ${paymentIntent}, amount: ${amountRefunded}`,
    );

    // Refunds initiated from Stripe dashboard need to be matched with our payments
    // This would require looking up payment by providerPaymentId
    // For now, we log it - in production, you'd have a processRefundByProviderId method
  }
}
