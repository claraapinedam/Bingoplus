import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PublicPromotionsController, BusinessPromotionsController } from './promotions.controller';

@Module({
  controllers: [PublicPromotionsController, BusinessPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
