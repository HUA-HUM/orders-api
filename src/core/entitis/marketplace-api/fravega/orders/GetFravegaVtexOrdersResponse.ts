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

export interface FravegaVtexClientProfileData {
  firstName?: string;
  lastName?: string;
  documentType?: string;
  document?: string;
  phone?: string;
  email?: string;
  corporateDocument?: string;
}

export interface FravegaVtexItem {
  id?: string;
  productId?: string;
  refId?: string;
  sellerSku?: string;
  ean?: string | null;
  name?: string;
  quantity?: number;
}

export interface FravegaVtexShippingAddress {
  receiverName?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  street?: string;
  number?: string | number;
  neighborhood?: string;
  complement?: string;
}

export interface FravegaVtexOrderResponse {
  orderId?: string;
  marketplaceOrderId?: string;
  sequence?: string;
  status?: string;
  statusDescription?: string;
  creationDate?: string;
  clientProfileData?: FravegaVtexClientProfileData;
  items?: FravegaVtexItem[];
  shippingData?: {
    address?: FravegaVtexShippingAddress;
  };
  [key: string]: unknown;
}
