import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName, SupportChatStatus, SupportSubmitterType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SupportChatsService } from './support-chats.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

class ListSupportChatsQueryDto {
  @ApiPropertyOptional({ enum: SupportSubmitterType })
  @IsOptional()
  @IsEnum(SupportSubmitterType)
  submitterType?: SupportSubmitterType;

  @ApiPropertyOptional({ enum: SupportChatStatus })
  @IsOptional()
  @IsEnum(SupportChatStatus)
  status?: SupportChatStatus;
}

/** Admin → "Soporte" → "Soporte en pedidos": live chats, meant to be shown split into Clientes/
 * Negocios/Riders tabs via `?submitterType=`, with an agent opening one to interact live/
 * bidirectionally (short polling — see SupportChatsService's header comment for why). */
@ApiTags('admin/support/chats')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/support/chats')
export class AdminSupportChatsController {
  constructor(private readonly chats: SupportChatsService) {}

  @Get()
  list(@Query() query: ListSupportChatsQueryDto) {
    return this.chats.listForAdmin(query.submitterType, query.status);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.chats.getOneAdmin(id);
  }

  @Get(':id/messages')
  listMessages(@Param('id') id: string, @Query() query: ListMessagesQueryDto) {
    return this.chats.listMessages(id, query.after);
  }

  @Post(':id/open')
  open(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    return this.chats.openAdmin(admin.id, id);
  }

  @Post(':id/messages')
  sendMessage(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendChatMessageDto) {
    return this.chats.sendAdmin(admin.id, id, dto.text, dto.imageUrl);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.chats.closeAdmin(id);
  }
}
