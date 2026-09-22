import { Module } from '@nestjs/common';
import { SupportCasesService } from './support-cases.service';
import { SupportChatsService } from './support-chats.service';
import { SupportCasesController } from './support-cases.controller';
import { SupportChatsController } from './support-chats.controller';
import { AdminSupportCasesController } from './admin-support-cases.controller';
import { AdminSupportChatsController } from './admin-support-chats.controller';

@Module({
  controllers: [SupportCasesController, SupportChatsController, AdminSupportCasesController, AdminSupportChatsController],
  providers: [SupportCasesService, SupportChatsService],
})
export class SupportModule {}
