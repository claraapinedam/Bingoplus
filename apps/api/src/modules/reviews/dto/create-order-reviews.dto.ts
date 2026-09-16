import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class RatingInputDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class ProductRatingInputDto extends RatingInputDto {
  @ApiPropertyOptional()
  @IsString()
  productId!: string;
}

/** At least one of `rider`/`business`/`products` must be present — enforced in ReviewsService
 * rather than here, since class-validator has no clean built-in for "at least one of these". */
export class CreateOrderReviewsDto {
  @ApiPropertyOptional({ type: RatingInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RatingInputDto)
  rider?: RatingInputDto;

  @ApiPropertyOptional({ type: RatingInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RatingInputDto)
  business?: RatingInputDto;

  @ApiPropertyOptional({ type: [ProductRatingInputDto], description: 'Only products that were actually in this order are accepted.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductRatingInputDto)
  products?: ProductRatingInputDto[];
}
