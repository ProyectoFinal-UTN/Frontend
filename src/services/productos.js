import { apiFetch } from "./api";

/**
 * Consulta un código de barras contra el catálogo del comercio (HU-9/HU-10:
 * `GET /api/productos/codigo/:codigoBarras`, en Backend desde HU-9).
 *
 * Responde siempre 200: `{ existe: true, producto }` si ya está cargado, o
 * `{ existe: false, sugerencia }` si es nuevo — la sugerencia (nombre/
 * categoría de Open Food Facts, o null) la arma el propio backend, no hace
 * falta pedirla aparte desde acá.
 */
export async function verificarCodigoBarras(codigo) {
  return apiFetch(`/productos/codigo/${codigo}`);
}
