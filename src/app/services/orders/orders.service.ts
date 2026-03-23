import { Injectable } from '@nestjs/common';
import type {
  MarketplaceOrdersResponse,
  OrdersOverviewResponse,
  OrdersQuery,
} from '../../../core/entitis/orders/Orders';
import { OrdersInteractor } from '../../../core/interactor/orders/OrdersInteractor';

@Injectable()
export class OrdersService {
  constructor(private readonly ordersInteractor: OrdersInteractor) {}

  async getMarketplaceOrders(
    marketplace: string,
    query: OrdersQuery,
  ): Promise<MarketplaceOrdersResponse> {
    return this.ordersInteractor.getMarketplaceOrders(marketplace, query);
  }

  async getAllMarketplaceOrders(
    query: OrdersQuery,
  ): Promise<OrdersOverviewResponse> {
    return this.ordersInteractor.getAllMarketplaceOrders(query);
  }

  async getLast24HoursOverview(): Promise<OrdersOverviewResponse> {
    return this.ordersInteractor.getLast24HoursOverview();
  }

  async getRecentHoursOverview(hours: number): Promise<OrdersOverviewResponse> {
    return this.ordersInteractor.getRecentHoursOverview(hours);
  }

  async getHistoricalOverview(): Promise<OrdersOverviewResponse> {
    return this.ordersInteractor.getHistoricalOverview();
  }
}
