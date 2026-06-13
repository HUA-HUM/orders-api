import type { NormalizedOrder } from '../../../../../entitis/orders/Orders';
import type { NormalizedOrderRequest } from '../../../../../entitis/madre-api/orders/NormalizedOrderRequest';

const SOURCE_SCHEMA_VERSION = 'v1';

export function toNormalizedOrderRequest(
  order: NormalizedOrder,
): NormalizedOrderRequest {
  const externalSuborderId = null;
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
    customer_name: order.customerName,
    customer_document: null,
    customer_phone: null,
    customer_email: null,
    amount_total: order.amount,
    currency: null,
    status: order.latestStatus,
    delivery_status: null,
    items_quantity: null,
    shipping_address: null,
    shipping_city: null,
    shipping_province: null,
    shipping_zip_code: null,
    source_payload: toSourcePayload(order.raw),
    normalized_payload: null,
    source_schema_version: SOURCE_SCHEMA_VERSION,
  };
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
