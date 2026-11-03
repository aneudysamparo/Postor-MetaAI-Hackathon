// Boot test: the whole Nest module graph must wire without a database.
// Catches dependency-injection errors (unresolvable providers) that unit
// checks miss. Run: npm run test -w @postor/api
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

describe('application boot', () => {
  it('initializes every module with a stubbed database', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: async () => {},
        $disconnect: async () => {},
      })
      .compile();
    await moduleRef.init();
    assert.ok(moduleRef.get(AppModule, { strict: false }) !== undefined);
    await moduleRef.close();
  });
});
