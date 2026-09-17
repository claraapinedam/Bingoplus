import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: '6-digit code sent by email' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
