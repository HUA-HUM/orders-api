import { Injectable } from '@nestjs/common';
import type { IGetMegatoneOrdersRepository } from '../../../../../adapters/repositories/marketplace/megatone/orders/IGetMegatoneOrdersRepository';
import type { OrdersRange } from '../../../../../entitis/orders/Orders';
import type { GetMegatoneOrdersResponse } from '../../../../../entitis/marketplace-api/megatone/orders/GetMegatoneOrdersResponse';
import { MarketplaceHttpClient } from '../../http/MarketplaceHttpClient';

@Injectable()
export class GetMegatoneOrdersRepository implements IGetMegatoneOrdersRepository {
  constructor(private readonly http: MarketplaceHttpClient) {}

  async getByDateRange(
    range: OrdersRange,
  ): Promise<GetMegatoneOrdersResponse[]> {
    return this.http.get<GetMegatoneOrdersResponse[]>('/megatone/orders', {
      fechaDesde: range.from,
      fechaHasta: range.to,
    });
  }
}
