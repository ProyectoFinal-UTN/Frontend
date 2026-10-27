import { apiFetch } from "./api";

/**
 * Notificaciones push de reposición (HU-18): las llamadas a la API.
 *
 * Acá solo se habla con el backend. Lo que es del navegador —permiso, service
 * worker, `pushManager`— vive en `pushNavegador.js`, que usa estas funciones.
 *
 * Las tres rutas piden sesión y `alerta:read`. El backend asocia la
 * suscripción al usuario y al comercio de la sesión, así que no se manda
 * ninguno de los dos.
 */

/**
 * La clave pública VAPID del servidor, en base64url.
 *
 * Responde 503 cuando el servidor no tiene las claves configuradas: push está
 * apagado allá, no es un error de quien usa la app.
 *
 * @returns {Promise<{clavePublica: string}>}
 */
export function obtenerClavePublica() {
  return apiFetch("/push/clave-publica");
}

/**
 * Guarda la suscripción de este navegador.
 *
 * Es un upsert por endpoint: reenviar la misma no la duplica, y si estaba a
 * nombre de otro usuario pasa al de la sesión. Por eso se puede llamar cada
 * vez que alguien entra, sin preguntar antes si ya estaba.
 *
 * @param {object} suscripcion `PushSubscription.toJSON()`, tal cual.
 */
export function guardarSuscripcion(suscripcion) {
  return apiFetch("/push/suscripciones", {
    method: "POST",
    body: JSON.stringify(suscripcion),
  });
}

/**
 * Borra la suscripción de este navegador en el backend.
 *
 * DELETE con body: el endpoint es una URL larga y no entra cómodo en la ruta.
 * Responde 204 también si no existía, así que es seguro llamarla de más.
 */
export function eliminarSuscripcion(endpoint) {
  return apiFetch("/push/suscripciones", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}
