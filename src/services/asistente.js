import { apiFetch } from "./api";

/**
 * Asistente Inteligente: consultas (HU-26) y recomendaciones (HU-27).
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
 * Evento de `window` que abre el panel del asistente desde cualquier lado
 * (el banner de Inicio, por ejemplo).
 *
 * Un evento y no un estado compartido: el asistente está montado una sola vez
 * en `App`, fuera de las rutas, y quien lo quiere abrir no tiene por qué
 * conocerlo. Si el asistente no está montado —sin sesión, o un rol sin
 * permiso—, el evento simplemente no lo escucha nadie.
 */
export const EVENTO_ABRIR_ASISTENTE = "asistente:abrir";

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

/* ---------------------------------------------------------------------------
 * Recomendaciones proactivas (HU-27)
 * ------------------------------------------------------------------------- */

/**
 * Los tres tipos de recomendación que puede devolver el backend.
 *
 * La diferencia que importa al dibujar: `SIN_HISTORIAL` trae `producto` en
 * `null` —habla del comercio entero, no de un producto puntual— mientras que
 * los otros dos siempre lo traen. Por eso en toda la pantalla se escribe
 * `producto?.nombre`, nunca `producto.nombre`.
 */
export const TIPOS_DE_RECOMENDACION = Object.freeze({
  REPONER: "reponer",
  BAJA_ROTACION: "baja_rotacion",
  SIN_HISTORIAL: "sin_historial",
});

/** Para el badge de cada tarjeta. El backend ya ordena la lista por urgencia. */
export const PRIORIDADES = Object.freeze({
  ALTA: "alta",
  MEDIA: "media",
  BAJA: "baja",
});

/**
 * De dónde salió el `resumen` de `/asistente/recomendaciones`.
 *
 * Constante propia y NO una ampliación del `MODO` de HU-26: son dos endpoints
 * con dos enums distintos. `/consultas` tiene dos valores y nunca devuelve
 * `sin_novedades`; sumárselo a `MODO` dejaría a quien lee `Asistente.jsx`
 * preguntándose si un turno del chat puede venir así.
 *
 * - `IA`: lo redactó el modelo.
 * - `LIMITADO`: salió de plantilla porque el proveedor de IA no estuvo. **Las
 *   recomendaciones llegan completas igual**: lo único que se degrada es el
 *   párrafo de arriba.
 * - `SIN_NOVEDADES`: no había nada que recomendar, así que no se le preguntó al
 *   modelo. No es una degradación, es un comercio ordenado.
 */
export const MODO_DE_RESUMEN = Object.freeze({
  IA: "ia",
  LIMITADO: "limitado",
  SIN_NOVEDADES: "sin_novedades",
});

/**
 * Las recomendaciones proactivas del comercio.
 *
 * Devuelve `{ generadoEn, ventana: { dias, desde }, modo, resumen,
 * recomendaciones }`. `recomendaciones` ya viene **ordenada por urgencia**: se
 * renderiza en el orden en que llega, no se reordena acá.
 *
 * `dias` es opcional (1–90, 30 por defecto) y **no se valida de este lado**: un
 * valor fuera de rango o no numérico no da 400, el backend lo acota en silencio
 * porque es un parámetro de afinado de la pantalla y no un dato que escribió
 * una persona. Validarlo acá sería duplicar un límite que ya vive allá.
 *
 * El `resumen` está cacheado 10 minutos del lado del servidor y comparte cupo
 * de la pasarela de IA con HU-26/HU-28: dos llamadas seguidas devuelven el
 * mismo párrafo mientras no cambien las recomendaciones. Eso no es un bug y
 * **no se cachea nada de este lado**. Las recomendaciones sí se recalculan
 * siempre.
 */
export function obtenerRecomendaciones({ dias } = {}) {
  const parametros = new URLSearchParams();

  if (dias !== undefined && dias !== null && dias !== "") {
    parametros.set("dias", String(dias));
  }

  const consulta = parametros.toString();

  return apiFetch(`/asistente/recomendaciones${consulta ? `?${consulta}` : ""}`);
}

/**
 * Si corresponde avisar que el RESUMEN salió degradado.
 *
 * Una sola comparación, porque el backend separó los significados que antes
 * compartían valor: `limitado` significa exactamente "el proveedor de IA no
 * estuvo", y un comercio sin nada que recomendar viene como `sin_novedades`.
 * Antes los dos eran `limitado` y la pantalla tenía que deducir cuál era cuál
 * mirando `recomendaciones.length`.
 *
 * **No mira la lista a propósito.** Esta regla es sobre el párrafo de arriba;
 * si la sección está vacía o no lo decide `recomendaciones.length` en el
 * componente, y las dos preguntas se responden por separado para que ninguna
 * dependa de que la otra siga valiendo.
 *
 * Igualdad estricta y no una lista de "modos malos": un cuarto valor que
 * aparezca mañana cae en `false`, que es el default seguro —no inventar una
 * alarma por un valor que todavía no se entiende—.
 *
 * Ojo: es DISTINTA de la regla de HU-26/HU-28 en `/consultas`, donde el aviso
 * es sobre la respuesta que la persona pidió. Acá es sobre el resumen, con la
 * lista de recomendaciones intacta debajo.
 */
export function hayResumenDegradado({ modo } = {}) {
  return modo === MODO_DE_RESUMEN.LIMITADO;
}
