import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaleItemToppingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  toppingId: string;

  @ApiProperty()
  toppingName: string;

  @ApiProperty()
  unitPriceVnd: string;

  @ApiProperty()
  quantityPerItem: number;
}

export class SaleItemConsumptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ingredientId: string;

  @ApiProperty()
  ingredientName: string;

  @ApiProperty()
  baseUnit: string;

  @ApiProperty()
  quantityPerItem: number;

  @ApiProperty()
  quantityTotal: number;
}

export class SaleItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  variantId: string;

  @ApiProperty()
  variantName: string;

  @ApiProperty()
  baseUnitPriceVnd: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  taxRateBps: number;

  @ApiProperty()
  taxAmountVnd: string;

  @ApiProperty()
  subtotalVnd: string;

  @ApiProperty()
  lineTotalVnd: string;

  @ApiPropertyOptional()
  note?: string;

  @ApiProperty({ type: [SaleItemToppingResponseDto] })
  toppings: SaleItemToppingResponseDto[];

  @ApiProperty({ type: [SaleItemConsumptionResponseDto] })
  consumptions: SaleItemConsumptionResponseDto[];
}

export class SalePaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  method: string;

  @ApiProperty()
  provider: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  amountVnd: string;

  @ApiPropertyOptional()
  merchantOrderId?: string;

  @ApiPropertyOptional()
  paidAt?: string;
}

export class SaleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  deviceId: string;

  @ApiProperty()
  cashierUserId: string;

  @ApiPropertyOptional()
  registerSessionId?: string;

  @ApiProperty()
  saleNumber: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ description: 'Doanh thu thuần trước thuế (VND)' })
  subtotalVnd: string;

  @ApiProperty({ description: 'Tổng tiền thuế VAT (VND)' })
  taxVnd: string;

  @ApiProperty({ description: 'Tổng tiền thanh toán inclusive VAT (VND)' })
  totalVnd: string;

  @ApiPropertyOptional()
  note?: string;

  @ApiProperty()
  businessDate: string;

  @ApiProperty()
  completedAt: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ type: [SaleItemResponseDto] })
  items: SaleItemResponseDto[];

  @ApiProperty({ type: [SalePaymentResponseDto] })
  payments: SalePaymentResponseDto[];
}
