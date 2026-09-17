import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiderBankAccountType, RiderPayoutMethodType, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { Equals, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class RegisterRiderApplicationDto {
  // ── Basic info ──────────────────────────────────────────────────────────
  @ApiProperty()
  @IsDateString()
  birthDate!: string;

  @ApiProperty({ description: 'Cédula/DNI/passport number' })
  @IsString()
  @MinLength(5)
  nationalIdNumber!: string;

  // ── Contact info ────────────────────────────────────────────────────────
  @ApiProperty({ description: 'Updates User.phone if it differs from what is already on file' })
  @IsString()
  @MinLength(7)
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  address!: string;

  @ApiProperty()
  @IsString()
  city!: string;

  // ── ID document — front and back, uploaded separately via POST /uploads first ─────────────
  @ApiProperty()
  @IsUrl({ require_tld: false })
  idPhotoFrontUrl!: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  idPhotoBackUrl!: string;

  // ── Vehicle ─────────────────────────────────────────────────────────────
  @ApiProperty({ enum: VehicleType, enumName: 'RiderApplicationVehicleType' })
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  // Required only for MOTORCYCLE/CAR — enforced in RiderProfileService.applyAsRider, not here,
  // since the rule depends on the sibling vehicleType field.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleBrand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vehicleYear?: number;

  // ── Payout info ─────────────────────────────────────────────────────────
  @ApiProperty({ enum: RiderPayoutMethodType })
  @IsEnum(RiderPayoutMethodType)
  payoutMethod!: RiderPayoutMethodType;

  @ApiPropertyOptional({ description: 'Required when payoutMethod is BANK_ACCOUNT' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ enum: RiderBankAccountType, description: 'Required when payoutMethod is BANK_ACCOUNT' })
  @IsOptional()
  @IsEnum(RiderBankAccountType)
  accountType?: RiderBankAccountType;

  @ApiPropertyOptional({ description: 'Required when payoutMethod is BANK_ACCOUNT' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'Required when payoutMethod is MOBILE_WALLET' })
  @IsOptional()
  @IsString()
  walletProvider?: string;

  @ApiPropertyOptional({ description: 'Required when payoutMethod is MOBILE_WALLET' })
  @IsOptional()
  @IsString()
  walletNumber?: string;

  @ApiProperty()
  @IsString()
  accountHolderName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  holderDocumentNumber!: string;

  // ── Consent — both must literally be `true`; anything else fails validation before the
  // service even runs, so an unticked checkbox can never slip through as a falsy default. ──────
  @ApiProperty()
  @Equals(true, { message: 'You must accept the terms and conditions' })
  termsAccepted!: boolean;

  @ApiProperty()
  @Equals(true, { message: 'You must accept the data processing consent' })
  dataConsentAccepted!: boolean;
}
