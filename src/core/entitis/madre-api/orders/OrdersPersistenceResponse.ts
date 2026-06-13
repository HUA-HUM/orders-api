import type { NormalizedOrderRequest } from './NormalizedOrderRequest';

export interface InsertOrdersResponse {
  status: string;
  total: number;
  inserted: number;
  skipped: number;
}

export interface PersistedOrder extends NormalizedOrderRequest {
  id: number;
  persistence_status: string;
  notification_system_a_status: string | null;
  notification_system_b_status: string | null;
  floxu_code: string | null;
  last_error: string | null;
  last_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FindOrderResponse {
  exists: boolean;
  order: PersistedOrder | null;
}

export interface UpdateOrderStatusRequest {
  persistence_status?: string;
  notification_system_a_status?: string | null;
  notification_system_b_status?: string | null;
  floxu_code?: string | null;
  last_error?: string | null;
}

export interface UpdateOrderStatusResponse {
  status: string;
}
