import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/decorators/is-strong-password.decorator';

const STAFF_ROLES = [RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER] as const;

export class CreateStaffUserDto {
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

  @ApiProperty({ enum: STAFF_ROLES, description: 'Which admin-panel role the new account gets' })
  @IsEnum(STAFF_ROLES)
  role!: (typeof STAFF_ROLES)[number];
}
