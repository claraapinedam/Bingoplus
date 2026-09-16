import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description:
      'The cart is scoped to a single business (docs/01 §4). If the cart already has items ' +
      'from a different business, set this to true to clear it and start a new cart for this product.',
  })
  @IsOptional()
  @IsBoolean()
  replaceCart?: boolean;
}
