import type { NormalizedOrder } from '../../../../entitis/orders/Orders';
import type {
  FindOrderResponse,
  InsertOrdersResponse,
  UpdateOrderStatusRequest,
  UpdateOrderStatusResponse,
} from '../../../../entitis/madre-api/orders/OrdersPersistenceResponse';

export const I_ORDERS_PERSISTENCE_REPOSITORY = Symbol(
  'I_ORDERS_PERSISTENCE_REPOSITORY',
);

export interface IOrdersPersistenceRepository {
  insert(orders: NormalizedOrder[]): Promise<InsertOrdersResponse>;

  findByUniqueKey(uniqueKey: string): Promise<FindOrderResponse>;

  updateStatus(
    id: number,
    data: UpdateOrderStatusRequest,
  ): Promise<UpdateOrderStatusResponse>;
}
