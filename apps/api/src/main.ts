import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadRuntimeEnv } from './runtime-env';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const runtime = loadRuntimeEnv();
  const app = await NestFactory.create(AppModule);
  const configuredPort = Number(process.env.PORT);
  const port = Number.isInteger(configuredPort) ? configuredPort : DEFAULT_PORT;
  await app.listen(port);
  new Logger('Postor').log(`API on http://localhost:${port} (database: ${runtime.database})`);
}

void bootstrap();
