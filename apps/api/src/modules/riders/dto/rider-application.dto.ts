import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiderBankAccountType, RiderIdType, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { Equals, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class RegisterRiderApplicationDto {
  // ── Basic info ──────────────────────────────────────────────────────────
  @ApiProperty()
  @IsDateString()
  birthDate!: string;

  // See the schema comment on Rider.idType/RiderIdType — RUC/CEDULA/PASAPORTE. The 18+
  // minimum-age check on birthDate lives in RiderProfileService.applyAsRider, not here, for the
  // same reason plate/vehicle/license cross-field checks do: it can't be expressed per-field.
  @ApiProperty({ enum: RiderIdType })
  @IsEnum(RiderIdType)
  idType!: RiderIdType;

  // Required only when idType is RUC (the "razón social") — enforced in
  // RiderProfileService.applyAsRider, not here, since the rule depends on the sibling idType field.
  @ApiPropertyOptional({ description: 'Razón social — required when idType is RUC' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiProperty({ description: 'Cédula/RUC/passport number' })
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

  // ── ID document — a single photo (RUC/cédula/pasaporte, whichever applies), uploaded
  // separately via POST /uploads first. No front/back distinction — just the one document. ──────
  @ApiProperty()
  @IsUrl({ require_tld: false })
  idPhotoUrl!: string;

  @ApiProperty({ description: 'Selfie photo, white background' })
  @IsUrl({ require_tld: false })
  selfiePhotoUrl!: string;

  // ── Vehicle ─────────────────────────────────────────────────────────────
  @ApiProperty({ enum: VehicleType, enumName: 'RiderApplicationVehicleType' })
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  // plate/vehicleBrand/vehicleModel/vehicleYear/licenseNumber/licensePhotoUrl/
  // vehicleRegistrationPhotoUrl are required only for MOTORCYCLE/CAR; vehicleColor is required
  // for every vehicle type (including BIKE, where it's the only vehicle field asked at all) —
  // enforced in RiderProfileService.applyAsRider, not here, since the rules depend on the sibling
  // vehicleType field.
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

  @ApiPropertyOptional({ description: 'Required for MOTORCYCLE/CAR' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({ description: 'Driver\'s license photo — required for MOTORCYCLE/CAR' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  licensePhotoUrl?: string;

  @ApiPropertyOptional({ description: 'Vehicle registration ("matrícula") photo — required for MOTORCYCLE/CAR' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  vehicleRegistrationPhotoUrl?: string;

  // ── Payout info — bank account only; there is no mobile-wallet option in the apply flow. ──────
  @ApiProperty()
  @IsString()
  bankName!: string;

  @ApiProperty({ enum: RiderBankAccountType })
  @IsEnum(RiderBankAccountType)
  accountType!: RiderBankAccountType;

  @ApiProperty()
  @IsString()
  accountNumber!: string;

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
