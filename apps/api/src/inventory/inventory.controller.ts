import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import { InventoryService } from './inventory.service';
import {
  CreateStockAdjustmentDto,
  IngredientResponseDto,
  RecipeVersionResponseDto,
  StockBalanceResponseDto,
} from './dto/inventory.dto';

@ApiTags('Inventory & Recipes')
@Controller()
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('ingredients')
  @ApiOperation({ summary: 'Lấy danh mục nguyên liệu chuẩn' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách nguyên liệu',
    type: [IngredientResponseDto],
  })
  async getIngredients(): Promise<IngredientResponseDto[]> {
    return this.inventoryService.getIngredients();
  }

  @Get('recipes')
  @ApiOperation({ summary: 'Lấy các phiên bản công thức đang áp dụng' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách công thức theo biến thể món',
    type: [RecipeVersionResponseDto],
  })
  async getRecipes(): Promise<RecipeVersionResponseDto[]> {
    return this.inventoryService.getActiveRecipes();
  }

  @Get('stores/:storeId/stock-balances')
  @ApiOperation({ summary: 'Xem số dư tồn kho tức thời tại một chi nhánh' })
  @ApiHeader({
    name: 'authorization',
    description:
      'Device credential dạng Device <credential> hoặc Web Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách tồn kho nguyên liệu của chi nhánh',
    type: [StockBalanceResponseDto],
  })
  async getStockBalances(
    @Headers('authorization') authHeader: string | undefined,
    @Param('storeId') storeId: string,
  ): Promise<StockBalanceResponseDto[]> {
    const targetStoreId = BigInt(storeId);
    if (authHeader && authHeader.startsWith('Device ')) {
      const device = await this.devicesService.authenticateDevice(authHeader);
      if (device.storeId !== targetStoreId) {
        throw new ForbiddenException(
          'Thiết bị không có quyền xem tồn kho của chi nhánh khác.',
        );
      }
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      WebPrincipalUtil.requireOwnerOrManager(authHeader, targetStoreId);
    } else {
      throw new ForbiddenException(
        'Yêu cầu xác thực thiết bị hoặc tài khoản quản trị (Bearer token).',
      );
    }
    return this.inventoryService.getStockBalances(targetStoreId);
  }

  @Post('stores/:storeId/stock-adjustments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Thực hiện nhập kho hoặc xuất hao hụt nguyên liệu (Chỉ dành cho Web Owner / Store Manager)',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Số dư tồn kho mới sau điều chỉnh',
    type: [StockBalanceResponseDto],
  })
  async adjustStock(
    @Headers('authorization') authHeader: string | undefined,
    @Param('storeId') storeId: string,
    @Body() dto: CreateStockAdjustmentDto,
  ): Promise<StockBalanceResponseDto[]> {
    if (authHeader && authHeader.startsWith('Device ')) {
      throw new ForbiddenException(
        'Thiết bị POS không được phép điều chỉnh tồn kho. Thao tác này chỉ dành cho quản trị viên Web (Owner/Store Manager).',
      );
    }
    const targetStoreId = BigInt(storeId);
    const principal = WebPrincipalUtil.requireOwnerOrManager(
      authHeader,
      targetStoreId,
    );
    return this.inventoryService.adjustStock(
      targetStoreId,
      dto,
      BigInt(principal.userId),
    );
  }
}
