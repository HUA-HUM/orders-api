import type { GetFravegaOrdersResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaOrdersResponse';

export const I_GET_FRAVEGA_ORDERS_REPOSITORY = Symbol(
  'I_GET_FRAVEGA_ORDERS_REPOSITORY',
);

export interface IGetFravegaOrdersRepository {
  getByPage(page: number, pageSize: number): Promise<GetFravegaOrdersResponse>;
}
