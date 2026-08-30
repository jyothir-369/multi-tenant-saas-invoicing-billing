import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;
}
