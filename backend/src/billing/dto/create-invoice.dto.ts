import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, IsUUID, IsDateString, MaxLength, Matches } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^(\d+)\s*(days?|weeks?|months?)$/i, {
    message: 'recurrenceRule must be a valid pattern like "30 days", "1 month", "2 weeks"',
  })
  recurrenceRule?: string;
}
