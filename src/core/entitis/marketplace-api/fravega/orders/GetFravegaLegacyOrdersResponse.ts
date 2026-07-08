export interface FravegaLegacyOrderListItem {
  suborderId?: string;
  cuil?: string;
}

export interface GetFravegaLegacyOrdersResponse {
  items: FravegaLegacyOrderListItem[];
  currentPage?: number;
  pageSize?: number;
  pages?: number;
  total?: number;
}
