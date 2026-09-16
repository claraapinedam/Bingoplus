import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { ListNotificationsQueryDto, UpdateNotificationPreferencesDto } from './dto/list-notifications-query.dto';

/**
 * One shared surface for every recipient type (Customer/Business/Rider/Admin — §2.6) since
 * ownership is always just "the caller's own userId", never role-specific filtering.
 */
@ApiTags('me/notifications')
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }
}

@ApiTags('me/notification-preferences')
@Controller('me/notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notifications.updatePreferences(user.id, dto);
  }
}
