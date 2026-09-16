import { IsInt, IsNotEmpty, IsOptional, IsString, IsPositive } from 'class-validator';

export class CreateLineItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsInt()
  @IsPositive()
  unitPriceCents: number;

  @IsOptional()
  @IsInt()
  taxRateBps?: number;
}
