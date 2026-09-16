import { Controller, Get, Post, Body, Param, Delete, UseGuards, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { randomBytes } from 'crypto';

@Controller('payments')
export class PaymentLinksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async stats(@CurrentUser() user: CurrentUserData) {
    const tenantId = user.tenantId;
    const links = await this.prisma.paymentLink.findMany({ where: { tenantId } });
    const payments = await this.prisma.payment.findMany({ where: { tenantId } });
    return {
      collected_cents: payments.filter((p) => p.status === 'COMPLETED' || p.status === 'SIMULATED').reduce((s, p) => s + p.amount, 0),
      pending_cents: links.filter((l) => l.status === 'PENDING').reduce((s, l) => s + l.amountCents, 0),
      refunded_cents: payments.filter((p) => p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED').reduce((s, p) => s + p.amount, 0),
      count: payments.length,
    };
  }

  @Post('links')
  @UseGuards(JwtAuthGuard)
  async createLink(
    @Body() body: { invoice_id: string; expires_in_days?: number },
    @CurrentUser() user: CurrentUserData,
  ) {
    const tenantId = user.tenantId;
    const invoice = await this.prisma.invoice.findFirst({ where: { id: body.invoice_id, tenantId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    // Idempotency: return existing PENDING non-expired link
    const existing = await this.prisma.paymentLink.findFirst({
      where: { invoiceId: body.invoice_id, tenantId, status: 'PENDING' },
    });
    if (existing && new Date(existing.expiresAt) > new Date()) {
      const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pay/${existing.token}`;
      return { id: existing.id, token: existing.token, url, expires_at: existing.expiresAt };
    }
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + (body.expires_in_days ?? 14) * 86400000);
    const link = await this.prisma.paymentLink.create({
      data: {
        tenantId,
        invoiceId: body.invoice_id,
        token,
        amountCents: invoice.totalCents || 0,
        status: 'PENDING',
        expiresAt: expires,
      },
    });
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pay/${token}`;
    return { id: link.id, token, url, expires_at: link.expiresAt };
  }

  @Get('links')
  @UseGuards(JwtAuthGuard)
  async listLinks(@CurrentUser() user: CurrentUserData) {
    return this.prisma.paymentLink.findMany({
      where: { tenantId: user.tenantId },
      include: { invoice: { select: { id: true, customer: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete('links/:id')
  @UseGuards(JwtAuthGuard)
  async cancelLink(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    await this.prisma.paymentLink.updateMany({
      where: { id, tenantId: user.tenantId },
      data: { status: 'CANCELLED' },
    });
    return { ok: true };
  }
}
