import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutValidateDto, ConfirmPaymentDto, CreatePaymentDto } from './dto/checkout.dto';

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('validate')
  validate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutValidateDto) {
    return this.checkout.validate(user.id, dto);
  }

  @Audit('checkout.create-payment', 'Order')
  @Post('create-payment')
  createPayment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto) {
    return this.checkout.createPayment(user.id, dto);
  }

  @Audit('checkout.confirm', 'Order')
  @Post('confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmPaymentDto) {
    return this.checkout.confirm(user.id, dto.paymentId, dto.simulateFailure);
  }
}
