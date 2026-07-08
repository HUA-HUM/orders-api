import type { FravegaVtexOrderResponse, GetFravegaVtexOrdersResponse,
} from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaVtexOrdersResponse';
import type { GetFravegaLegacyOrdersResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaLegacyOrdersResponse';

export const I_GET_FRAVEGA_ORDERS_REPOSITORY = Symbol(
  'I_GET_FRAVEGA_ORDERS_REPOSITORY',
);

export interface IGetFravegaOrdersRepository {
  listOrders(
    page: number,
    perPage: number,
  ): Promise<GetFravegaVtexOrdersResponse>;
  getOrder(orderId: string): Promise<FravegaVtexOrderResponse>;
  listLegacyOrders(
    from: string,
    to: string,
    page: number,
    perPage: number,
  ): Promise<GetFravegaLegacyOrdersResponse>;
}
