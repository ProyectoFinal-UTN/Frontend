import { apiFetch } from "./api";
import { finDelDia, inicioDelDia } from "./movimientos";

/**
 * Directorio de proveedores (HU-19).
 *
 * Única puerta a la API para la pantalla de proveedores. El backend filtra
 * siempre por el `comercio_id` de la sesión, así que ninguna de estas
 * funciones lo manda.
 */

/** Proveedores activos del comercio, ordenados por nombre. */
export function obtenerProveedores() {
  return apiFetch("/proveedores");
}

/**
 * Da de alta un proveedor. Solo el nombre es obligatorio; los opcionales
 * vacíos el backend los guarda como null.
 *
 * Responde 409 si ya hay un proveedor activo con ese nombre (sin distinguir
 * mayúsculas).
 */
export function crearProveedor(datos) {
  return apiFetch("/proveedores", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

/**
 * Edita un proveedor. Un opcional mandado vacío se borra. Responde 404 si ya
 * no existe y 409 si el nombre nuevo lo usa otro proveedor.
 */
export function editarProveedor(id, datos) {
  return apiFetch(`/proveedores/${id}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

/**
 * Baja lógica: deja de aparecer en la lista, pero las compras que ya tenía
 * registradas lo siguen referenciando en el historial.
 *
 * Idempotente en el backend (204 aunque ya estuviera dado de baja), así que no
 * hay un 404 que manejar.
 */
export function eliminarProveedor(id) {
  return apiFetch(`/proveedores/${id}`, { method: "DELETE" });
}

/*
 * Asociación de productos a proveedores (HU-20). El vínculo es uno solo y se
 * escribe siempre del lado del producto (`/productos/:id/proveedores`); del
 * lado del proveedor solo se consulta.
 */

/** Proveedores activos de un producto, por nombre. 404 si el producto ya no existe. */
export function obtenerProveedoresDeProducto(productoId) {
  return apiFetch(`/productos/${productoId}/proveedores`);
}

/** Productos activos de un proveedor, por nombre. 404 si el proveedor ya no existe. */
export function obtenerProductosDeProveedor(proveedorId) {
  return apiFetch(`/proveedores/${proveedorId}/productos`);
}

/**
 * Historial de compras a un proveedor (HU-21): qué se le compró, cuándo y
 * cuánto, paginado y opcionalmente acotado a un período.
 *
 * `desde` y `hasta` se reciben como días (`YYYY-MM-DD`, lo que entrega un
 * `<input type="date">`) y viajan como el primer y el último instante de esos
 * días en la hora local. El endpoint rechaza con 400 cualquier fecha sin zona,
 * así que la conversión la hace el cliente; es la misma que usa el historial de
 * movimientos y se importa de ahí en vez de repetirla.
 *
 * No se manda `limite`: el default de 50 del backend alcanza y la pantalla no
 * ofrece cambiarlo. Ojo si alguna vez se agrega ese control: un `limite` mayor
 * a 200 se recorta **en silencio**, así que para mostrar "N de M" hay que leer
 * `paginacion.limite` de la respuesta y nunca el valor que se pidió.
 *
 * El endpoint tampoco acepta `tipo` (es fijo "compra"), `productoId` ni
 * `ubicacionId`.
 *
 * @returns `{ proveedor, compras, resumen, paginacion }`.
 *   - `proveedor` trae `nombre` y `activo`. Es la fuente del título: este
 *     historial responde también para un proveedor dado de baja, al que
 *     `GET /proveedores/:id` le contesta 404.
 *   - `compras` tiene la `cantidad` siempre positiva (son entradas), sin
 *     usuario y sin `proveedorId`, a diferencia del historial de HU-14.
 *   - `resumen` es de **todo el período filtrado**, no de la página, y su
 *     `montos` viene siempre null: el libro de movimientos no guarda precios.
 *   - Una `pagina` más allá del total responde 200 con `compras: []`, no 404.
 *     Sin compras en el período, `total` y `totalPaginas` son 0 (no 1).
 *
 * Errores: 400 con un mensaje mostrable si el filtro es inválido —corta antes
 * de buscar el proveedor, así que un id inexistente con una fecha rota da 400 y
 * no 404—, y 404 "El proveedor no existe" tanto si no existe como si es de otro
 * comercio o el id está mal formado. Los tres casos son indistinguibles a
 * propósito.
 */
export function obtenerHistorialDeCompras(
  proveedorId,
  { desde, hasta, pagina } = {},
) {
  const parametros = new URLSearchParams();

  const valores = {
    desde: inicioDelDia(desde),
    hasta: finDelDia(hasta),
    pagina: pagina > 1 ? String(pagina) : undefined,
  };

  for (const [clave, valor] of Object.entries(valores)) {
    if (valor) parametros.set(clave, valor);
  }

  const consulta = parametros.toString();

  return apiFetch(
    `/proveedores/${proveedorId}/historial-compras${consulta ? `?${consulta}` : ""}`,
  );
}

/**
 * Asocia un proveedor a un producto. 409 si ya estaban asociados; 404 si
 * alguno de los dos ya no existe.
 */
export function asociarProveedor(productoId, proveedorId) {
  return apiFetch(`/productos/${productoId}/proveedores`, {
    method: "POST",
    body: JSON.stringify({ proveedorId }),
  });
}

/** Quita el vínculo. Idempotente: no hay un 404 que manejar. */
export function desasociarProveedor(productoId, proveedorId) {
  return apiFetch(`/productos/${productoId}/proveedores/${proveedorId}`, {
    method: "DELETE",
  });
}
