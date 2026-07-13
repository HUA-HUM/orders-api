export interface MegatoneOrderStatusResponse {
  IdEstado: number | null;
  Descripcion: string | null;
  Fecha: string | null;
}

export interface MegatoneOrderCustomerResponse {
  Nombre: string | null;
  Apellido: string | null;
  TipoDocumento?: string | null;
  Documento?: string | number | null;
  NumeroCuit?: string | null;
  Email?: string | null;
  Telefono?: string | null;
  Calle?: string | null;
  Numero?: string | number | null;
  Piso?: string | null;
  Localidad?: string | null;
  Provincia?: string | null;
  CodigoPostal?: string | number | null;
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
