import { clasificar } from "./errores";

const BASE_URL = "/api";

/**
 * Única función que habla con el backend.
 *
 * Todo service pasa por acá y ninguna página llama a `fetch` directo. Así, si
 * cambia la forma de llegar al backend, se toca un solo lugar.
 *
 * La URL es siempre relativa: en desarrollo el proxy de Vite manda `/api/...`
 * a localhost:4000, y en producción apunta al backend en Render. Nunca
 * hardcodear el host.
 */
export async function apiFetch(endpoint, options = {}) {
  // Un `FormData` (la importación de catálogo de HU-7) tiene que viajar como
  // `multipart/form-data; boundary=...`, y ese boundary lo genera el navegador:
  // es la marca aleatoria que separa las partes del cuerpo. Si le imponemos un
  // Content-Type —el `application/json` de acá abajo, o incluso un
  // "multipart/form-data" escrito a mano— el header sale sin boundary, el
  // servidor no encuentra dónde empieza el archivo y la request llega como si
  // no se hubiera mandado nada. La única forma de que lo ponga bien es no
  // mandarlo: `fetch` lo completa solo cuando el body es FormData.
  const esFormData = options.body instanceof FormData;

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    // Sin esto la cookie de sesión no viaja cuando el front y el back están en
    // dominios distintos, que es exactamente lo que pasa en producción
    // (Vercel + Render). En desarrollo el proxy de Vite lo disimula.
    credentials: "include",
    // Va después del spread a propósito: si fuera antes, un `options.headers`
    // reemplazaría el objeto entero y se perdería el Content-Type.
    headers: {
      ...(esFormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  // 204 y 205 no traen cuerpo; intentar parsearlos tira SyntaxError.
  const sinCuerpo = response.status === 204 || response.status === 205;
  const datos = sinCuerpo ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw errorDeRespuesta(response, datos);
  }

  return datos;
}

/**
 * Como `apiFetch`, pero para cuando el backend responde un ARCHIVO (el PDF de
 * HU-25) en vez de JSON.
 *
 * `apiFetch` no sirve para eso: lee siempre el cuerpo con `response.json()`, y
 * un PDF no es JSON, así que devolvería `null`. Acá el cuerpo se lee como
 * `blob` —el archivo crudo, en memoria— y se devuelve junto con el nombre que
 * propone el backend en `Content-Disposition`.
 *
 * Los errores, en cambio, siguen viniendo como JSON `{ error }`: si la
 * respuesta no es ok se lee así y se lanza exactamente el mismo error que
 * lanzaría `apiFetch` (mensaje del backend, `status` y `tipo`).
 *
 * @returns {Promise<{ blob: Blob, nombreArchivo: string|null }>} `nombreArchivo`
 *   es `null` si el backend no lo mandó; elegir uno por defecto es cosa de
 *   cada service, que sabe qué está descargando.
 */
export async function apiDescargar(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    // Igual que en `apiFetch`: sin esto la cookie de sesión no viaja en
    // producción. Por eso un link directo al endpoint no sirve para descargar.
    credentials: "include",
  });

  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    throw errorDeRespuesta(response, datos);
  }

  return {
    blob: await response.blob(),
    nombreArchivo: nombreDeContentDisposition(
      response.headers?.get?.("Content-Disposition"),
    ),
  };
}

/**
 * El error que se lanza ante una respuesta no-ok, igual para JSON y archivos.
 *
 * El backend responde `{ error: "..." }` con un mensaje pensado para
 * mostrarle a un comerciante. Se propaga ese, no un código pelado.
 */
function errorDeRespuesta(response, datos) {
  const error = new Error(
    datos?.error || `No se pudo completar la operación (${response.status})`,
  );
  error.status = response.status;
  // Qué clase de fallo es, decidido en un solo lugar (HU-32). Acá se
  // clasifica y nada más: `api.js` no navega ni cierra sesión, porque un
  // service que conozca React Router rompe la regla de capas del repo.
  error.tipo = clasificar(error);
  return error;
}

/**
 * `attachment; filename="reporte.pdf"` → `"reporte.pdf"`, o `null`.
 *
 * Acepta también la forma `filename*=UTF-8''...` (la que se usa para nombres
 * con tildes) y le da prioridad, porque es la más precisa de las dos.
 */
export function nombreDeContentDisposition(encabezado) {
  if (!encabezado) return null;

  const extendido = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(encabezado);
  if (extendido) {
    try {
      return decodeURIComponent(extendido[2].trim().replace(/^"|"$/g, ""));
    } catch {
      // Mal codificado: se prueba con la forma simple.
    }
  }

  const simple = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(encabezado);
  const nombre = (simple?.[2] ?? simple?.[1])?.trim();
  return nombre || null;
}
