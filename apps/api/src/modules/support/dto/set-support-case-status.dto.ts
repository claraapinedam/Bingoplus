import { ApiProperty } from '@nestjs/swagger';
import { SupportCaseStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetSupportCaseStatusDto {
  @ApiProperty({ enum: SupportCaseStatus })
  @IsEnum(SupportCaseStatus)
  status!: SupportCaseStatus;
}
