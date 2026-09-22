import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportChatRelatedType, SupportSubmitterType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** "Soporte con un pedido" — the submitter names which of their OWN Order/Delivery/Booking
 * (there is no single unified "pedido" table — see schema.prisma's Support section) the issue is
 * about; SupportChatsService.create independently re-verifies that relatedId really belongs to
 * this submitter before creating the chat, the same defense-in-depth as CreateSupportCaseDto. */
export class CreateSupportChatDto {
  @ApiProperty({ enum: SupportSubmitterType })
  @IsEnum(SupportSubmitterType)
  submitterType!: SupportSubmitterType;

  @ApiPropertyOptional({ description: 'Required when submitterType = BUSINESS' })
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiProperty({ enum: SupportChatRelatedType })
  @IsEnum(SupportChatRelatedType)
  relatedType!: SupportChatRelatedType;

  @ApiProperty()
  @IsString()
  relatedId!: string;
}
