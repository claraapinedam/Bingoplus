import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';

@Module({
  imports: [BusinessCapabilitiesModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
