import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface StandardErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'An unexpected server error occurred.';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = exception.name.replace(/Exception$/, '') || 'Error';
      } else if (typeof res === 'object' && res !== null) {
        const responseObj = res as Record<string, any>;
        error = responseObj.error || exception.name.replace(/Exception$/, '') || 'Error';

        if (Array.isArray(responseObj.message)) {
          message = responseObj.message.join('; ');
        } else if (typeof responseObj.message === 'string') {
          message = responseObj.message;
        } else {
          message = exception.message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      message = exception.message || message;
    }

    // Map common status codes to standard error names if missing
    if (!error || error === 'Error') {
      switch (statusCode) {
        case HttpStatus.BAD_REQUEST:
          error = 'Bad Request';
          break;
        case HttpStatus.NOT_FOUND:
          error = 'Not Found';
          break;
        case HttpStatus.CONFLICT:
          error = 'Conflict';
          break;
        case HttpStatus.UNPROCESSABLE_ENTITY:
          error = 'Unprocessable Entity';
          break;
        default:
          error = statusCode >= 500 ? 'Internal Server Error' : 'Error';
      }
    }

    const payload: StandardErrorResponse = {
      statusCode,
      error,
      message,
      path: request?.url || '',
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(payload);
  }
}
