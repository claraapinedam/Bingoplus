import { Module } from '@nestjs/common';
import { BusinessRankingService } from './business-ranking.service';

@Module({
  providers: [BusinessRankingService],
  exports: [BusinessRankingService],
})
export class RankingModule {}
