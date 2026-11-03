import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configuredPort = Number(process.env.PORT);
  const port = Number.isInteger(configuredPort) ? configuredPort : DEFAULT_PORT;
  await app.listen(port);
}

void bootstrap();
