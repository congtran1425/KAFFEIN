import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  MeResponseDto,
  StoreResponseDto,
  WebLoginDto,
  WebLoginResponseDto,
} from './dto/auth.dto';
import { WebPrincipalUtil } from '../common/security/web-principal.util';

@ApiTags('Auth (Web)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/web/login
   * Web management login — returns JWT with role embedded.
   * No demo mode; frontend auto-routes based on role in token.
   */
  @Post('web/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập trang quản trị Web (Owner / Store Manager)',
    description:
      'Xác thực email + mật khẩu. Phản hồi JWT chứa role (OWNER | STORE_MANAGER) và homeStoreId. Frontend tự phân quyền theo role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Đăng nhập thành công — trả về JWT và thông tin người dùng',
    type: WebLoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Sai thông tin đăng nhập hoặc tài khoản bị khóa',
  })
  async webLogin(@Body() dto: WebLoginDto): Promise<WebLoginResponseDto> {
    return this.authService.webLogin(dto);
  }

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user profile.
   */
  @Get('me')
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token>',
    required: true,
  })
  @ApiResponse({ status: 200, type: MeResponseDto })
  async getMe(
    @Headers('authorization') authHeader: string | undefined,
  ): Promise<MeResponseDto> {
    const principal = WebPrincipalUtil.parseToken(authHeader);
    return this.authService.getMe(principal.userId);
  }

  /**
   * GET /api/v1/auth/stores
   * Returns store list scoped by role:
   *   OWNER → all stores with POS status
   *   STORE_MANAGER → only their home store
   */
  @Get('/stores')
  @ApiOperation({
    summary: 'Danh sách chi nhánh (kèm trạng thái POS thời gian thực)',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách chi nhánh và tình trạng máy POS',
    type: [StoreResponseDto],
  })
  async getStores(
    @Headers('authorization') authHeader: string | undefined,
  ): Promise<StoreResponseDto[]> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.authService.getStores(principal.role, principal.homeStoreId);
  }
}
