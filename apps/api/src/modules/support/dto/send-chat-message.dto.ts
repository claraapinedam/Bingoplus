import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @ApiPropertyOptional({ description: 'Required unless imageUrl is set.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional({ description: 'URL returned by POST /uploads — required unless text is set.' })
  @IsOptional()
  // Same empty-string guard as CreateServiceDto.imageUrl — the upload field submits "" when left
  // untouched, and @IsOptional() alone doesn't skip validation for that, only null/undefined.
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUrl({ require_tld: false })
  imageUrl?: string;
}
