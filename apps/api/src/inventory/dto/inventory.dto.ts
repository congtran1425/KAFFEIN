import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class IngredientResponseDto {
  @ApiProperty({ description: 'ID nguyên liệu' })
  id: string;

  @ApiProperty({ description: 'Mã nguyên liệu' })
  code: string;

  @ApiProperty({ description: 'Tên nguyên liệu' })
  name: string;

  @ApiProperty({ description: 'Đơn vị tính cơ sở (G, ML, PIECE)' })
  baseUnit: string;

  @ApiProperty({ description: 'Trạng thái hoạt động' })
  isActive: boolean;
}

export class RecipeItemDto {
  @ApiProperty({ description: 'ID nguyên liệu' })
  ingredientId: string;

  @ApiProperty({ description: 'Mã nguyên liệu' })
  ingredientCode: string;

  @ApiProperty({ description: 'Tên nguyên liệu' })
  ingredientName: string;

  @ApiProperty({ description: 'Đơn vị tính' })
  baseUnit: string;

  @ApiProperty({ description: 'Định mức tiêu hao cho 1 đơn vị món/topping' })
  quantity: number;
}

export class RecipeVersionResponseDto {
  @ApiProperty({ description: 'ID phiên bản công thức' })
  id: string;

  @ApiProperty({ description: 'ID biến thể sản phẩm (Size M, L...)' })
  productVariantId: string;

  @ApiProperty({ description: 'Số phiên bản' })
  versionNo: number;

  @ApiProperty({ description: 'Trạng thái công thức (DRAFT, ACTIVE, RETIRED)' })
  status: string;

  @ApiProperty({
    description: 'Danh sách nguyên liệu định mức',
    type: [RecipeItemDto],
  })
  items: RecipeItemDto[];
}

export class StockBalanceResponseDto {
  @ApiProperty({ description: 'ID chi nhánh' })
  storeId: string;

  @ApiProperty({ description: 'ID nguyên liệu' })
  ingredientId: string;

  @ApiProperty({ description: 'Mã nguyên liệu' })
  ingredientCode: string;

  @ApiProperty({ description: 'Tên nguyên liệu' })
  ingredientName: string;

  @ApiProperty({ description: 'Đơn vị tính' })
  baseUnit: string;

  @ApiProperty({ description: 'Số lượng tồn kho hiện thời' })
  quantity: number;

  @ApiProperty({ description: 'Thời điểm cập nhật mới nhất' })
  updatedAt: string;
}

export class StockAdjustmentItemDto {
  @ApiProperty({ description: 'ID nguyên liệu', example: '1' })
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({
    description:
      'Độ biến động số lượng (dương khi nhập kho RECEIPT, âm khi hao hụt WASTE)',
    example: 1000,
  })
  @IsNumber()
  quantityDelta: number;
}

export class CreateStockAdjustmentDto {
  @ApiProperty({
    description: 'Loại biến động kho',
    enum: ['RECEIPT', 'ADJUSTMENT', 'WASTE'],
    example: 'RECEIPT',
  })
  @IsEnum(['RECEIPT', 'ADJUSTMENT', 'WASTE'], {
    message: 'Loại biến động phải là RECEIPT, ADJUSTMENT hoặc WASTE',
  })
  movementType: 'RECEIPT' | 'ADJUSTMENT' | 'WASTE';

  @ApiProperty({
    description: 'Danh sách nguyên liệu điều chỉnh',
    type: [StockAdjustmentItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items: StockAdjustmentItemDto[];

  @ApiPropertyOptional({ description: 'Lý do nhập kho / kiểm kê / hao hụt' })
  @IsString()
  @IsOptional()
  reason?: string;
}
