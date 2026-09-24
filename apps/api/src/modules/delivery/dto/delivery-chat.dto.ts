import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendDeliveryChatMessageDto {
  @ApiProperty({ description: 'Plain text — this chat is text-only, no attachments.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}

/** Same polling-cursor shape as ListMessagesQueryDto (support chat) — used here only as a
 * catch-up/backfill query for a client that just (re)connected its socket, not as the primary
 * delivery mechanism (that's the realtime `delivery.chat.message` event — see DeliveryGateway). */
export class ListDeliveryChatMessagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  after?: string;
}
