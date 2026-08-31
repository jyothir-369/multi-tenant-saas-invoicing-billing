import { IsString, IsOptional, IsIn, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn(['free', 'starter', 'professional', 'enterprise'])
  plan?: string;
}
