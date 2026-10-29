export interface FravegaVtexOrderListItem {
  orderId: string;
  marketPlaceOrderId?: string;
  sequence?: string;
  creationDate?: string;
  clientName?: string;
  totalValue?: number;
  status?: string;
  statusDescription?: string;
  ShippingEstimatedDate?: string | null;
}

export interface GetFravegaVtexOrdersResponse {
  list: FravegaVtexOrderListItem[];
  paging?: {
    total?: number;
    pages?: number;
    currentPage?: number;
    perPage?: number;
  };
}
