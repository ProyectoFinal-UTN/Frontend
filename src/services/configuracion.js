import { apiFetch } from "./api";

/**
 * Configuración general del negocio (HU-8).
 *
 * Única puerta a la API para esta pantalla. Ninguna página llama a `fetch`
 * directo; todo pasa por acá y de ahí a `api.js`.
 *
 * El backend filtra siempre por el `comercio_id` de la sesión, así que ninguna
 * de estas funciones necesita —ni debe— mandarlo.
 */

/** Monedas que acepta el backend. Si cambian allá, hay que cambiarlas acá. */
export const MONEDAS = [
  { codigo: "ARS", nombre: "Peso argentino" },
  { codigo: "USD", nombre: "Dólar" },
  { codigo: "EUR", nombre: "Euro" },
  { codigo: "BRL", nombre: "Real" },
  { codigo: "CLP", nombre: "Peso chileno" },
  { codigo: "UYU", nombre: "Peso uruguayo" },
];

/**
 * Trae moneda y ubicaciones en una sola llamada, para que la pantalla cargue
 * con un solo pedido en vez de dos.
 */
export function obtenerConfiguracion() {
  return apiFetch("/configuracion");
}

export function cambiarMoneda(moneda) {
  return apiFetch("/configuracion/moneda", {
    method: "PUT",
    body: JSON.stringify({ moneda }),
  });
}

/**
 * Solo las ubicaciones, para las pantallas que necesitan elegir una y no el
 * resto de la configuración (el registro de movimientos de HU-13).
 *
 * El backend deja leer este endpoint a los tres roles, justamente porque
 * registrar un movimiento requiere elegir la ubicación.
 */
export function obtenerUbicaciones() {
  return apiFetch("/ubicaciones");
}

export function crearUbicacion(nombre) {
  return apiFetch("/ubicaciones", {
    method: "POST",
    body: JSON.stringify({ nombre }),
  });
}

export function renombrarUbicacion(id, nombre) {
  return apiFetch(`/ubicaciones/${id}`, {
    method: "PUT",
    body: JSON.stringify({ nombre }),
  });
}

export function eliminarUbicacion(id) {
  return apiFetch(`/ubicaciones/${id}`, { method: "DELETE" });
}
