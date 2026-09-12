import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNoteDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(5000)
  content?: string;
}
