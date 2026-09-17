import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class SignContractDto {
  @ApiProperty({ description: 'Base64-encoded PNG data URL from the signature canvas' })
  @IsString()
  @Matches(/^data:image\/png;base64,/, { message: 'signatureDataUrl must be a base64 PNG data URL' })
  signatureDataUrl!: string;
}
