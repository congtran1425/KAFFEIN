import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import { CatalogService } from './catalog.service';
import { UpdateCategoryTaxDto, UpdatePriceDto } from './dto/update-catalog.dto';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  private positiveId(id: string): bigint {
    if (!/^[1-9]\d*$/.test(id))
      throw new BadRequestException('Invalid catalog ID.');
    return BigInt(id);
  }

  @Get('product-categories')
  @ApiOperation({ summary: 'Danh mục sản phẩm và VAT dùng cho POS' })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential>',
    required: true,
  })
  getCategories(@Headers('authorization') authorization?: string) {
    return this.catalogService.getCategories(authorization);
  }

  @Get('products')
  @ApiOperation({ summary: 'Catalog sản phẩm, size và topping dùng cho POS' })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential>',
    required: true,
  })
  getProducts(@Headers('authorization') authorization?: string) {
    return this.catalogService.getProducts(authorization);
  }

  @Get('web/products')
  @ApiOperation({ summary: 'Web catalog including hidden products' })
  getWebProducts(@Headers('authorization') authorization?: string) {
    WebPrincipalUtil.requireOwnerOrManager(authorization);
    return this.catalogService.getProducts(authorization, true);
  }

  @Get('web/toppings')
  @ApiOperation({ summary: 'Web topping list' })
  getWebToppings(@Headers('authorization') authorization?: string) {
    WebPrincipalUtil.requireOwnerOrManager(authorization);
    return this.catalogService.getToppings();
  }

  @Patch('product-variants/:id/price')
  @ApiOperation({ summary: 'Owner changes a size price for future sales' })
  updateVariantPrice(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdatePriceDto,
  ) {
    WebPrincipalUtil.requireOwner(authHeader);
    return this.catalogService.updateVariantPrice(
      this.positiveId(id),
      dto.priceVnd,
    );
  }

  @Patch('product-categories/:id/tax')
  @ApiOperation({ summary: 'Owner changes inclusive VAT for future sales' })
  updateCategoryTax(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryTaxDto,
  ) {
    WebPrincipalUtil.requireOwner(authHeader);
    return this.catalogService.updateCategoryTax(
      this.positiveId(id),
      dto.taxRateBps,
    );
  }

  @Patch('toppings/:id/price')
  @ApiOperation({ summary: 'Owner changes a topping price for future sales' })
  updateToppingPrice(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdatePriceDto,
  ) {
    WebPrincipalUtil.requireOwner(authHeader);
    return this.catalogService.updateToppingPrice(
      this.positiveId(id),
      dto.priceVnd,
    );
  }

  @Patch('products/:id/status')
  @ApiOperation({
    summary: 'Owner bật/tắt trạng thái hiển thị món toàn chuỗi',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  updateProductStatus(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    WebPrincipalUtil.requireOwner(authHeader);
    return this.catalogService.updateProductStatus(
      this.positiveId(id),
      Boolean(isActive),
    );
  }

  @Delete('products/:id')
  @ApiOperation({
    summary: 'Owner ẩn món khỏi menu toàn chuỗi',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  deleteProduct(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
  ) {
    WebPrincipalUtil.requireOwner(authHeader);
    return this.catalogService.deleteProduct(this.positiveId(id));
  }
}
