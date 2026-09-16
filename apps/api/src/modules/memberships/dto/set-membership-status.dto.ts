import { ApiProperty } from '@nestjs/swagger';
import { BusinessMembershipStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetMembershipStatusDto {
  @ApiProperty({ enum: BusinessMembershipStatus })
  @IsEnum(BusinessMembershipStatus)
  status!: BusinessMembershipStatus;
}
