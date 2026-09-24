import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class SetLegalInfoDto {
  @ApiProperty({ description: 'Razón social de BINGO+' })
  @IsString()
  legalName!: string;

  @ApiProperty({ description: 'RUC de BINGO+' })
  @IsString()
  taxId!: string;

  @ApiProperty()
  @IsString()
  addressLine!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiProperty({ description: 'Nombre del representante legal de BINGO+' })
  @IsString()
  legalRepresentativeName!: string;
}
