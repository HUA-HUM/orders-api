export interface FravegaOrderListItemResponse {
  id?: number | string;
  orderId?: number | string;
  createdAt?: string;
  creationDate?: string;
  amount?: number;
  total?: number;
  price?: number;
  [key: string]: unknown;
}

export interface GetFravegaOrdersResponse {
  scrollId: string | null;
  currentPage: number;
  pages: number;
  pageSize: number;
  total: number;
  items: FravegaOrderListItemResponse[];
}
