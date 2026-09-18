import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { AudienceQueryDto, ListNotificationsQueryDto, UpdateNotificationPreferencesDto } from './dto/list-notifications-query.dto';

/**
 * One shared surface for every recipient type (Customer/Business/Rider/Admin — §2.6), scoped by
 * the caller's own userId — but the same account can hold more than one of those roles at once,
 * so each request also names which Notification Center it's for via `audience`, and every row is
 * additionally scoped to that.
 */
@ApiTags('me/notifications')
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(user.id, query.audience, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser, @Query() query: AudienceQueryDto) {
    return this.notifications.unreadCount(user.id, query.audience);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: AudienceQueryDto) {
    return this.notifications.markRead(user.id, query.audience, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser, @Query() query: AudienceQueryDto) {
    return this.notifications.markAllRead(user.id, query.audience);
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
