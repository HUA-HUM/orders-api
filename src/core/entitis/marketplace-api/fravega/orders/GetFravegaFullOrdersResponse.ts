// Respuesta de marketplace-api /fravega/full-orders (Seller Central + VTEX)

export interface FravegaFullOrderBuyer {
  fullName?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  cuil?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface FravegaFullOrderShipping {
  receiverName?: string | null;
  street?: string | null;
  number?: string | null;
  floor?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export interface FravegaFullOrderItem {
  asin?: string | null;
  vtexSkuId?: string | null;
  name?: string | null;
  quantity?: number | null;
}

export interface FravegaFullOrderResponse {
  orderId: number;
  suborderId: string;
  vtexOrderId?: string;
  status?: {
    sellerCentral?: string | null;
    // Estado de entrega de Seller Central (Pending, Delivered, Canceled...)
    sellerCentralDelivery?: string | null;
    vtex?: string | null;
  };
  purchaseDate?: string | null;
  estimatedDeliveryDate?: string | null;
  buyer?: FravegaFullOrderBuyer;
  shipping?: FravegaFullOrderShipping;
  items?: FravegaFullOrderItem[];
  totals?: { products?: number | null; total?: number | null };
  /**
   * complete: detalle de Seller Central + VTEX.
   * fallback: el detalle de Seller Central por suborden fallo y marketplace-api la armo con el
   * listado de Seller Central + VTEX (sin email). Ausente en versiones viejas de marketplace-api.
   */
  source?: 'complete' | 'fallback';
  // Datos del comprador que no se pudieron obtener (ej. ['email'])
  missing?: string[];
  // Solo en fallback: error de Seller Central que lo provoco
  fallbackReason?: string;
  [key: string]: unknown;
}

export interface FravegaFullOrderError {
  orderId: number;
  suborderId: string;
  source: 'seller-central' | 'vtex';
  message: string;
}

export interface GetFravegaFullOrdersResponse {
  currentPage: number;
  pages: number;
  pageSize: number;
  total: number;
  items: FravegaFullOrderResponse[];
  errors: FravegaFullOrderError[];
}
