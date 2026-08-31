import 'dotenv/config';
import { Logger, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateProductionEnvironment } from './config/environment';

class JsonLogger implements LoggerService {
  private write(level: string, message: any, context?: string) {
    process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, context, message: String(message) })}\n`);
  }
  log(message: any, context?: string) { this.write('info', message, context); }
  error(message: any, _trace?: string, context?: string) { this.write('error', message, context); }
  warn(message: any, context?: string) { this.write('warn', message, context); }
  debug(message: any, context?: string) { this.write('debug', message, context); }
  verbose(message: any, context?: string) { this.write('trace', message, context); }
}

async function bootstrap() {
  validateProductionEnvironment();
  const app = await NestFactory.create(AppModule, { logger: process.env.LOG_FORMAT === 'json' ? new JsonLogger() : new Logger() });
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
