import {
  eliminarSuscripcion,
  guardarSuscripcion,
  obtenerClavePublica,
} from "./push";

/**
 * Notificaciones push de reposición (HU-18): la parte del navegador.
 *
 * Cómo viaja un aviso: el navegador le pide a su servicio de push (el de
 * Google, Mozilla o Apple, según cuál sea) una "suscripción", que es una URL
 * única para este dispositivo más un par de claves. Esa suscripción se guarda
 * en nuestro backend. Cuando un producto llega al umbral, el backend le manda
 * el aviso a esa URL, el servicio de push lo entrega al dispositivo, y el
 * service worker (`public/sw.js`) lo muestra aunque la app esté cerrada.
 *
 * La suscripción es del NAVEGADOR, no de la persona: por eso al cerrar sesión
 * se borra, para que quien entre después en el mismo dispositivo no reciba los
 * avisos del anterior.
 *
 * Nada de esto decide CUÁNDO avisar: eso lo resuelve el backend al registrar
 * un movimiento. Acá solo se suscribe el dispositivo.
 */

export const ESTADO = Object.freeze({
  /** Este navegador no tiene push (o es muy viejo). */
  SIN_SOPORTE: "sin-soporte",
  /** iPhone o iPad abriendo la app en Safari: push exige instalarla. */
  IOS_SIN_INSTALAR: "ios-sin-instalar",
  /** El servidor no tiene las claves VAPID: push está apagado allá (503). */
  SERVIDOR_APAGADO: "servidor-apagado",
  /** La persona bloqueó el permiso. El navegador no deja volver a preguntar. */
  DENEGADO: "denegado",
  /** Cerró el cartel del permiso sin elegir. Se puede volver a preguntar. */
  SIN_RESPUESTA: "sin-respuesta",
  INACTIVO: "inactivo",
  ACTIVO: "activo",
});

/**
 * Va en la raíz a propósito: un service worker solo controla las páginas que
 * están por debajo de su carpeta, y la app entera cuelga de `/`.
 */
const RUTA_SERVICE_WORKER = "/sw.js";

/** El mensaje que manda `sw.js` cuando tocan un aviso con la app abierta. */
const MENSAJE_ABRIR = "abrir-ruta";

const ERROR_DEL_NAVEGADOR =
  "Este navegador no pudo activar las notificaciones. Probá de nuevo en un rato.";

function esIos() {
  const agente = navigator.userAgent ?? "";
  // Desde iPadOS 13 el iPad se presenta como una Mac: lo delata la pantalla
  // táctil, que ninguna Mac tiene.
  return (
    /iPhone|iPad|iPod/.test(agente) ||
    (/Macintosh/.test(agente) && navigator.maxTouchPoints > 1)
  );
}

/** Si se abrió desde el ícono de la pantalla de inicio y no desde el navegador. */
function estaInstalada() {
  return (
    navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

export function tieneSoporte() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Por qué no se puede usar push en este navegador, o `null` si se puede.
 *
 * Safari en iPhone no expone `PushManager` en una pestaña común: solo en la
 * app agregada a la pantalla de inicio, con iOS 16.4 o superior. Si está
 * instalada y aun así no lo tiene, es un iOS anterior, y cae en SIN_SOPORTE.
 */
function motivoSinSoporte() {
  if (tieneSoporte()) return null;
  if (esIos() && !estaInstalada()) return ESTADO.IOS_SIN_INSTALAR;
  return ESTADO.SIN_SOPORTE;
}

/**
 * La clave pública VAPID llega en base64url (un texto), y `subscribe()` la
 * quiere en bytes.
 */
export function claveABytes(base64url) {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (letra) => letra.charCodeAt(0));
}

/** Si la suscripción se hizo con esta clave. Si no se puede saber, se asume que sí. */
function usaLaClave(suscripcion, clave) {
  const actual = suscripcion.options?.applicationServerKey;
  if (!actual) return true;

  const bytes = new Uint8Array(actual);
  return (
    bytes.length === clave.length && bytes.every((byte, i) => byte === clave[i])
  );
}

/**
 * Registra el service worker. Se llama una vez, al cargar la app.
 *
 * Registrarlo no le pide nada a nadie: el único paso que necesita un toque de
 * la persona es pedir el permiso, y eso pasa recién en `activar`. Si falla
 * (un certificado no confiable, por ejemplo) la app sigue funcionando igual,
 * solo que sin avisos.
 */
export async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.register(RUTA_SERVICE_WORKER);
  } catch {
    return null;
  }
}

async function suscripcionActual() {
  const registro = await navigator.serviceWorker.getRegistration();
  return (await registro?.pushManager?.getSubscription()) ?? null;
}

/**
 * Suscribe este navegador con la clave del servidor.
 *
 * Si ya había una suscripción hecha con otra clave (las regeneraron en el
 * servidor), el navegador no deja crear otra encima: hay que soltar la vieja.
 */
async function suscribirNavegador(clave) {
  try {
    // `register` devuelve el registro existente si ya estaba, y `ready` espera
    // a que esté activo: suscribirse con uno a medio instalar falla.
    await navigator.serviceWorker.register(RUTA_SERVICE_WORKER);
    const registro = await navigator.serviceWorker.ready;

    const existente = await registro.pushManager.getSubscription();
    if (existente && usaLaClave(existente, clave)) return existente;
    if (existente) await existente.unsubscribe();

    return await registro.pushManager.subscribe({
      // Obligatorio en Chrome: cada aviso tiene que mostrarse. Push "silencioso"
      // no está permitido.
      userVisibleOnly: true,
      applicationServerKey: clave,
    });
  } catch (causa) {
    // El navegador tira errores en inglés y con jerga ("AbortError: Registration
    // failed - push service error"). No le dicen nada a un comerciante.
    throw new Error(ERROR_DEL_NAVEGADOR, { cause: causa });
  }
}

