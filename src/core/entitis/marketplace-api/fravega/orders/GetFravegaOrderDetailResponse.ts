export interface FravegaOrderDetailResponse {
  suborderId?: string;
  billingInfo?: {
    billingPerson?: {
      email?: string;
    };
  };
  [key: string]: unknown;
}
