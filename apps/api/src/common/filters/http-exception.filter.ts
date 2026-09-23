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
      // Nest's own built-in exceptions (e.g. `new UnauthorizedException('some string')`) also carry
      // a property named `error` by default — but it's a plain string ("Unauthorized"), not our own
      // `{code, message}` shape. Checking `'error' in res` alone mistook every one of those for an
      // already-normalized body and passed it through raw, so any plain-string exception (login's
      // "Correo o contraseña incorrectos.", among others) reached the frontend as Nest's flat
      // {statusCode, message, error} shape instead of {error: {code, message}} — which every
      // frontend's apiFetch only knows how to read from `body.error.code`/`body.error.message`,
      // so it silently fell back to a generic "unexpected error" message instead of the real one.
      const hasStructuredError =
        typeof res === 'object' && res !== null && 'error' in res && typeof (res as { error?: unknown }).error === 'object' && (res as { error?: unknown }).error !== null;

      if (hasStructuredError) {
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
