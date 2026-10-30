export type PersistenceStatus =
  | 'PENDING'
  | 'PROCESSED_FLOXU'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

/* Resultado del procesamiento: madre lo acepta en el batch, asi la orden se inserta ya procesada */
export interface OrderProcessingFields {
  persistence_status?: PersistenceStatus;
  notification_system_b_status?: string | null;
  floxu_code?: string | null;
  vbi_sale_id?: string | null;
  vbi_nro_venta?: string | null;
  last_error?: string | null;
}

export interface NormalizedOrderRequest extends OrderProcessingFields {
  marketplace: string;
  external_order_id: string;
  external_suborder_id?: string | null;
  unique_key: string;
  purchase_date?: string | null;
  customer_name?: string | null;
  customer_document?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  status?: string | null;
  delivery_status?: string | null;
  items_quantity?: number | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_province?: string | null;
  shipping_zip_code?: string | null;
  estimated_delivery_date?: string | null;
  source_payload: Record<string, unknown>;
  normalized_payload?: Record<string, unknown> | null;
  source_schema_version?: string | null;
}
