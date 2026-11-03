import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { userKeyRequired } from '../models/request-meta-key';
import {
  ACCESS_COOKIE,
  configuredAccessToken,
  cookieValue,
  digestOf,
  digestsMatch,
} from './access-token';

// One week: a judge reopening the demo next day stays signed in.
const ACCESS_COOKIE_MAX_AGE_MS = 604_800_000;

// Demo access + capabilities, so the UI knows what to ask for: the access
// token (when the deployment is gated) and whether live analysis needs the
// visitor's own Meta key.
@Controller('access')
export class AccessController {
  @Get()
  public status(@Req() request: Request) {
    const token = configuredAccessToken();
    let granted = true;
    if (token !== null) {
      const fromCookie = cookieValue(request.headers.cookie, ACCESS_COOKIE);
      granted = fromCookie !== null && digestsMatch(fromCookie, digestOf(token));
    }
    const serverKeyPresent = (process.env.META_API_KEY ?? '').trim().length > 0;
    return {
      required: token !== null,
      granted,
      userKeyRequired: userKeyRequired() || !serverKeyPresent,
    };
  }

  @Post()
  public grant(
    @Body() body: { token?: unknown },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = configuredAccessToken();
    if (token === null) {
      return { granted: true };
    }
    let candidate = '';
    if (typeof body?.token === 'string') {
      candidate = body.token;
    }
    if (!digestsMatch(digestOf(candidate), digestOf(token))) {
      throw new UnauthorizedException('Token de acceso inválido.');
    }
    const secure = request.secure || request.headers['x-forwarded-proto'] === 'https';
    response.cookie(ACCESS_COOKIE, digestOf(token), {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
    });
    return { granted: true };
  }
}
