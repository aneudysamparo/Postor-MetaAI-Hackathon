import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from './http-setup';
import { AppModule } from './app.module';
import { loadRuntimeEnv } from './runtime-env';
import { WorkflowRunner } from './workflow/workflow-runner.service';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const runtime = loadRuntimeEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const http = configureHttp(app);
  const interrupted = await app.get(WorkflowRunner).recoverInterruptedRuns();
  const configuredPort = Number(process.env.PORT);
  const port = Number.isInteger(configuredPort) ? configuredPort : DEFAULT_PORT;
  await app.listen(port);
  new Logger('Postor').log(
    `API on http://localhost:${port} (database: ${runtime.database}, web: ${http.servesWeb}, interrupted runs closed: ${interrupted})`,
  );
}

void bootstrap();
