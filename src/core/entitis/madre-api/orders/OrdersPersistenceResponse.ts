import type {
  NormalizedOrderRequest,
  PersistenceStatus,
} from './NormalizedOrderRequest';

export interface InsertOrdersResponse {
  status: string;
  total: number;
  inserted: number;
  skipped: number;
}

export interface PersistedOrder extends NormalizedOrderRequest {
  id: number;
  persistence_status: PersistenceStatus;
  notification_system_a_status: string | null;
  notification_system_b_status: string | null;
  floxu_code: string | null;
  vbi_sale_id: string | null;
  vbi_nro_venta: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  invoice_date: string | null;
  last_error: string | null;
  last_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FindOrderResponse {
  exists: boolean;
  order: PersistedOrder | null;
}

export interface PendingOrdersQuery {
  limit: number;
  marketplace?: string;
  // Paginado: devuelve las de id mayor
  afterId?: number;
}

export interface PendingOrdersResponse {
  limit: number;
  count: number;
  // Pagina llena: puede haber mas, se piden con afterId = nextAfterId
  nextAfterId: number | null;
  items: PersistedOrder[];
}

export interface UpdateOrderStatusRequest {
  persistence_status?: PersistenceStatus;
  notification_system_a_status?: string | null;
  notification_system_b_status?: string | null;
  floxu_code?: string | null;
  invoice_number?: string | null;
  invoice_url?: string | null;
  invoice_date?: string | null;
  last_error?: string | null;
  vbi_sale_id?: string | null;
  vbi_nro_venta?: string | null;
  // Status RAW del marketplace
  status?: string | null;
  delivery_status?: string | null;
  estimated_delivery_date?: string | null;
}

export interface UpdateOrderStatusResponse {
  status: string;
}
