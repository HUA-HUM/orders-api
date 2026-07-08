import { Injectable } from '@nestjs/common';
import type {
  FlokzuDispatchResult,
  IFlokzuDispatchRepository,
} from '../../../../adapters/repositories/dispatch/flokzu/IFlokzuDispatchRepository';
import type { NormalizedOrder } from '../../../../entitis/orders/Orders';
import { toFlokzuPayload } from '../../../../interactor/orders/mappers/toFlokzuPayload';

@Injectable()
export class FlokzuDispatchRepository implements IFlokzuDispatchRepository {
  private readonly url = process.env.FLOKZU_API_URL ?? '';
  private readonly apiKey = process.env.FLOKZU_API_KEY ?? '';
  private readonly username = process.env.FLOKZU_USERNAME ?? '';
  private readonly processId = process.env.FLOKZU_PROCESS_ID ?? 'TLQV';

  async createInstance(order: NormalizedOrder): Promise<FlokzuDispatchResult> {
    if (!this.url) {
      throw new Error('FLOKZU_API_URL no configurado (endpoint a reemplazar)');
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
        'X-Username': this.username,
      },
      body: JSON.stringify({
        processId: this.processId,
        data: toFlokzuPayload(order),
      }),
    });

    if (!response.ok) {
      throw new Error(`Flokzu respondio ${response.status}`);
    }

    const body = (await response.json()) as { identifier?: string };
    if (!body.identifier) {
      throw new Error('Flokzu no devolvio identifier');
    }

    return { identifier: body.identifier };
  }
}
