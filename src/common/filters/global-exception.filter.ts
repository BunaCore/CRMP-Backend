import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/**
 * Global Exception Filter
 * Catches all exceptions and formats them consistently
 * Separates concerns: services throw, filter handles
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const isHttpException = exception instanceof HttpException;

    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const isDev = process.env.NODE_ENV !== 'production';

    let responseBody: any;

    if (isHttpException) {
      // ✅ Already formatted (validation errors, BadRequest, NotFound, etc)
      responseBody = exception.getResponse();
    } else {
      // ❗ Unknown error - only expose details in development
      responseBody = {
        statusCode: 500,
        message: isDev
          ? (exception as Error)?.message || 'Unknown error'
          : 'Internal server error',
      };
    }

    // ✅ Always log full error for debugging
    this.logger.error(
      {
        err: exception,
        method: request.method,
        path: request.url,
      },
      'Unhandled exception',
    );

    response.status(status).json({
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      ...responseBody,
    });
  }
}
