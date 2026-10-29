import { Injectable } from '@nestjs/common';
import type {
  FravegaFullOrdersQuery,
  IGetFravegaOrdersRepository,
} from '../../../../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { GetFravegaVtexOrdersResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaVtexOrdersResponse';
import type {
  FravegaFullOrderResponse,
  GetFravegaFullOrdersResponse,
} from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';
import { MarketplaceHttpClient } from '../../http/MarketplaceHttpClient';

@Injectable()
export class GetFravegaOrdersRepository implements IGetFravegaOrdersRepository {
  constructor(private readonly http: MarketplaceHttpClient) {}

  async listOrders(
    page: number,
    perPage: number,
  ): Promise<GetFravegaVtexOrdersResponse> {
    return this.http.get<GetFravegaVtexOrdersResponse>('/fravega/vtex/orders', {
      page,
      per_page: perPage,
    });
  }

  // Seller Central + VTEX combinados: email y cuil reales del comprador
  async listFullOrders(
    query: FravegaFullOrdersQuery,
  ): Promise<GetFravegaFullOrdersResponse> {
    return this.http.get<GetFravegaFullOrdersResponse>('/fravega/full-orders', {
      purchasedatefrom: query.from,
      purchasedateto: query.to,
      page: query.page,
      'page-size': query.pageSize,
    });
  }

  async getFullOrder(
    suborderId: string,
    orderId: string,
  ): Promise<FravegaFullOrderResponse> {
    return this.http.get<FravegaFullOrderResponse>(
      `/fravega/full-orders/${encodeURIComponent(suborderId)}`,
      { orderid: orderId },
    );
  }
}
