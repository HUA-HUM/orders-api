import type { NormalizedOrder } from '../../../../entitis/orders/Orders';
import type { OrderProcessingFields } from '../../../../entitis/madre-api/orders/NormalizedOrderRequest';
import type {
  FindOrderResponse,
  InsertOrdersResponse,
  PendingOrdersQuery,
  PendingOrdersResponse,
  UpdateOrderStatusRequest,
  UpdateOrderStatusResponse,
} from '../../../../entitis/madre-api/orders/OrdersPersistenceResponse';

export const I_ORDERS_PERSISTENCE_REPOSITORY = Symbol(
  'I_ORDERS_PERSISTENCE_REPOSITORY',
);

export interface OrderToPersist {
  order: NormalizedOrder;
  // Sin resultado se inserta PENDING
  processing?: OrderProcessingFields;
}

export interface IOrdersPersistenceRepository {
  insert(orders: OrderToPersist[]): Promise<InsertOrdersResponse>;

  findByUniqueKey(uniqueKey: string): Promise<FindOrderResponse>;

  /* Ordenes con persistence_status PENDING, de a una pagina (madre devuelve hasta 200) */
  findPending(query: PendingOrdersQuery): Promise<PendingOrdersResponse>;

  updateStatus(
    id: number,
    data: UpdateOrderStatusRequest,
  ): Promise<UpdateOrderStatusResponse>;
}
