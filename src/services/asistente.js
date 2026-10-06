import { apiFetch } from "./api";

/**
 * Asistente Inteligente: consulta en lenguaje natural (HU-26).
 *
 * Única puerta a la API del asistente. Ningún componente llama a `fetch`
 * directo: todo pasa por acá y de ahí a `api.js`.
 *
 * El comercio sobre el que se pregunta no se manda: lo decide el backend a
 * partir de la sesión. Desde acá solo viaja el texto de la pregunta.
 */

/**
 * Largo máximo de una pregunta. Es el mismo límite que valida el backend
 * (`PREGUNTA_MAXIMA` en `asistente.service.js`): si cambia allá, hay que
 * cambiarlo acá.
 */
export const PREGUNTA_MAXIMA = 500;

/**
 * Cómo se armó una respuesta.
 *
 * - `IA`: la redactó el modelo de lenguaje consultando los datos del comercio.
 * - `LIMITADO`: el modelo no estaba disponible y se respondió por reglas
 *   (HU-28). No es un error —el status es 200— pero hay que avisarle a quien
 *   pregunta que la respuesta es más pobre, que es un criterio de aceptación.
 */
export const MODO = Object.freeze({ IA: "ia", LIMITADO: "limitado" });

/**
 * Le hace una pregunta al asistente.
 *
 * Devuelve `{ respuesta, modo, herramientasUsadas }`. Cada llamada puede
 * gastar crédito del proveedor del modelo, que es compartido por todo el
 * equipo: quien la use tiene que evitar llamarla dos veces por la misma
 * pregunta.
 */
export function consultarAsistente(pregunta) {
  return apiFetch("/asistente/consultas", {
    method: "POST",
    body: JSON.stringify({ pregunta }),
  });
}
