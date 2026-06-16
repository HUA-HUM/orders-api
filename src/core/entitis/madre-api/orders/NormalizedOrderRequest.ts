export interface NormalizedOrderRequest {
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
  source_payload: Record<string, unknown>;
  normalized_payload?: Record<string, unknown> | null;
  source_schema_version?: string | null;
}
