// Public checkout: return ONLY payer-facing fields. No internal IDs.
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

interface ConfirmSignatureBody {
  signerName?: string;
  signerEmail?: string;
}

@Public()
@Controller('pay')
export class PublicPayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get(':token')
  async getLink(@Param('token') token: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: {
        invoice: {
          select: {
            number: true,
            totalCents: true,
            subtotalCents: true,
            taxCents: true,
            discountCents: true,
            status: true,
            dueDate: true,
            issuedAt: true,
            requiresSignature: true,
            signatureName: true,
            signatureEmail: true,
            signedAt: true,
            lineItems: {
              orderBy: { createdAt: 'asc' },
              select: {
                description: true,
                quantity: true,
                unitPriceCents: true,
                taxRateBps: true,
                subtotalCents: true,
              },
            },
            customer: { select: { name: true, email: true } },
            tenant: { select: { name: true } },
          },
        },
      },
    });
    if (!link) throw new NotFoundException('Payment link not found');
    if (new Date(link.expiresAt) < new Date()) throw new NotFoundException('Link expired');

    const invoice = link.invoice;
    const invoiceStatus = String(invoice.status);

    return {
      invoiceNumber: invoice.number || 'INV',
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      status: invoiceStatus,
      payable: invoiceStatus === 'SENT' || invoiceStatus === 'OVERDUE',
      alreadyPaid: invoiceStatus === 'PAID',
      amountCents: link.amountCents || invoice.totalCents,
      subtotalCents: invoice.subtotalCents || 0,
      taxCents: invoice.taxCents || 0,
      discountCents: invoice.discountCents || 0,
      totalCents: invoice.totalCents || 0,
      lineItems: invoice.lineItems || [],
      dueDate: invoice.dueDate,
      issuedAt: invoice.issuedAt,
      expiresAt: link.expiresAt,
      businessName: invoice.tenant.name || 'Business',
      requiresSignature: Boolean(invoice.requiresSignature),
      signed: Boolean(invoice.signedAt),
      signerName: invoice.signatureName || undefined,
      signedAt: invoice.signedAt || undefined,
    };
  }

  @Post(':token/confirm')
  async confirm(
    @Param('token') token: string,
    @Body() body: ConfirmSignatureBody,
  ) {
    return this.settleLink(token, 'checkout', {
      name: body?.signerName,
      email: body?.signerEmail,
    });
  }

  /**
   * Kept for backward compatibility with the original "simulate" path.
   * Internally this now records a real COMPLETED payment and fires the
   * PAYMENT_RECEIVED outbox event, so receipts actually go out.
   */
  @Post(':token/simulate')
  async simulate(
    @Param('token') token: string,
    @Headers('x-simulate') simulateHeader: string,
    @Body() body: ConfirmSignatureBody,
  ) {
    if (simulateHeader !== 'true') {
      throw new BadRequestException('Simulation requires x-simulate: true header');
    }
    return this.settleLink(token, 'simulated', {
      name: body?.signerName,
      email: body?.signerEmail,
    });
  }

  /**
   * Shared settlement: lock the link, record a COMPLETED payment via the
   * canonical processSuccessfulPayment path (idempotent, tenant-scoped,
   * outbox receipt), then flip the link to PAID.
   *
   * The invoice's signature requirement is enforced here before any payment
   * is accepted: if `requiresSignature` is set, a signer name must be present.
   */
  private async settleLink(
    token: string,
    source: 'checkout' | 'simulated',
    signature?: { name?: string; email?: string },
  ) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: {
        invoice: {
          select: {
            status: true,
            totalCents: true,
            requiresSignature: true,
          },
        },
      },
    });
    if (!link) throw new NotFoundException('Payment link not found');
    if (new Date(link.expiresAt) < new Date()) throw new BadRequestException('Link expired');

    const invoiceStatus = String(link.invoice.status);
    if (invoiceStatus === 'PAID') throw new BadRequestException('Invoice is already paid');
    if (invoiceStatus === 'VOID' || invoiceStatus === 'DRAFT') {
      throw new BadRequestException('Invoice is not payable');
    }

    // Enforce the signature requirement (SIGNATURE required) up-front, with an
    // explicit message to the payer so the checkout can surface it clearly.
    if (link.invoice.requiresSignature && !signature?.name?.trim()) {
      throw new BadRequestException(
        'This invoice requires a signature before payment can be accepted.',
      );
    }

    const providerPaymentId = `${source}_${token}`;
    const result = await this.paymentsService.processSuccessfulPayment(
      providerPaymentId,
      link.amountCents,
      link.invoiceId,
      link.tenantId,
      signature?.name ? { name: signature.name, email: signature.email } : undefined,
    );

    if (!result.success) {
      throw new BadRequestException(result.error || 'Unable to record payment');
    }

    await this.prisma.paymentLink.update({
      where: { id: link.id },
      data: { status: source === 'simulated' ? 'SIMULATED_PAID' : 'PAID' },
    });

    return {
      success: true,
      message: 'Payment recorded. A receipt will be sent shortly.',
      amountCents: link.amountCents,
    };
  }
}