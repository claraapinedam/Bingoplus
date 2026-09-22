import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePayoutReferenceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  referenceNumber!: string;
}
