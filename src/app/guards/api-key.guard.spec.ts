import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard, Public } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const originalApiKey = process.env.API_KEY;
  const guard = new ApiKeyGuard(new Reflector());

  class ProtectedController {
    handle(this: void): void {}
  }

  @Public()
  class PublicController {
    handle(this: void): void {}
  }

  const withHeaders = (
    headers: Record<string, string | string[]>,
    controller: typeof ProtectedController = ProtectedController,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
      getHandler: () => controller.prototype.handle,
      getClass: () => controller,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    process.env.API_KEY = 'secreta';
  });

  afterEach(() => {
    // Asignar undefined a process.env guarda el texto "undefined"
    if (originalApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = originalApiKey;
  });

  it('lets the request through with the right key', () => {
    expect(guard.canActivate(withHeaders({ 'x-api-key': 'secreta' }))).toBe(
      true,
    );
  });

  it.each([
    ['missing', {}],
    ['wrong', { 'x-api-key': 'otra' }],
    ['longer', { 'x-api-key': 'secreta-y-mas' }],
    ['repeated', { 'x-api-key': ['secreta', 'secreta'] }],
  ])('rejects a %s key with 401', (_, headers) => {
    expect(() => guard.canActivate(withHeaders(headers))).toThrow(
      UnauthorizedException,
    );
  });

  it('lets a @Public() controller through without key, even without API_KEY configured', () => {
    delete process.env.API_KEY;

    expect(guard.canActivate(withHeaders({}, PublicController))).toBe(true);
  });

  it('rejects everything when API_KEY is not configured', () => {
    delete process.env.API_KEY;

    expect(() => guard.canActivate(withHeaders({ 'x-api-key': '' }))).toThrow(
      InternalServerErrorException,
    );
  });
});
