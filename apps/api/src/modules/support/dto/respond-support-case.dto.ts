import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class RespondSupportCaseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ description: 'URL returned by POST /uploads' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  evidenceUrl?: string;
}
