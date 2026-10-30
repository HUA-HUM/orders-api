import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';

export const API_KEY_HEADER = 'x-api-key';
// Nombre del esquema de seguridad en Swagger (main.ts y @ApiSecurity)
export const API_KEY_SECURITY = 'api-key';

const IS_PUBLIC_KEY = 'isPublic';

/* Endpoint o controller que no pide API key (las consultas que usa panel.market) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Guard global (app.module): los endpoints exigen el header x-api-key igual a API_KEY,
 * como en central-promotion-engine, salvo los marcados con @Public().
 * Sin API_KEY configurada rechaza todos los protegidos.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const expected = process.env.API_KEY;
    if (!expected) {
      this.logger.error(
        'API_KEY no configurada: se rechazan los endpoints protegidos',
      );
      throw new InternalServerErrorException(
        'API key no configurada en el servidor',
      );
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const received = request.headers[API_KEY_HEADER];

    if (typeof received !== 'string' || !this.matches(received, expected)) {
      throw new UnauthorizedException('API key invalida o ausente');
    }

    return true;
  }

  private matches(received: string, expected: string): boolean {
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
