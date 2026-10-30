import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const originalApiKey = process.env.API_KEY;
  const guard = new ApiKeyGuard();

  const withHeaders = (
    headers: Record<string, string | string[]>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
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

  it('rejects everything when API_KEY is not configured', () => {
    delete process.env.API_KEY;

    expect(() => guard.canActivate(withHeaders({ 'x-api-key': '' }))).toThrow(
      InternalServerErrorException,
    );
  });
});
