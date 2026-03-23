import type { OrdersRange } from '../../../../../entitis/orders/Orders';
import type { GetOncityOrdersResponse } from '../../../../../entitis/marketplace-api/oncity/orders/GetOncityOrdersResponse';

export const I_GET_ONCITY_ORDERS_REPOSITORY = Symbol(
  'I_GET_ONCITY_ORDERS_REPOSITORY',
);

export interface IGetOncityOrdersRepository {
  getByDateRange(range: OrdersRange): Promise<GetOncityOrdersResponse[]>;
}
