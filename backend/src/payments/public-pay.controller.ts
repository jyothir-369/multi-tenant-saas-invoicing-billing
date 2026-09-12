import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator'; // we'll skip auth
import { PrismaService } from '../prisma/prisma.service';

@Public()
@Public()
@Controller('pay')
export class PublicPayController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token')
  async getLink(@Param('token') token: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: { invoice: { include: { customer: true, tenant: true } } },
    });
    if (!link) throw new NotFoundException('Payment link not found');
    if (link.status !== 'PENDING') throw new NotFoundException('Link expired or cancelled');
    if (new Date(link.expiresAt) < new Date()) throw new NotFoundException('Link expired');

    return {
      invoiceNumber: link.invoice.id, // internal only; ideally invoice number from DB
      customerName: link.invoice.customer.name,
      amountCents: link.amountCents,
      status: link.status,
      expiresAt: link.expiresAt,
      tenantName: link.invoice.tenant.name,
    };
  }

  @Post(':token/simulate')
  async simulate(
    @Param('token') token: string,
    @Headers('x-simulate') simulateHeader: string,
  ) {
    if (simulateHeader !== 'true') {
      throw new ForbiddenException('Simulation requires x-simulate: true header');
    }

    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: { invoice: true },
    });
    if (!link) throw new NotFoundException('Payment link not found');
    if (link.status !== 'PENDING') throw new NotFoundException('Link not active');
    if (new Date(link.expiresAt) < new Date()) throw new NotFoundException('Link expired');

    await this.prisma.$transaction(async (tx) => {
      // Mark link as simulated paid
      await tx.paymentLink.update({
        where: { id: link.id },
        data: { status: 'SIMULATED_PAID' },
      });

      // Create simulated Payment row
      await tx.payment.create({
        data: {
          tenantId: link.tenantId,
          invoiceId: link.invoiceId,
          providerPaymentId: `simulated_${token}`,
          amount: link.amountCents,
          status: 'SIMULATED',
        },
      });

      // Flip invoice to PAID
      await tx.invoice.update({
        where: { id: link.invoiceId },
        data: { status: 'PAID' },
      });

      // TODO(phase-1): replace with Stripe webhook
      // Audit log creation if audit exists (skipping for now — see TODO)
    });

    return { message: 'Payment simulated — Stripe integration coming in Phase 1' };
  }
}
