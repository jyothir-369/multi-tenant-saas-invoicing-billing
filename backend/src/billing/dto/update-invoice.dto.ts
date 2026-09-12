import { IsInt, IsOptional, IsPositive, IsString, IsDateString, MaxLength, Matches } from 'class-validator';
import { IsValidInvoiceStatus } from './validators/invoice-status.validator';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^(\d+)\s*(days?|weeks?|months?)$/i, {
    message: 'recurrenceRule must be a valid pattern like "30 days", "1 month", "2 weeks"',
  })
  recurrenceRule?: string;

  @IsOptional()
  @IsValidInvoiceStatus({ message: 'Invalid invoice status' })
  status?: string;
}
