import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error', correlationId },
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null && 'error' in res) {
        body = res as Record<string, unknown>;
      } else if (typeof res === 'object' && res !== null) {
        const { message, ...rest } = res as { message?: string | string[] };
        body = {
          error: {
            code: HttpStatus[status] ?? 'ERROR',
            message: Array.isArray(message) ? message.join(', ') : message ?? exception.message,
            details: Array.isArray(message) ? message : [],
            ...rest,
          },
        };
      } else {
        body = { error: { code: HttpStatus[status] ?? 'ERROR', message: String(res) } };
      }
    } else {
      this.logger.error(
        `${request.method} ${request.url} — ${exception instanceof Error ? exception.stack : exception}`,
        correlationId,
      );
    }

    response.status(status).json(body);
  }
}
