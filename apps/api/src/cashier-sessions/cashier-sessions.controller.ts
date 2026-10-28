import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CashierSessionsService } from './cashier-sessions.service';
import {
  CashierLoginDto,
  CashierLoginResponseDto,
} from './dto/cashier-login.dto';

@ApiTags('Cashier Sessions')
@Controller()
export class CashierSessionsController {
  constructor(private readonly sessionsService: CashierSessionsService) {}

  @Post(['cashier-sessions:login', 'cashier-sessions/login'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập thu ngân để mở phiên bán hàng',
    description:
      'Chỉ nhân viên có home_store_id trùng khớp với store của máy POS mới được phép đăng nhập. Nhân viên từ chi nhánh khác sẽ bị từ chối với mã lỗi 403.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Đăng nhập thu ngân thành công, mở phiên bán hàng.',
    type: CashierLoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Mã PIN không đúng hoặc máy POS không hợp lệ.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Nhân viên thuộc chi nhánh khác, không được phép bán hàng tại chi nhánh này.',
  })
  async login(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CashierLoginDto,
  ): Promise<CashierLoginResponseDto> {
    return this.sessionsService.login(authHeader, dto);
  }
}
