import { Injectable } from '@nestjs/common';
import type { IGetFravegaOrdersRepository } from '../../../../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { GetFravegaOrdersResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaOrdersResponse';
import type { FravegaOrderDetailResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaOrderDetailResponse';
import { MarketplaceHttpClient } from '../../http/MarketplaceHttpClient';

@Injectable()
export class GetFravegaOrdersRepository implements IGetFravegaOrdersRepository {
  constructor(private readonly http: MarketplaceHttpClient) {}

  async getByPage(
    page: number,
    pageSize: number,
  ): Promise<GetFravegaOrdersResponse> {
    return this.http.get<GetFravegaOrdersResponse>('/fravega/orders', {
      page,
      'page-size': pageSize,
    });
  }

  async getDetail(
    suborderId: string,
    orderId: string,
  ): Promise<FravegaOrderDetailResponse> {
    return this.http.get<FravegaOrderDetailResponse>(
      `/fravega/orders/${suborderId}`,
      { orderid: orderId },
    );
  }
}
