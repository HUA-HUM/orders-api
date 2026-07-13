export const SUPPORTED_MARKETPLACES = [
  'fravega',
  'megatone',
  'oncity',
] as const;

export type MarketplaceName = (typeof SUPPORTED_MARKETPLACES)[number];

export interface OrdersRange {
  from: string;
  to: string;
}

export interface OrdersQuery {
  fechaDesde?: string;
  fechaHasta?: string;
  from?: string;
  to?: string;
}

export interface NormalizedOrderCustomer {
  name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
}

export interface NormalizedOrderShipping {
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  estimatedDeliveryDate: string | null;
}

export interface NormalizedOrderItem {
  sku: string | null;
  sellerSku: string | null;
  name: string | null;
  quantity: number | null;
}

export interface NormalizedOrder {
  marketplace: MarketplaceName;
  orderId: string;
  suborderId?: string | null;
  createdAt: string | null;
  amount: number | null;
  latestStatus: string | null;
  customer: NormalizedOrderCustomer;
  shipping: NormalizedOrderShipping;
  items: NormalizedOrderItem[];
  raw: unknown;
}

export function emptyCustomer(): NormalizedOrderCustomer {
  return { name: null, document: null, phone: null, email: null };
}

export function emptyShipping(): NormalizedOrderShipping {
  return {
    address: null,
    city: null,
    province: null,
    zipCode: null,
    estimatedDeliveryDate: null,
  };
}

export const REQUIRED_DISPATCH_FIELDS = [
  'document',
  'phone',
  'email',
] as const satisfies readonly (keyof NormalizedOrderCustomer)[];

export function findMissingDispatchFields(order: NormalizedOrder): string[] {
  return REQUIRED_DISPATCH_FIELDS.filter((field) => !order.customer[field]);
}

export interface MarketplaceOrdersResponse {
  marketplace: MarketplaceName;
  range: OrdersRange;
  total: number;
  items: NormalizedOrder[];
}

export interface MarketplaceSummary {
  marketplace: MarketplaceName;
  total: number;
}

export interface MarketplaceErrorResponse {
  marketplace: MarketplaceName;
  statusCode: number;
  message: string;
  response: unknown;
}

export interface OrdersOverviewResponse {
  range: OrdersRange;
  total: number;
  marketplaces: MarketplaceSummary[];
  items: NormalizedOrder[];
  errors: MarketplaceErrorResponse[];
}
