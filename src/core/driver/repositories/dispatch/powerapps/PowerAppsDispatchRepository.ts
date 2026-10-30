import { Injectable, Logger } from '@nestjs/common';
import type {
  IPowerAppsDispatchRepository,
  PowerAppsDispatchResult,
} from '../../../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type { NormalizedOrder } from '../../../../entitis/orders/Orders';
import { toPowerAppsPayload } from '../../../../interactor/orders/mappers/toPowerAppsPayload';

// processId es el nro de venta interno de TLQV: para ventas de marketplaces va vacio
const PROCESS_ID = '';

@Injectable()
export class PowerAppsDispatchRepository implements IPowerAppsDispatchRepository {
  private static readonly TIMEOUT_MS = 30000;
  private readonly url = process.env.POWERAPPS_API_URL ?? '';
  private readonly logger = new Logger(PowerAppsDispatchRepository.name);

  async createSale(order: NormalizedOrder): Promise<PowerAppsDispatchResult> {
    if (!this.url) {
      throw new Error('POWERAPPS_API_URL no configurado');
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        processId: PROCESS_ID,
        data: toPowerAppsPayload(order),
      }),
      signal: AbortSignal.timeout(PowerAppsDispatchRepository.TIMEOUT_MS),
    });

    const text = await response.text();
    const body = this.parseBody(text);
    // VBI puede responder 200 con { status: 'error' }. 'duplicate' (NROVENTA_ALREADY_EXISTS)
    // significa que la venta ya existe: cuenta como enviada, VBI no crea otra
    const duplicate = body?.status === 'duplicate';
    const created = response.ok && (body?.status === 'success' || duplicate);

    // Respuesta completa: madre no guarda saleId ni action, y last_error la corta a 300 caracteres
    const logLine = `[VBI] NROVENTA=${order.orderId} HTTP ${response.status}: ${text}`;
    if (created) {
      this.logger.log(logLine);
    } else {
      this.logger.warn(logLine);
      throw new Error(
        `PowerApps respondio ${response.status}: ${text.slice(0, 300)}`,
      );
    }

    return {
      ok: true,
      duplicate,
      saleId: this.readId(body, 'saleId'),
      nroVenta: this.readId(body, 'nroVenta'),
      tlqtNumber: this.readId(body, 'tlqtNumber'),
    };
  }

  private parseBody(text: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(text) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private readId(
    body: Record<string, unknown> | null,
    key: string,
  ): string | null {
    const value = body?.[key];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return null;
  }
}
