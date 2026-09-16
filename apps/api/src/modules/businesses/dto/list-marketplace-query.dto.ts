import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class ListMarketplaceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'BusinessCategory slug (Tiendas, Veterinarios, ...)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      'ProductCategory slug (Alimento, Accesorios, ...) — narrows to businesses that carry an active product in this category. Since a cart only ever holds one business, this is how "browse by category" works here: it filters stores, not a flat product list.',
  })
  @IsOptional()
  @IsString()
  productCategory?: string;

  @ApiPropertyOptional({
    description: 'PetSpecies slug — narrows to businesses that carry products for this species',
  })
  @IsOptional()
  @IsString()
  species?: string;

  @ApiPropertyOptional({
    description: 'Real device/browser coordinates for distance ranking — omit rather than fake it',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
