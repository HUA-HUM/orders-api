export interface MegatoneOrderStatusResponse {
  IdEstado: number | null;
  Descripcion: string | null;
  Fecha: string | null;
}

export interface MegatoneOrderCustomerResponse {
  Nombre: string | null;
  Apellido: string | null;
}

export interface GetMegatoneOrdersResponse {
  IdOrden?: number | string;
  Fecha?: string;
  MontoVenta?: number;
  Cliente?: MegatoneOrderCustomerResponse;
  Estado?: MegatoneOrderStatusResponse[];
  Productos?: unknown[];
  [key: string]: unknown;
}
