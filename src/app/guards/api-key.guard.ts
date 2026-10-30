import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export const API_KEY_HEADER = 'x-api-key';
// Nombre del esquema de seguridad en Swagger (main.ts y @ApiSecurity)
export const API_KEY_SECURITY = 'api-key';

/**
 * Guard global (app.module): todos los endpoints exigen el header x-api-key igual a API_KEY,
 * como en central-promotion-engine. Sin API_KEY configurada rechaza todo.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
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
