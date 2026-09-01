import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateProductionEnvironment } from './config/environment';

async function bootstrapWorker() {
  validateProductionEnvironment();
  await NestFactory.createApplicationContext(AppModule);
}

bootstrapWorker();
