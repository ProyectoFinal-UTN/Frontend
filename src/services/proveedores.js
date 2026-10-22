import { apiFetch } from "./api";

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
