export type TipoPropiedad =
  | "casa"
  | "departamento"
  | "duplex"
  | "terreno"
  | "local"
  | "oficina"
  | "deposito"
  | "otro";

export type OperacionPropiedad = "alquiler" | "venta" | "alquiler_temporario";

export type EstadoPropiedad =
  | "disponible"
  | "reservada"
  | "alquilada"
  | "vendida"
  | "inactiva";

export type MonedaPropiedad = "PYG" | "USD";

export interface Propiedad {
  id: string;
  empresa_id: string;
  codigo: string | null;
  titulo: string;
  descripcion: string | null;
  tipo: TipoPropiedad | string;
  operacion: OperacionPropiedad | string;
  estado: EstadoPropiedad | string;
  ciudad: string | null;
  barrio: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  precio: number | null;
  moneda: MonedaPropiedad | string;
  dormitorios: number | null;
  banos: number | null;
  cocheras: number | null;
  superficie_m2: number | null;
  terreno_m2: number | null;
  destacada: boolean;
  visible_web: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type NuevaPropiedadInput = Omit<
  Propiedad,
  "id" | "empresa_id" | "created_at" | "updated_at"
>;

export type ActualizarPropiedadInput = Partial<NuevaPropiedadInput>;
