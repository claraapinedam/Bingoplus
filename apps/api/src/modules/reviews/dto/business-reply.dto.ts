import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class BusinessReplyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reply!: string;
}
