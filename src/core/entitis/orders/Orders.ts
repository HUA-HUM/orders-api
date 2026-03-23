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

export interface NormalizedOrder {
  marketplace: MarketplaceName;
  orderId: string;
  createdAt: string | null;
  amount: number | null;
  customerName: string | null;
  latestStatus: string | null;
  raw: unknown;
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
