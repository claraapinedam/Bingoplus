import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class BulkCreateProductsDto {
  @ApiProperty({
    type: [CreateProductDto],
    description: 'Rows already resolved/validated by POST .../products/bulk-validate — resubmitted as-is to actually create them.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  products!: CreateProductDto[];
}
