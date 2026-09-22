import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SupportChatsService } from './support-chats.service';
import { CreateSupportChatDto } from './dto/create-support-chat.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { RateChatDto } from './dto/rate-chat.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

/** "Soporte con un pedido" — same shared-surface convention as SupportCasesController. Message
 * listing is the polling endpoint the frontend hits every few seconds while a chat is open. */
@ApiTags('me/support/chats')
@Controller('me/support/chats')
export class SupportChatsController {
  constructor(private readonly chats: SupportChatsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupportChatDto) {
    return this.chats.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.chats.listMine(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.chats.getMine(user.id, id);
  }

  @Get(':id/messages')
  async listMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: ListMessagesQueryDto) {
    await this.chats.getMine(user.id, id); // 404s if this isn't the caller's own chat
    return this.chats.listMessages(id, query.after);
  }

  @Post(':id/messages')
  async sendMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendChatMessageDto) {
    return this.chats.sendMine(user.id, id, dto.text);
  }

  @Post(':id/close')
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RateChatDto) {
    return this.chats.closeAndRate(user.id, id, dto.score, dto.comment);
  }
}
