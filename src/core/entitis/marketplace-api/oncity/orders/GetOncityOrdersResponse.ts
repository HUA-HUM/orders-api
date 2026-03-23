export interface OncityOrderStatusResponse {
  IdEstado: number | null;
  Descripcion: string | null;
  Fecha: string | null;
}

export interface OncityOrderCustomerResponse {
  Nombre: string | null;
  Apellido: string | null;
}

export interface GetOncityOrdersResponse {
  IdOrden?: number | string;
  Fecha?: string;
  MontoVenta?: number;
  Cliente?: OncityOrderCustomerResponse;
  Estado?: OncityOrderStatusResponse[];
  Productos?: unknown[];
  [key: string]: unknown;
}
