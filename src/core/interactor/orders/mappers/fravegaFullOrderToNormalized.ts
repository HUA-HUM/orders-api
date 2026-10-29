import type { FravegaFullOrderResponse } from '../../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';
import type { NormalizedOrder } from '../../../entitis/orders/Orders';
import {
  joinParts,
  normalizePhone,
  toIsoOrNull,
  toStringOrNull,
  trimOrNull,
} from './fieldHelpers';

export function fravegaFullOrderToNormalized(
  order: FravegaFullOrderResponse,
): NormalizedOrder {
  const buyer = order.buyer ?? {};
  const shipping = order.shipping ?? {};

  return {
    marketplace: 'fravega',
    // orderId de Seller Central: junto al suborderId permite volver a consultar la orden
    orderId: String(order.orderId),
    suborderId: order.suborderId,
    createdAt: toIsoOrNull(order.purchaseDate),
    amount: typeof order.totals?.total === 'number' ? order.totals.total : null,
    productsAmount:
      typeof order.totals?.products === 'number' ? order.totals.products : null,
    latestStatus: trimOrNull(order.status?.sellerCentral),
    customer: {
      name: trimOrNull(buyer.fullName),
      document: trimOrNull(buyer.cuil),
      phone: normalizePhone(buyer.phone),
      email: trimOrNull(buyer.email),
    },
    shipping: {
      address: joinParts(
        shipping.street,
        shipping.number,
        shipping.floor,
        shipping.apartment,
      ),
      receiverName: trimOrNull(shipping.receiverName),
      city: trimOrNull(shipping.city),
      province: trimOrNull(shipping.state),
      zipCode: toStringOrNull(shipping.zipCode),
      estimatedDeliveryDate: toIsoOrNull(order.estimatedDeliveryDate),
    },
    items: (order.items ?? []).map((item) => ({
      // refId de VTEX = ASIN
      sku: trimOrNull(item.asin),
      sellerSku: trimOrNull(item.vtexSkuId),
      name: trimOrNull(item.name),
      quantity: typeof item.quantity === 'number' ? item.quantity : null,
    })),
    raw: order,
  };
}
