import { IsOptional, IsString, IsInt, IsPositive } from 'class-validator';

export class UpdateLineItemDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  unitPriceCents?: number;

  @IsOptional()
  @IsInt()
  taxRateBps?: number;
}
