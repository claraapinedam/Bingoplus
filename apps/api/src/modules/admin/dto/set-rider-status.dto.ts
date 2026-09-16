import { ApiProperty } from '@nestjs/swagger';
import { RiderAccountStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetRiderStatusDto {
  @ApiProperty({ enum: RiderAccountStatus })
  @IsEnum(RiderAccountStatus)
  status!: RiderAccountStatus;
}
