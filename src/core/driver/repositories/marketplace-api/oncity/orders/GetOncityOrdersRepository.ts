import { Injectable } from '@nestjs/common';
import type { IGetOncityOrdersRepository } from '../../../../../adapters/repositories/marketplace/oncity/orders/IGetOncityOrdersRepository';
import type { OrdersRange } from '../../../../../entitis/orders/Orders';
import type { GetOncityOrdersResponse } from '../../../../../entitis/marketplace-api/oncity/orders/GetOncityOrdersResponse';
import { MarketplaceHttpClient } from '../../http/MarketplaceHttpClient';

@Injectable()
export class GetOncityOrdersRepository implements IGetOncityOrdersRepository {
  constructor(private readonly http: MarketplaceHttpClient) {}

  async getByDateRange(range: OrdersRange): Promise<GetOncityOrdersResponse[]> {
    return this.http.get<GetOncityOrdersResponse[]>('/oncity/orders', {
      fechaDesde: range.from,
      fechaHasta: range.to,
    });
  }
}
