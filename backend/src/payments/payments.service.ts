import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { InvoicesService } from '../billing/invoices.service';
import {
  StripePaymentProvider,
  PaymentIntentResult,
  RefundResult,
} from './adapters';
import { CreatePaymentIntentDto, CreatePaymentIntentResponseDto, RefundPaymentDto } from './dto';
import { InvoiceStatus, Payment } from '@prisma/client';

export interface PaymentWithDetails extends Payment {
  invoiceNumber?: string;
  customerName?: string;
  customerEmail?: string;
}

export interface PaymentProcessingResult {
  success: boolean;
  payment?: PaymentWithDetails;
  error?: string;
}

const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;

type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly stripeProvider: StripePaymentProvider,
    private readonly invoicesService: InvoicesService,
  ) {}

  private getTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }
    return tenantId;
  }

  /**
   * Create a payment intent for an invoice.
   * Validates invoice ownership and calculates remaining balance.
   */
  async createPaymentIntent(
    dto: CreatePaymentIntentDto,
  ): Promise<CreatePaymentIntentResponseDto> {
    const tenantId = this.getTenantId();

    // Fetch invoice with tenant ownership check
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: dto.invoiceId,
        tenantId,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
      },
      include: {
        customer: true,
        payments: {
          where: { status: PAYMENT_STATUS.COMPLETED },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(
        `Invoice with ID ${dto.invoiceId} not found or not payable`,
      );
    }

    // Calculate remaining balance
    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const remainingBalance = invoice.amount - totalPaid;

    if (remainingBalance <= 0) {
      throw new BadRequestException('Invoice is already fully paid');
    }

    // Use provided amount or remaining balance (whichever is smaller)
    const paymentAmount = Math.min(dto.amount, remainingBalance);

    // Generate idempotency key for Stripe
    const idempotencyKey = `pi_${tenantId}_${invoice.id}_${Date.now()}`;

    // Create payment intent with Stripe
    const paymentIntent = await this.stripeProvider.createPaymentIntent(
      paymentAmount,
      'usd',
      {
        tenantId,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        customerEmail: dto.customerEmail || invoice.customer.email,
        originalAmount: invoice.amount.toString(),
        idempotencyKey,
      },
      idempotencyKey,
    );

    return {
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    };
  }

  /**
   * Get all payments for the current tenant.
   */
  async findAll(invoiceId?: string): Promise<PaymentWithDetails[]> {
    const tenantId = this.getTenantId();

    const where: any = { tenantId };
    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            amount: true,
            status: true,
            customer: {
              select: { name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => ({
      ...payment,
      customerName: payment.invoice.customer.name,
      customerEmail: payment.invoice.customer.email,
    }));
  }

  /**
   * Get a single payment by ID with tenant ownership check.
   */
  async findOne(id: string): Promise<PaymentWithDetails> {
    const tenantId = this.getTenantId();

    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: {
        invoice: {
          include: {
            customer: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return {
      ...payment,
      customerName: payment.invoice.customer.name,
      customerEmail: payment.invoice.customer.email,
    };
  }

  /**
   * Process a successful payment from Stripe webhook.
   * Uses idempotency key to prevent duplicate processing.
   */
  async processSuccessfulPayment(
    providerPaymentId: string,
    amount: number,
    invoiceId: string,
    tenantId: string,
  ): Promise<PaymentProcessingResult> {
    // Check for existing payment with this providerPaymentId (idempotency)
    const existingPayment = await this.prisma.payment.findUnique({
      where: { providerPaymentId },
    });

    if (existingPayment) {
      this.logger.log(
        `Payment ${providerPaymentId} already processed, returning existing payment`,
      );
      return {
        success: true,
        payment: {
          ...existingPayment,
          customerName: undefined,
          customerEmail: undefined,
        },
      };
    }

    // Fetch invoice with strict ownership check
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
      },
      include: {
        customer: true,
        payments: {
          where: { status: PAYMENT_STATUS.COMPLETED },
        },
      },
    });

    if (!invoice) {
      this.logger.error(`Invoice ${invoiceId} not found for tenant ${tenantId}`);
      return { success: false, error: 'Invoice not found' };
    }

    // Calculate new total and check if invoice should be marked as paid
    const existingTotal = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const newTotal = existingTotal + amount;
    const isFullyPaid = newTotal >= invoice.amount;

    // Use transaction to ensure atomicity
    const result = await this.prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          providerPaymentId,
          amount,
          status: PAYMENT_STATUS.COMPLETED,
        },
      });

      // Update invoice status if fully paid
      if (isFullyPaid) {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: InvoiceStatus.PAID },
        });
      }

      // Create outbox event for receipt email
      await tx.outboxEvent.create({
        data: {
          tenantId,
          type: 'PAYMENT_RECEIVED',
          payload: {
            paymentId: payment.id,
            invoiceId,
            customerId: invoice.customerId,
            customerEmail: invoice.customer.email,
            customerName: invoice.customer.name,
            amount,
            paidAt: new Date().toISOString(),
          },
        },
      });

      return payment;
    });

    this.logger.log(
      `Successfully processed payment ${providerPaymentId} for invoice ${invoiceId}`,
    );

    return {
      success: true,
      payment: {
        ...result,
        customerName: invoice.customer.name,
        customerEmail: invoice.customer.email,
      },
    };
  }

  /**
   * Process a failed payment from Stripe webhook.
   */
  async processFailedPayment(
    providerPaymentId: string,
    invoiceId: string,
    tenantId: string,
    errorMessage?: string,
  ): Promise<PaymentProcessingResult> {
    // Check for existing payment
    const existingPayment = await this.prisma.payment.findUnique({
      where: { providerPaymentId },
    });

    if (existingPayment) {
      // Update existing payment to failed status
      const updated = await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: { status: PAYMENT_STATUS.FAILED },
      });

      return { success: true, payment: updated };
    }

    // Create failed payment record
    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        invoiceId,
        providerPaymentId,
        amount: 0,
        status: PAYMENT_STATUS.FAILED,
      },
    });

    // Create outbox event for failure notification
    await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        type: 'PAYMENT_FAILED',
        payload: {
          paymentId: payment.id,
          invoiceId,
          errorMessage,
          failedAt: new Date().toISOString(),
        },
      },
    });

    return { success: true, payment };
  }

  /**
   * Process a refund.
   */
  async processRefund(dto: RefundPaymentDto): Promise<RefundResult> {
    const tenantId = this.getTenantId();

    // Fetch payment with ownership check
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: dto.paymentId,
        tenantId,
        status: PAYMENT_STATUS.COMPLETED,
      },
    });

    if (!payment) {
      throw new NotFoundException(
        `Payment with ID ${dto.paymentId} not found or not refundable`,
      );
    }

    // Get invoice to find Stripe payment intent
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: payment.invoiceId, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException('Associated invoice not found');
    }

    // Determine refund amount
    const refundAmount = dto.amount || payment.amount;

    if (refundAmount > payment.amount) {
      throw new BadRequestException(
        'Refund amount cannot exceed original payment amount',
      );
    }

    // Create Stripe refund
    const refund = await this.stripeProvider.createRefund(
      payment.providerPaymentId,
      refundAmount,
      `refund_${tenantId}_${payment.id}_${Date.now()}`,
    );

    // Check if this is a full or partial refund
    const remainingAmount = payment.amount - refundAmount;
    const newStatus =
      remainingAmount === 0
        ? PAYMENT_STATUS.REFUNDED
        : PAYMENT_STATUS.PARTIALLY_REFUNDED;

    // Update payment status
    await this.prisma.payment.update({
      where: { id: dto.paymentId },
      data: { status: newStatus },
    });

    // If full refund, revert invoice status
    if (remainingAmount === 0) {
      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: InvoiceStatus.SENT },
      });
    }

    // Create outbox event
    await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        type: 'REFUND_PROCESSED',
        payload: {
          originalPaymentId: payment.id,
          refundId: refund.id,
          refundAmount,
          invoiceId: payment.invoiceId,
          refundedAt: new Date().toISOString(),
        },
      },
    });

    return refund;
  }

  async reconcileProviderRefund(
    providerPaymentId: string,
    refundedAmount: number,
    tenantId: string,
  ): Promise<boolean> {
    if (!providerPaymentId || refundedAmount <= 0 || !tenantId) return false;

    const payment = await this.prisma.payment.findFirst({
      where: { providerPaymentId, tenantId, status: { in: [PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.PARTIALLY_REFUNDED] } },
    });
    if (!payment) return false;

    const status = refundedAmount >= payment.amount
      ? PAYMENT_STATUS.REFUNDED
      : PAYMENT_STATUS.PARTIALLY_REFUNDED;
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status } });
    if (status === PAYMENT_STATUS.REFUNDED) {
      await this.prisma.invoice.update({ where: { id: payment.invoiceId }, data: { status: InvoiceStatus.SENT } });
    }
    return true;
  }

  /**
   * Get payment statistics for the tenant.
   */
  async getPaymentStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    pendingAmount: number;
    completedAmount: number;
    refundedAmount: number;
  }> {
    const tenantId = this.getTenantId();

    const payments = await this.prisma.payment.findMany({
      where: { tenantId },
    });

    return {
      totalPayments: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: payments
        .filter((p) => p.status === PAYMENT_STATUS.PENDING)
        .reduce((sum, p) => sum + p.amount, 0),
      completedAmount: payments
        .filter((p) => p.status === PAYMENT_STATUS.COMPLETED)
        .reduce((sum, p) => sum + p.amount, 0),
      refundedAmount: payments
        .filter(
          (p) =>
            p.status === PAYMENT_STATUS.REFUNDED ||
            p.status === PAYMENT_STATUS.PARTIALLY_REFUNDED,
        )
        .reduce((sum, p) => sum + p.amount, 0),
    };
  }

  /**
   * Verify Stripe webhook signature.
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
  ): { success: boolean; event?: any; error?: string } {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      // In development without webhook secret configured, skip verification
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn(
          'STRIPE_WEBHOOK_SECRET not configured, skipping signature verification',
        );
        try {
          const event = JSON.parse(payload.toString());
          return { success: true, event };
        } catch {
          return { success: false, error: 'Invalid JSON payload' };
        }
      }
      return { success: false, error: 'Webhook secret not configured' };
    }

    return this.stripeProvider.verifyWebhookSignature(
      payload,
      signature,
      webhookSecret,
    );
  }
}
