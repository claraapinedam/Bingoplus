import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationsController, NotificationPreferencesController } from './notifications.controller';

@Module({
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
