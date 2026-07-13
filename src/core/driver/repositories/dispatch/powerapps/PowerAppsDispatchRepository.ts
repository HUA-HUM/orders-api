import { Injectable } from '@nestjs/common';
import type {
  IPowerAppsDispatchRepository,
  PowerAppsDispatchResult,
} from '../../../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type { NormalizedOrder } from '../../../../entitis/orders/Orders';
import { toPowerAppsPayload } from '../../../../interactor/orders/mappers/toPowerAppsPayload';

@Injectable()
export class PowerAppsDispatchRepository implements IPowerAppsDispatchRepository {
  private readonly url = process.env.POWERAPPS_API_URL ?? '';

  async createSale(
    order: NormalizedOrder,
    processId: string,
  ): Promise<PowerAppsDispatchResult> {
    if (!this.url) {
      throw new Error(
        'POWERAPPS_API_URL no configurado (endpoint a reemplazar)',
      );
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        processId,
        data: toPowerAppsPayload(order),
      }),
    });

    if (!response.ok) {
      throw new Error(`PowerApps respondio ${response.status}`);
    }

    return { ok: true };
  }
}
