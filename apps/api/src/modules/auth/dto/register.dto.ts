import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/decorators/is-strong-password.decorator';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, description: 'Must include an uppercase letter, a lowercase letter, a number and a special character' })
  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  password!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  // Both required — anything else fails validation before the service even runs, so an unticked
  // checkbox can never slip through as a falsy default. Mirrors RegisterRiderApplicationDto's
  // identical termsAccepted/dataConsentAccepted pattern.
  @ApiProperty()
  @Equals(true, { message: 'You must accept the terms and conditions' })
  termsAccepted!: boolean;

  @ApiProperty()
  @Equals(true, { message: 'You must acknowledge the privacy notice' })
  privacyNoticeAccepted!: boolean;

  @ApiPropertyOptional({ description: 'Separate, optional opt-in for promotional communications — never implied by the two above' })
  @IsOptional()
  @IsBoolean()
  marketingConsentAccepted?: boolean;
}
