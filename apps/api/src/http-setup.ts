import { HttpStatus } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ACCESS_HEADER, configuredAccessToken, isRequestAllowed } from './access/access-token';
import { resolveRepoRoot } from './runtime-env';

export const API_PREFIX = 'api';
// Voice notes arrive as raw WAV bodies (POST /api/workflows/:id/voice-notes).
const WAV_BODY_LIMIT = '5mb';

// HTTP surface for both dev and production:
// - every API route lives under /api (the web dev server proxies /api);
// - when DEMO_ACCESS_TOKEN is set, /api requires the access proof;
// - when the web app is built (apps/web/dist), the API also serves it with
//   an SPA fallback, so one container serves the whole demo.
export function configureHttp(app: NestExpressApplication): { servesWeb: boolean } {
  app.setGlobalPrefix(API_PREFIX);
  app.useBodyParser('raw', { type: 'audio/wav', limit: WAV_BODY_LIMIT });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const allowed = isRequestAllowed({
      path: request.path,
      token: configuredAccessToken(),
      cookieHeader: request.headers.cookie,
      headerToken: request.header(ACCESS_HEADER) ?? undefined,
    });
    if (!allowed) {
      response.status(HttpStatus.UNAUTHORIZED).json({ message: 'Access token required.' });
      return;
    }
    next();
  });
  const webDist = join(resolveRepoRoot(), 'apps', 'web', 'dist');
  const indexHtml = join(webDist, 'index.html');
  if (!existsSync(indexHtml)) {
    return { servesWeb: false };
  }
  app.useStaticAssets(webDist, { index: false });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const isPageRequest = request.method === 'GET' && !request.path.startsWith(`/${API_PREFIX}`);
    if (!isPageRequest) {
      next();
      return;
    }
    response.sendFile(indexHtml);
  });
  return { servesWeb: true };
}
