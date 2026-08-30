import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PaymentsService, PaymentWithDetails } from './payments.service';
import { CreatePaymentIntentDto, CreatePaymentIntentResponseDto, RefundPaymentDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Create a payment intent for an invoice.
   * Returns client secret for frontend Stripe.js integration.
   */
  @Post('intent')
  async createPaymentIntent(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<CreatePaymentIntentResponseDto> {
    return this.paymentsService.createPaymentIntent(dto);
  }

  /**
   * Get all payments for the tenant.
   */
  @Get()
  async findAll(
    @Query('invoiceId') invoiceId?: string,
  ): Promise<PaymentWithDetails[]> {
    return this.paymentsService.findAll(invoiceId);
  }

  /**
   * Get a single payment by ID.
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentWithDetails> {
    return this.paymentsService.findOne(id);
  }

  /**
   * Process a refund for a payment.
   */
  @Post(':id/refund')
  async refundPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { amount?: number },
  ): Promise<{ success: boolean; refundId?: string; error?: string }> {
    try {
      const result = await this.paymentsService.processRefund({
        paymentId: id,
        amount: body.amount,
      });
      return { success: true, refundId: result.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refund failed';
      return { success: false, error: message };
    }
  }

  /**
   * Get payment statistics for the tenant dashboard.
   */
  @Get('stats/summary')
  async getPaymentStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    pendingAmount: number;
    completedAmount: number;
    refundedAmount: number;
  }> {
    return this.paymentsService.getPaymentStats();
  }
}
