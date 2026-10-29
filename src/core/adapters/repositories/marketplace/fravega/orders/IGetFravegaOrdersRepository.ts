import type { GetFravegaVtexOrdersResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaVtexOrdersResponse';
import type {
  FravegaFullOrderResponse,
  GetFravegaFullOrdersResponse,
} from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';

export const I_GET_FRAVEGA_ORDERS_REPOSITORY = Symbol(
  'I_GET_FRAVEGA_ORDERS_REPOSITORY',
);

export interface FravegaFullOrdersQuery {
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

export interface IGetFravegaOrdersRepository {
  listOrders(
    page: number,
    perPage: number,
  ): Promise<GetFravegaVtexOrdersResponse>;
  listFullOrders(
    query: FravegaFullOrdersQuery,
  ): Promise<GetFravegaFullOrdersResponse>;
  getFullOrder(
    suborderId: string,
    orderId: string,
  ): Promise<FravegaFullOrderResponse>;
}
