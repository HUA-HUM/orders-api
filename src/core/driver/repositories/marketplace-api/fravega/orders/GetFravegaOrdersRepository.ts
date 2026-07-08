import { Injectable } from '@nestjs/common';
import type { IGetFravegaOrdersRepository } from '../../../../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type {
  FravegaVtexOrderResponse,
  GetFravegaVtexOrdersResponse,
} from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaVtexOrdersResponse';
import type { GetFravegaLegacyOrdersResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaLegacyOrdersResponse';
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

  async getOrder(orderId: string): Promise<FravegaVtexOrderResponse> {
    return this.http.get<FravegaVtexOrderResponse>(
      `/fravega/vtex/orders/${orderId}`,
    );
  }

  async listLegacyOrders(
    from: string,
    to: string,
    page: number,
    perPage: number,
  ): Promise<GetFravegaLegacyOrdersResponse> {
    // endpoint legacy: solo para el cuil que VTEX no expone
    return this.http.get<GetFravegaLegacyOrdersResponse>('/fravega/orders', {
      purchasedatefrom: from,
      purchasedateto: to,
      page,
      'page-size': perPage,
    });
  }
}
