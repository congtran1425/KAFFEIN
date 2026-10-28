import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CryptoUtil } from './crypto.util';

export interface WebPrincipal {
  userId: string;
  role: 'OWNER' | 'STORE_MANAGER' | 'EMPLOYEE';
  homeStoreId?: string;
}

export interface WebManagerPrincipal {
  userId: string;
  role: 'OWNER' | 'STORE_MANAGER';
  homeStoreId?: string;
}

export class WebPrincipalUtil {
  private static getJwtSecret(): string {
    return (
      process.env.JWT_ACCESS_SECRET ||
      'local-development-access-secret-change-before-deploy'
    );
  }

  static parseToken(authHeader: string | undefined): WebPrincipal {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Yêu cầu xác thực tài khoản quản trị (Authorization: Bearer <token>)',
      );
    }
    const token = authHeader.substring(7).trim();
    try {
      const payload = CryptoUtil.verifyJwt<WebPrincipal>(
        token,
        this.getJwtSecret(),
      );
      if (!payload.userId || !payload.role) {
        throw new UnauthorizedException(
          'Token không hợp lệ hoặc thiếu thông tin định danh.',
        );
      }
      return payload;
    } catch {
      throw new UnauthorizedException(
        'Token quản trị không hợp lệ hoặc đã hết hạn.',
      );
    }
  }

  static requireOwnerOrManager(
    authHeader: string | undefined,
    targetStoreId?: bigint,
  ): WebManagerPrincipal {
    const principal = this.parseToken(authHeader);
    if (principal.role === 'EMPLOYEE') {
      throw new ForbiddenException(
        'Nhân viên không có quyền thực hiện thao tác quản trị này.',
      );
    }

    if (
      principal.role === 'STORE_MANAGER' &&
      targetStoreId !== undefined &&
      principal.homeStoreId !== targetStoreId.toString()
    ) {
      throw new ForbiddenException(
        'Quản lý chi nhánh chỉ được phép thao tác trên chính chi nhánh của mình.',
      );
    }
    return principal as WebManagerPrincipal;
  }

  static requireOwner(authHeader: string | undefined): WebManagerPrincipal {
    const principal = this.requireOwnerOrManager(authHeader);
    if (principal.role !== 'OWNER') {
      throw new ForbiddenException(
        'Chỉ có Chủ chuỗi (OWNER) mới có quyền thực hiện thao tác này.',
      );
    }
    return principal;
  }
}
