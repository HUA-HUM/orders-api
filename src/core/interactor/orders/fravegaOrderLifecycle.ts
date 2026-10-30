import type { FravegaFullOrderResponse } from '../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';
import type { UpdateOrderStatusRequest } from '../../entitis/madre-api/orders/OrdersPersistenceResponse';

export type FravegaOrderLifecycle =
  | { state: 'open' }
  | { state: 'delivered' }
  | { state: 'cancelled'; detail: string };

// Returned (devuelta) cuenta como cancelada
const CANCELLED_SELLER_CENTRAL = ['canceled', 'cancelled', 'returned'];
const CANCELLED_DELIVERY = ['canceled', 'cancelled'];
const DELIVERED = 'delivered';

const normalize = (value?: string | null): string =>
  value?.trim().toLowerCase() ?? '';

/**
 * Estado de la orden en Fravega. Seller Central manda: VTEX no siempre se
 * entera de las devoluciones, pero si marca canceled se respeta.
 */
export function resolveFravegaLifecycle(
  order: FravegaFullOrderResponse,
): FravegaOrderLifecycle {
  const sellerCentral = order.status?.sellerCentral ?? null;
  const delivery = order.status?.sellerCentralDelivery ?? null;
  const vtex = order.status?.vtex ?? null;

  if (
    CANCELLED_SELLER_CENTRAL.includes(normalize(sellerCentral)) ||
    CANCELLED_DELIVERY.includes(normalize(delivery)) ||
    normalize(vtex) === 'canceled'
  ) {
    return {
      state: 'cancelled',
      detail: `Seller Central: ${sellerCentral ?? '-'} (entrega ${delivery ?? '-'}), VTEX: ${vtex ?? '-'}`,
    };
  }

  if (
    normalize(sellerCentral) === DELIVERED ||
    normalize(delivery) === DELIVERED
  ) {
    return { state: 'delivered' };
  }

  return { state: 'open' };
}

/**
 * Update de madre para una orden que termino en Fravega, o null si sigue abierta.
 * Entregada: COMPLETED. Cancelada o devuelta: CANCELLED, con el detalle en last_error.
 */
export function closingStatusUpdate(
  lifecycle: FravegaOrderLifecycle,
): UpdateOrderStatusRequest | null {
  if (lifecycle.state === 'delivered') {
    return { persistence_status: 'COMPLETED' };
  }
  if (lifecycle.state === 'cancelled') {
    return {
      persistence_status: 'CANCELLED',
      last_error: `[CANCELLED] ${lifecycle.detail}`,
    };
  }
  return null;
}
