import { IsUUID, IsInt, Min, IsOptional, IsString, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentIntentDto {
  @IsUUID()
  invoiceId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  amount!: number; // in cents

  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}

export class CreatePaymentIntentResponseDto {
  clientSecret!: string;
  paymentIntentId!: string;
  amount!: number;
  currency!: string;
  status!: string;
}

export class RefundPaymentDto {
  @IsUUID()
  paymentId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amount?: number; // partial refund amount in cents
}

export class PaymentWebhookEventDto {
  @IsString()
  id!: string;

  @IsString()
  type!: string;

  @IsInt()
  created!: number;

  @IsOptional()
  @IsString()
  api_version?: string;
}
