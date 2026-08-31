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
  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = [
    'https://multi-tenant-saas-invoicing-billing-six.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    ...configuredOrigins,
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
  const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) return true;
    return allowedOrigins.includes(origin) || /^https:\/\/multi-tenant-saas-invoicing-billing-[a-z0-9-]+\.vercel\.app$/.test(origin);
  };

  app.enableCors({
    // The cors package invokes origin as a Node-style callback. Returning a
    // boolean here leaves every request waiting for a callback indefinitely.
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  console.log('PORT environment variable:', process.env.PORT);
  const port = Number(process.env.PORT) || 3000;
  console.log(`Starting HTTP server on 0.0.0.0:${port}`);
  await app.listen(port, '0.0.0.0');
  console.log(`HTTP server successfully listening on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
