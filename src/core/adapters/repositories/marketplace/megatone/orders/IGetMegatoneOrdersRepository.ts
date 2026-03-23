import type { OrdersRange } from '../../../../../entitis/orders/Orders';
import type { GetMegatoneOrdersResponse } from '../../../../../entitis/marketplace-api/megatone/orders/GetMegatoneOrdersResponse';

export const I_GET_MEGATONE_ORDERS_REPOSITORY = Symbol(
  'I_GET_MEGATONE_ORDERS_REPOSITORY',
);

export interface IGetMegatoneOrdersRepository {
  getByDateRange(range: OrdersRange): Promise<GetMegatoneOrdersResponse[]>;
}
