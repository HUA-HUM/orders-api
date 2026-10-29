import type { NormalizedOrder } from '../../../../entitis/orders/Orders';
import type {
  FindOrderResponse,
  InsertOrdersResponse,
  PendingOrdersResponse,
  UpdateOrderStatusRequest,
  UpdateOrderStatusResponse,
} from '../../../../entitis/madre-api/orders/OrdersPersistenceResponse';

export const I_ORDERS_PERSISTENCE_REPOSITORY = Symbol(
  'I_ORDERS_PERSISTENCE_REPOSITORY',
);

export interface IOrdersPersistenceRepository {
  insert(orders: NormalizedOrder[]): Promise<InsertOrdersResponse>;

  findByUniqueKey(uniqueKey: string): Promise<FindOrderResponse>;

  /* Ordenes con persistence_status PENDING (madre solo acepta limit, sin paginado) */
  findPending(limit: number): Promise<PendingOrdersResponse>;

  updateStatus(
    id: number,
    data: UpdateOrderStatusRequest,
  ): Promise<UpdateOrderStatusResponse>;
}
