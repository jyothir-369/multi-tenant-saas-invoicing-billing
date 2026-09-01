import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get outbox event statistics for the current tenant.
   */
  @Get('outbox/stats')
  async getOutboxStats(): Promise<{
    pending: number;
    processed: number;
    recentEvents: Array<{
      id: string;
      type: string;
      createdAt: Date;
      processedAt: Date | null;
    }>;
  }> {
    return this.notificationsService.getOutboxStats();
  }

  @Get()
  list(@CurrentUser() user: CurrentUserData) { return this.notificationsService.list(user.id); }

  @Post(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserData) { return this.notificationsService.markRead(user.id, id); }

  @Get('activity')
  activity() { return this.notificationsService.activity(); }

  /**
   * Get queue statistics.
   */
  @Get('queue/stats')
  async getQueueStats(): Promise<any> {
    return this.notificationsService.getQueueStats();
  }

  /**
   * Manually process pending outbox events.
   */
  @Post('outbox/process')
  async processOutboxEvents(
    @Query('limit') limit?: number,
    @CurrentUser() user?: CurrentUserData,
  ): Promise<{ processed: number }> {
    const processed = await this.notificationsService.processPendingOutboxEvents(limit || 100);
    return { processed };
  }

  /**
   * Generate invoice PDF.
   */
  @Post('pdf/invoice/:invoiceId')
  async generateInvoicePdf(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Query('invoiceNumber') invoiceNumber?: string,
    @CurrentUser() user?: CurrentUserData,
  ): Promise<{ filePath: string; fileName: string; size: number }> {
    return this.notificationsService.generateInvoicePdf(
      user!.tenantId,
      invoiceId,
      invoiceNumber,
    );
  }

  /**
   * Queue invoice email.
   */
  @Post('email/invoice')
  async queueInvoiceEmail(
    @Body()
    body: {
      invoiceId: string;
      customerName: string;
      customerEmail: string;
      invoiceNumber: string;
      amount: number;
      dueDate: string;
      paymentLink?: string;
    },
    @CurrentUser() user?: CurrentUserData,
  ): Promise<{ queued: boolean }> {
    await this.notificationsService.queueInvoiceEmail(
      user!.tenantId,
      body,
    );
    return { queued: true };
  }

  /**
   * Send receipt email.
   */
  @Post('email/receipt')
  async queueReceiptEmail(
    @Body()
    body: {
      paymentId: string;
      customerName: string;
      customerEmail: string;
      amount: number;
      paidAt: string;
      invoiceNumber?: string;
    },
    @CurrentUser() user?: CurrentUserData,
  ): Promise<{ queued: boolean }> {
    await this.notificationsService.queueReceiptEmail(
      user!.tenantId,
      body,
    );
    return { queued: true };
  }

  /**
   * Trigger recurring invoice generation.
   */
  @Post('recurring/generate')
  async triggerRecurringGeneration(
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ generated: number }> {
    const generated = await this.notificationsService.triggerRecurringInvoiceGeneration(
      user.tenantId,
    );
    return { generated };
  }
}
