import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/decorators/is-strong-password.decorator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8, description: 'Must include an uppercase letter, a lowercase letter, a number and a special character' })
  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword!: string;
}
