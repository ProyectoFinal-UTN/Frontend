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
