import { IsString, IsInt, IsOptional, Min } from 'class-validator';
export class CreateLineItemDto {
  @IsString() description: string;
  @IsInt() @Min(1) quantity: number;
  @IsInt() @Min(0) unitPriceCents: number;
  @IsInt() @Min(0) taxRateBps: number;
}
export class UpdateLineItemDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsInt() @Min(0) unitPriceCents?: number;
  @IsOptional() @IsInt() @Min(0) taxRateBps?: number;
}
