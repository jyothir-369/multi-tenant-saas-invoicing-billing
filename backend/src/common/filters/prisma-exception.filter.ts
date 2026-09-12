import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const CONNECTION_ERROR_CODES = ['P1000', 'P1001', 'P1002', 'P1008', 'P1017'];

@Catch(PrismaClientInitializationError, PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isConnectionError =
      exception instanceof PrismaClientInitializationError ||
      (exception instanceof PrismaClientKnownRequestError && CONNECTION_ERROR_CODES.includes(exception.code));

    if (isConnectionError) {
      this.logger.error('Database unreachable', exception.stack || exception.message);

      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: 503,
        message: 'Database temporarily unreachable. If using Neon free tier, it may be waking up — please retry in 10 seconds.',
        error: 'Service Unavailable',
      });
      return;
    }

    throw exception;
  }
}
