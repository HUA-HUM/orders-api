export interface FravegaOrderListItemResponse {
  id?: number | string;
  orderId?: number | string;
  suborderId?: string;
  purchaseDate?: string;
  createdAt?: string;
  createdOn?: string;
  creationDate?: string;
  clientName?: string;
  amount?: number;
  total?: number;
  price?: number;
  status?: string;
  deliveryStatus?: string;
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
