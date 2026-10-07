/**
 * Qué clase de fallo devolvió la API (HU-32).
 *
 * El backend tiene cuatro respuestas de "no podés hacer esto" y significan
 * cosas distintas: una pide volver a entrar, otra avisa que al rol no le toca,
 * y dos son problemas de la cuenta. Acá se decide cuál es cuál, una sola vez,
 * para que ninguna pantalla vuelva a comparar el texto del mensaje a mano.
 *
 * Es clasificación, no presentación: qué se muestra para cada tipo lo decide
 * `AvisoDeError`.
 */

export const TIPO = Object.freeze({
  /** 401: la sesión no sirve. Único caso en que corresponde ir al login. */
  SESION: "sesion",
  /** 403 por permisos: el rol no alcanza para esta acción. NO desloguear. */
  PERMISO: "permiso",
  /** 403 de cuenta: la persona no está asociada a ningún comercio. */
  SIN_COMERCIO: "sin-comercio",
  /** 403 de cuenta: el rol guardado no es ninguno de los tres válidos. */
  ROL_INVALIDO: "rol-invalido",
  /** Todo lo demás: red, 4xx de negocio, 5xx. */
  GENERAL: "general",
});

/**
 * Los mensajes exactos del backend, tal como los escribe
 * `Backend/src/middlewares/auth.middleware.js`. Son la única copia en este
 * repo: si allá cambia un texto, se cambia acá y en ningún otro lado.
 */
const POR_MENSAJE = new Map([
  ["No hay sesion activa", TIPO.SESION],
  ["El rol no tiene permiso para esta accion", TIPO.PERMISO],
  ["El usuario no tiene un comercio asociado", TIPO.SIN_COMERCIO],
  ["El rol del usuario no es valido", TIPO.ROL_INVALIDO],
]);

/**
 * El tipo de un fallo de `apiFetch`.
 *
 * El status manda sobre el mensaje: un 403 nunca se clasifica como sesión
 * vencida, aunque el texto no se reconozca. Si la UI desloguea por un 403, el
 * login funciona, la acción vuelve a fallar con 403, y la persona queda en un
 * loop del que no puede salir. Por eso el 403 desconocido cae en PERMISO y no
 * en SESION: el backend mismo lo explica en `requirePermission`.
 */
export function clasificar(fallo) {
  const status = fallo?.status;

  if (status !== 401 && status !== 403) {
    return TIPO.GENERAL;
  }

  const conocido = POR_MENSAJE.get(fallo?.message);

  // Un mensaje conocido con el status que no le corresponde (un 401 con el
  // texto de permisos, por ejemplo) no se le cree al texto: manda el status.
  if (conocido && esCoherente(conocido, status)) {
    return conocido;
  }

  return status === 401 ? TIPO.SESION : TIPO.PERMISO;
}

function esCoherente(tipo, status) {
  return tipo === TIPO.SESION ? status === 401 : status === 403;
}

/** Si conviene releer los permisos: se los pudieron haber cambiado recién. */
export function pideRevisarPermisos(tipo) {
  return tipo === TIPO.PERMISO;
}

/**
 * Los dos 403 que no son de permisos son problemas de la cuenta, no del rol, y
 * el mensaje del backend no le dice a nadie qué hacer al respecto. Estos textos
 * sí. Viven acá y no dentro de `AvisoDeError` porque alguna pantalla con su
 * propio recuadro —Transferencias— los necesita sin montar el componente.
 */
const MENSAJE_DE_CUENTA = {
  [TIPO.SIN_COMERCIO]:
    "Tu cuenta no está asociada a ningún comercio. Pedile al propietario que " +
    "te vuelva a invitar.",
  [TIPO.ROL_INVALIDO]:
    "Tu cuenta quedó con un rol que el sistema no reconoce. Avisale al " +
    "propietario del comercio para que te lo vuelva a asignar.",
};

/** El texto a mostrar: el propio si es un problema de cuenta, si no el del backend. */
export function mensajeDe(tipo, mensajeDelBackend) {
  return MENSAJE_DE_CUENTA[tipo] ?? mensajeDelBackend;
}
