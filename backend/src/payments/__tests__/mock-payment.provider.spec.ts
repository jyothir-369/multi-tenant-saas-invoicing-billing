import { MockPaymentProvider } from '../adapters/mock-payment.provider';

describe('MockPaymentProvider', () => {
  it('creates repeatable idempotent payment intents', async () => {
    const provider = new MockPaymentProvider();
    const first = await provider.createPaymentIntent(2500, 'usd', { tenantId: 't1' }, 'request-1');
    const second = await provider.createPaymentIntent(2500, 'usd', { tenantId: 't1' }, 'request-1');
    expect(first).toEqual(second);
    expect(first.status).toBe('requires_payment_method');
  });

  it('retrieves created intents and creates refunds', async () => {
    const provider = new MockPaymentProvider();
    const intent = await provider.createPaymentIntent(2500, 'usd', {}, 'request-2');
    await expect(provider.retrievePaymentIntent(intent.id)).resolves.toEqual(intent);
    await expect(provider.createRefund(intent.id, 2500)).resolves.toEqual(expect.objectContaining({ amount: 2500, status: 'succeeded', paymentIntentId: intent.id }));
  });

  it('parses valid webhook events and rejects malformed payloads', () => {
    const provider = new MockPaymentProvider();
    const payload = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_mock' } } });
    expect(provider.verifyWebhookSignature(payload, 'mock-signature', 'mock-secret').success).toBe(true);
    expect(provider.verifyWebhookSignature('{invalid', '', '').success).toBe(false);
  });
});
