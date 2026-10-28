import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class UpdatePriceDto {
  @ApiProperty({ example: '39000', description: 'VND as a decimal string' })
  @IsString()
  @Matches(/^(0|[1-9]\d*)$/)
  priceVnd!: string;
}

export class UpdateCategoryTaxDto {
  @ApiProperty({
    example: 0,
    description: 'VAT basis points; 0 for the MVP default',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  taxRateBps!: number;
}
