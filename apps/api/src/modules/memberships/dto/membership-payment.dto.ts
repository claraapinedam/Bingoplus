import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { MembershipPaymentMethod, MembershipPaymentStatus } from '@prisma/client';

/** Business submits the receipt URL + payment method for the current due period — amount/period
 * are always resolved server-side from the membership itself (MembershipsService.resolveDuePeriod
 * / computeDueAmount), never trusted from the client. `method` is required here even though it's
 * nullable on the model — it's only ever null on an auto-generated placeholder row nobody has
 * paid yet. */
export class SubmitMembershipPaymentDto {
  @ApiProperty({ description: 'URL returned by POST /uploads for the deposit/transfer/card-payment receipt image.' })
  @IsString()
  @IsUrl({ require_tld: false })
  receiptUrl!: string;

  @ApiProperty({ enum: MembershipPaymentMethod })
  @IsEnum(MembershipPaymentMethod)
  method!: MembershipPaymentMethod;
}

export class RejectMembershipPaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  // Same empty-string guard as SendChatMessageDto.imageUrl — @IsOptional() alone doesn't skip
  // validation for '', only null/undefined, and this field isn't a URL but the form can still
  // submit an untouched '' value.
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Same idempotency-key shape as CreateBookingPaymentDto — a retried request with the same key
 * never double-charges (see PaymentService.createPayment). */
export class CreateMembershipCardPaymentDto {
  @ApiProperty({ description: 'Client-generated — a retried request with the same key never double-charges' })
  @IsString()
  idempotencyKey!: string;
}

/** Same shape as ConfirmBookingPaymentDto. */
export class ConfirmMembershipCardPaymentDto {
  @ApiPropertyOptional({
    description: 'Sandbox-only test hook — forces the simulated payment to fail instead of succeed',
  })
  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;
}

export class ListMembershipPaymentsQueryDto {
  @ApiPropertyOptional({ enum: MembershipPaymentStatus })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(MembershipPaymentStatus)
  status?: MembershipPaymentStatus;
}
