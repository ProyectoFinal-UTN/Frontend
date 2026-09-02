import { apiFetch } from "./api";

/**
 * Catálogo de productos.
 *
 * Única puerta a la API para las pantallas de productos. Ninguna página llama
 * a `fetch` directo; todo pasa por acá y de ahí a `api.js`.
 *
 * El backend filtra siempre por el `comercio_id` de la sesión, así que ninguna
 * de estas funciones necesita —ni debe— mandarlo. Tampoco manda `ubicacionId`:
 * HU-9 no pide elegir ubicación en el alta, y el backend resuelve la primera
 * del comercio o crea una "Principal" si todavía no hay ninguna.
 */

/**
 * Unidades que acepta el backend. Si cambian allá (`UNIDADES_VALIDAS` en
 * `productos.service.js`), hay que cambiarlas acá.
 */
export const UNIDADES_MEDIDA = [
  "unidad",
  "kg",
  "g",
  "l",
  "ml",
  "caja",
  "paquete",
  "docena",
];

/** Productos activos del comercio, ordenados por nombre. */
export function obtenerProductos() {
  return apiFetch("/productos");
}

/**
 * Da de alta un producto con su stock inicial.
 *
 * `umbralMinimo` y `stockActual` tienen que viajar como números: el backend
 * chequea `typeof valor === "number"` y rechaza los strings, así que mandar
 * el `value` crudo de un `<input type="number">` vuelve con un 400.
 *
 * Responde 409 si el código de barras ya lo usa otro producto activo.
 */
export function crearProducto(datos) {
  return apiFetch("/productos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

/**
 * Edita un producto existente. Responde 404 si no existe o ya fue borrado, y
 * 409 si el código de barras nuevo ya lo usa otro producto activo.
 *
 * No acepta `stockActual`: cambiar cantidades es responsabilidad del registro
 * de movimientos (HU-13), no de editar la ficha.
 */
export function editarProducto(id, datos) {
  return apiFetch(`/productos/${id}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

/**
 * Baja lógica: el producto deja de aparecer en el catálogo pero su historial
 * de movimientos se conserva.
 *
 * Es idempotente por diseño del backend (responde 204 aunque el producto ya
 * estuviera inactivo), así que no hay un 404 que manejar acá.
 */
export function eliminarProducto(id) {
  return apiFetch(`/productos/${id}`, { method: "DELETE" });
}

/**
 * Consulta un código de barras contra el catálogo del comercio (HU-9/HU-10:
 * `GET /api/productos/codigo/:codigoBarras`, en Backend desde HU-9).
 *
 * Responde siempre 200: `{ existe: true, producto }` si ya está cargado, o
 * `{ existe: false, sugerencia }` si es nuevo — la sugerencia (nombre/
 * categoría de Open Food Facts, o null) la arma el propio backend, no hace
 * falta pedirla aparte desde acá.
 */
export async function verificarCodigoBarras(codigo) {
  return apiFetch(`/productos/codigo/${codigo}`);
}
