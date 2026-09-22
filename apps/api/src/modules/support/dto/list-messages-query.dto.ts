import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/** The polling cursor — mirrors this codebase's other "fall back to polling" surfaces (see
 * DeliveryTrackingPage's POLL_INTERVAL_MS): the client re-polls `GET .../messages?after=<cursor>`
 * every few seconds while a chat is open, `after` being the createdAt ISO timestamp of the last
 * message it already has, so each poll only returns what's new. */
export class ListMessagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  after?: string;
}
