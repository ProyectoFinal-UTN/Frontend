import { apiFetch } from "./api";

/**
 * Derechos sobre los datos personales (HU-31, Ley 25.326).
 *
 * La ley reconoce el derecho de acceso —saber qué guarda el sistema de uno— y
 * el de supresión —pedir que se borre—. Acá está la puerta a los dos endpoints
 * que los implementan.
 */

/** Todo lo que el sistema guarda de quien está usando la app. */
export function obtenerMisDatos() {
  return apiFetch("/mis-datos");
}

/** Da de baja la propia cuenta. No se puede deshacer. */
export function darDeBajaCuenta() {
  return apiFetch("/mi-cuenta", { method: "DELETE" });
}

/**
 * Descarga los datos como archivo, sin pasar por el navegador dos veces.
 *
 * El backend manda un `Content-Disposition: attachment`, así que la tentación
 * es mandar al navegador directo a `/api/mis-datos` con un link. No sirve: en
 * producción el front y el back están en dominios distintos (Vercel + Render)
 * y una navegación de arriba no lleva la cookie de sesión, con lo cual el
 * archivo vendría vacío con un 401. Por eso se pide con `fetch` —que sí manda
 * la cookie, ver `api.js`— y el archivo se arma acá.
 *
 * El JSON se guarda indentado: el derecho de acceso no se cumple entregando
 * algo que la persona no puede leer.
 */
export function descargarMisDatos(datos) {
  const archivo = new Blob([JSON.stringify(datos, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = "mis-datos.json";
  document.body.appendChild(enlace);
  enlace.click();

  // Sin esto el blob queda retenido en memoria hasta que se recargue la página.
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
