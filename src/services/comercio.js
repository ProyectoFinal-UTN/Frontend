import { apiFetch } from "./api";

/**
 * Datos del negocio (HU-6).
 *
 * Única puerta a la API para la pestaña de perfil. Ninguna página llama a
 * `fetch` directo; todo pasa por acá y de ahí a `api.js`.
 *
 * El backend filtra siempre por el `comercio_id` de la sesión, así que ninguna
 * de estas funciones necesita —ni debe— mandarlo.
 */

export function obtenerPerfil() {
  return apiFetch("/comercio");
}

/**
 * Guarda el perfil. Solo el propietario puede; a otro rol el backend le
 * responde 403.
 */
export function guardarPerfil(perfil) {
  return apiFetch("/comercio", {
    method: "PUT",
    body: JSON.stringify(perfil),
  });
}
