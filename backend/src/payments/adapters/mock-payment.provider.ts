import { Injectable } from '@nestjs/common';
import { PaymentIntentResult, PaymentProviderAdapter, RefundResult, WebhookVerificationResult } from './stripe-payment.provider';

@Injectable()
export class MockPaymentProvider implements PaymentProviderAdapter {
  private readonly intents = new Map<string, PaymentIntentResult>();
  async createPaymentIntent(amount: number, currency: string, metadata: Record<string, string>, idempotencyKey?: string): Promise<PaymentIntentResult> {
    const existing = idempotencyKey ? this.intents.get(idempotencyKey) : undefined;
    if (existing) return existing;
    const id = `pi_mock_${crypto.randomUUID()}`;
    const result = { id, clientSecret: `${id}_secret`, amount, currency, status: 'requires_payment_method', metadata };
    if (idempotencyKey) this.intents.set(idempotencyKey, result);
    return result;
  }
  async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentResult> { return [...this.intents.values()].find((i) => i.id === paymentIntentId) || { id: paymentIntentId, clientSecret: `${paymentIntentId}_secret`, amount: 0, currency: 'usd', status: 'requires_payment_method', metadata: {} }; }
  async createRefund(paymentIntentId: string, amount = 0): Promise<RefundResult> { return { id: `re_mock_${crypto.randomUUID()}`, amount, status: 'succeeded', paymentIntentId }; }
  verifyWebhookSignature(payload: string | Buffer): WebhookVerificationResult { try { return { success: true, event: JSON.parse(payload.toString()) }; } catch { return { success: false, error: 'Invalid JSON payload' }; } }
  constructWebhookEvent(payload: string | Buffer): any { return JSON.parse(payload.toString()); }
}