/**
 * En qué estado está push en este navegador, para dibujar el interruptor.
 *
 * Pregunta también al servidor, para mostrar el interruptor deshabilitado si
 * push está apagado allá en vez de dejar que alguien lo active y falle. Otros
 * errores de esa consulta no se muestran acá: aparecen si de verdad intentan
 * activarlo.
 */
export async function leerEstado() {
  const motivo = motivoSinSoporte();
  if (motivo) return motivo;

  try {
    await obtenerClavePublica();
  } catch (fallo) {
    if (fallo?.status === 503) return ESTADO.SERVIDOR_APAGADO;
  }

  if (Notification.permission === "denied") return ESTADO.DENEGADO;
  if (Notification.permission !== "granted") return ESTADO.INACTIVO;

  return (await suscripcionActual()) ? ESTADO.ACTIVO : ESTADO.INACTIVO;
}

/**
 * Activa los avisos en este navegador. Se llama SOLO desde un toque.
 *
 * El orden importa: el permiso se pide antes de cualquier llamada al backend.
 * Safari solo muestra el cartel si el pedido sale "directo" del toque; si antes
 * se espera una respuesta de la red, para Safari el toque ya pasó y rechaza el
 * pedido sin preguntar nada.
 *
 * Los errores de la API (403, 503…) se propagan tal como vienen de `apiFetch`,
 * para que la pantalla decida qué mostrar.
 *
 * @returns {Promise<string>} El estado en que quedó, uno de `ESTADO`.
 */
export async function activar() {
  const motivo = motivoSinSoporte();
  if (motivo) return motivo;

  const permiso = await Notification.requestPermission();
  if (permiso === "denied") return ESTADO.DENEGADO;
  if (permiso !== "granted") return ESTADO.SIN_RESPUESTA;

  const { clavePublica } = await obtenerClavePublica();
  const suscripcion = await suscribirNavegador(claveABytes(clavePublica));

  try {
    await guardarSuscripcion(suscripcion.toJSON());
  } catch (fallo) {
    // Si el backend no la guardó, no va a llegar ningún aviso. Se suelta la del
    // navegador para que el interruptor no quede diciendo "activado" en falso.
    await suscripcion.unsubscribe().catch(() => {});
    throw fallo;
  }

  return ESTADO.ACTIVO;
}

/**
 * Silencia los avisos en este navegador.
 *
 * Lo que de verdad corta los avisos es `unsubscribe()`: después de eso, el
 * servicio de push rechaza todo lo que le manden a esa URL. Por eso, si el
 * DELETE del backend falla, se desuscribe igual: la fila que queda allá se
 * borra sola la próxima vez que el backend intente avisar y reciba ese rechazo.
 *
 * @returns {Promise<string>} Siempre `ESTADO.INACTIVO`.
 */
export async function desactivar() {
  if (!tieneSoporte()) return ESTADO.INACTIVO;

  const suscripcion = await suscripcionActual();
  if (!suscripcion) return ESTADO.INACTIVO;

  try {
    await eliminarSuscripcion(suscripcion.endpoint);
  } catch {
    // Ver arriba: no frena la desuscripción.
  }

  await suscripcion.unsubscribe();
  return ESTADO.INACTIVO;
}

/**
 * Lo mismo que `desactivar`, pero sin fallar nunca: es para el logout y la baja
 * de cuenta, que tienen que seguir aunque esto no salga.
 *
 * En el logout se llama ANTES de cerrar la sesión, porque el DELETE la
 * necesita viva. En la baja la sesión ya no existe y el DELETE falla, pero no
 * importa: el backend borra las suscripciones junto con el usuario.
 */
export async function desuscribirAlSalir() {
  try {
    await desactivar();
  } catch {
    // Que no salga no puede trabar la salida.
  }
}

/**
 * Reenvía al backend la suscripción de este navegador, si hay una y el permiso
 * sigue dado. Se llama al entrar con sesión, sin preguntar nada: el upsert del
 * backend la reasigna a quien está ahora y la mantiene al día.
 *
 * @returns {Promise<boolean>} Si había algo para reenviar.
 */
export async function sincronizar() {
  if (!tieneSoporte() || Notification.permission !== "granted") return false;

  const suscripcion = await suscripcionActual();
  if (!suscripcion) return false;

  await guardarSuscripcion(suscripcion.toJSON());
  return true;
}

/**
 * Escucha cuando tocan un aviso con la app ya abierta.
 *
 * En ese caso `sw.js` enfoca la pestaña y le pide navegar a la pantalla del
 * producto. Se navega con React Router y no recargando, así no se pierde lo
 * que había en pantalla (la conversación del asistente, por ejemplo).
 *
 * @param {(ruta: string) => void} alAbrir
 * @returns {() => void} Para dejar de escuchar.
 */
export function escucharAperturas(alAbrir) {
  if (!("serviceWorker" in navigator)) return () => {};

  function oyente(evento) {
    const { tipo, ruta } = evento.data ?? {};

    // Solo rutas propias: "/productos/…", nunca "//otro-sitio.com".
    if (
      tipo === MENSAJE_ABRIR &&
      typeof ruta === "string" &&
      ruta.startsWith("/") &&
      !ruta.startsWith("//")
    ) {
      alAbrir(ruta);
    }
  }

  navigator.serviceWorker.addEventListener("message", oyente);
  return () => navigator.serviceWorker.removeEventListener("message", oyente);
}
