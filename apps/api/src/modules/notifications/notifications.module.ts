import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationService } from './notification.service';
import { NotificationsController, NotificationPreferencesController } from './notifications.controller';
import { BusinessNotificationGateway } from './business-notification.gateway';

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationService, BusinessNotificationGateway],
  exports: [NotificationService, BusinessNotificationGateway],
})
export class NotificationsModule {}
