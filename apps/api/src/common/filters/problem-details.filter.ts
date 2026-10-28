import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  code: string;
  traceId: string;
  errors?: Array<{ pointer?: string; code: string; detail: string }>;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    console.error(
      `[ProblemDetailsFilter] ${request.method} ${request.url} - Error:`,
      exception,
    );

    const traceId = (request.headers['x-request-id'] as string) || randomUUID();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'Đã có lỗi không mong muốn xảy ra từ phía hệ thống.';
    let code = 'INTERNAL_SERVER_ERROR';
    let errors:
      Array<{ pointer?: string; code: string; detail: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        detail = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        if (body.message) {
          if (Array.isArray(body.message)) {
            detail = 'Dữ liệu yêu cầu không hợp lệ.';
            errors = body.message.map((msg) => ({
              code: 'VALIDATION_ERROR',
              detail: String(msg),
            }));
          } else {
            detail = String(body.message);
          }
        }
        if (body.error) {
          title = String(body.error);
        }
        if (body.code) {
          code = String(body.code);
        }
      }

      switch (status) {
        case HttpStatus.BAD_REQUEST:
          title = 'Yêu cầu không hợp lệ';
          code = code || 'BAD_REQUEST';
          break;
        case HttpStatus.UNAUTHORIZED:
          title = 'Chưa xác thực';
          code = code || 'UNAUTHORIZED';
          break;
        case HttpStatus.FORBIDDEN:
          title = 'Không có quyền truy cập';
          code = code || 'FORBIDDEN';
          break;
        case HttpStatus.NOT_FOUND:
          title = 'Không tìm thấy tài nguyên';
          code = code || 'NOT_FOUND';
          break;
        case HttpStatus.CONFLICT:
          title = 'Xung đột dữ liệu';
          code = code || 'CONFLICT';
          break;
        case HttpStatus.UNPROCESSABLE_ENTITY:
          title = 'Dữ liệu không thể xử lý';
          code = code || 'VALIDATION_ERROR';
          break;
      }
    }

    const problem: ProblemDetails = {
      type: `https://api.congtc145.id.vn/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      detail,
      instance: request.originalUrl || request.url,
      code,
      traceId,
      ...(errors && { errors }),
    };

    response.setHeader('Content-Type', 'application/problem+json');
    response.setHeader('X-Request-Id', traceId);
    response.status(status).json(problem);
  }
}
