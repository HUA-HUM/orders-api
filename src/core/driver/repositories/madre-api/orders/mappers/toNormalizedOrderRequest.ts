import type { NormalizedOrder } from '../../../../../entitis/orders/Orders';
import type { NormalizedOrderRequest } from '../../../../../entitis/madre-api/orders/NormalizedOrderRequest';

const SOURCE_SCHEMA_VERSION = 'v1';

export function toNormalizedOrderRequest(
  order: NormalizedOrder,
): NormalizedOrderRequest {
  const externalSuborderId = order.suborderId ?? null;
  const uniqueKey = buildUniqueKey(
    order.marketplace,
    externalSuborderId,
    order.orderId,
  );

  return {
    marketplace: order.marketplace,
    external_order_id: order.orderId,
    external_suborder_id: externalSuborderId,
    unique_key: uniqueKey,
    purchase_date: order.createdAt,
    customer_name: order.customer.name,
    customer_document: order.customer.document,
    customer_phone: order.customer.phone,
    customer_email: order.customer.email,
    amount_total: order.amount,
    currency: null,
    status: order.latestStatus,
    delivery_status: null,
    items_quantity: sumItemsQuantity(order),
    shipping_address: order.shipping.address,
    shipping_city: order.shipping.city,
    shipping_province: order.shipping.province,
    shipping_zip_code: order.shipping.zipCode,
    estimated_delivery_date: order.shipping.estimatedDeliveryDate,
    source_payload: toSourcePayload(order.raw),
    normalized_payload: buildNormalizedPayload(order),
    source_schema_version: SOURCE_SCHEMA_VERSION,
  };
}

function buildNormalizedPayload(
  order: NormalizedOrder,
): Record<string, unknown> {
  return {
    customer: order.customer,
    shipping: order.shipping,
    items: order.items,
  };
}

function sumItemsQuantity(order: NormalizedOrder): number | null {
  if (order.items.length === 0) {
    return null;
  }

  const total = order.items.reduce(
    (sum, item) => sum + (item.quantity ?? 0),
    0,
  );

  return total > 0 ? total : null;
}

function buildUniqueKey(
  marketplace: string,
  suborderId: string | null,
  orderId: string,
): string {
  const externalId = suborderId ?? orderId;
  return `${marketplace}:${externalId}`;
}

function toSourcePayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return { raw };
}
