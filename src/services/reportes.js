import { apiDescargar } from "./api";
import { finDelDia, inicioDelDia } from "./movimientos";

/**
 * Reportes de movimientos en PDF (HU-25).
 *
 * Única puerta a `GET /api/reportes/movimientos`. Ninguna pantalla llama a
 * `fetch` directo; todo pasa por acá y de ahí a `api.js`.
 *
 * El backend filtra por el `comercio_id` de la sesión y valida el permiso
 * `reporte:generar` (propietario y gerente), así que acá no se manda ninguno
 * de los dos.
 */

/**
 * Los tres tipos que acepta el backend, con la etiqueta del prototipo. Si
 * cambian allá, hay que cambiarlos acá.
 */
export const TIPOS_REPORTE = [
  { valor: "periodo", etiqueta: "Por período" },
  { valor: "producto", etiqueta: "Por producto" },
  { valor: "proveedor", etiqueta: "Por proveedor" },
];

/** Por si el backend no manda `Content-Disposition` (no debería pasar). */
export const NOMBRE_POR_DEFECTO = "reporte-movimientos.pdf";

/**
 * La zona horaria del navegador, en formato IANA ("America/Argentina/Cordoba").
 *
 * El backend la usa solo para mostrar las horas en el PDF y en el nombre del
 * archivo; qué movimientos entran lo deciden `desde` y `hasta`. Si el navegador
 * no la informa se omite y el backend usa la suya por defecto.
 */
function zonaDelNavegador() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Arma la query del reporte.
 *
 * `desde` y `hasta` llegan como días (`YYYY-MM-DD`, lo que da un
 * `<input type="date">`) y viajan como el primer y el último instante de esos
 * días en la hora local, así el rango incluye los dos extremos enteros.
 *
 * `productoId` viaja SOLO con `tipo=producto` y `proveedorId` SOLO con
 * `tipo=proveedor`: el backend responde 400 si llega uno con otro tipo.
 */
export function parametrosDelReporte({ tipo, desde, hasta, productoId, proveedorId }) {
  const parametros = new URLSearchParams();

  const valores = {
    tipo,
    desde: inicioDelDia(desde),
    hasta: finDelDia(hasta),
    productoId: tipo === "producto" ? productoId : undefined,
    proveedorId: tipo === "proveedor" ? proveedorId : undefined,
    zonaHoraria: zonaDelNavegador(),
  };

  for (const [clave, valor] of Object.entries(valores)) {
    if (valor) parametros.set(clave, valor);
  }

  return parametros;
}

/**
 * Pide el PDF al backend.
 *
 * Un rango sin movimientos NO es un error: el backend devuelve igual un PDF
 * que lo aclara, y se descarga como cualquier otro.
 *
 * @returns {Promise<{ blob: Blob, nombreArchivo: string }>}
 */
export async function generarReporteMovimientos(filtros) {
  const consulta = parametrosDelReporte(filtros).toString();
  const { blob, nombreArchivo } = await apiDescargar(
    `/reportes/movimientos?${consulta}`,
  );

  return { blob, nombreArchivo: nombreArchivo || NOMBRE_POR_DEFECTO };
}

/**
 * Si el fallo es el tope de movimientos del backend (400 "El reporte supera
 * los 5000 movimientos..."). La pantalla lo usa para sugerir acotar el rango.
 *
 * Se mira el texto porque el backend no manda un código aparte para este caso;
 * se busca la frase y no el número, por si el tope cambia.
 */
export function esLimiteSuperado(fallo) {
  return (
    fallo?.status === 400 && /supera los [\d.]+ movimientos/i.test(fallo.message)
  );
}

/**
 * Guarda el archivo en el dispositivo, con el mismo patrón que
 * `descargarMisDatos` (HU-31).
 *
 * No se manda al navegador directo al endpoint con un link porque en
 * producción (Vercel + Render) esa navegación no lleva la cookie de sesión y
 * volvería un 401. El archivo ya llegó por `fetch`, que sí la lleva; acá solo
 * se le da un nombre y se dispara la descarga con un `<a download>` temporal.
 */
export function guardarArchivo(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();

  // Sin esto el blob queda retenido en memoria hasta que se recargue la página.
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
