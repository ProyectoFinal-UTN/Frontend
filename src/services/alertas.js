import { apiFetch } from "./api";

/**
 * Alertas de reposición (HU-17).
 *
 * Ninguna página llama a `fetch` directo; todo pasa por acá y de ahí a
 * `api.js`.
 *
 * Solo lectura: no hay endpoint para descartar una alerta a mano ni para
 * listar las resueltas. Una alerta se cierra sola cuando una reposición deja
 * el saldo por encima del umbral, dentro de la misma transacción que mueve el
 * stock. El permiso `alerta.update` existe en el catálogo del backend pero
 * ningún endpoint lo usa, así que no hay nada que escribir desde acá.
 */

/**
 * Cuántas alertas pide el panel del dashboard.
 *
 * Seis y no las 50 del default del backend: el panel es un widget de Inicio y
 * tiene que leerse de un vistazo en un celular. El resto se alcanza con la
 * paginación, que es también la razón por la que el panel pide un límite
 * explícito en vez de dejar el del backend.
 */
export const LIMITE_DEL_PANEL = 6;

/**
 * Las alertas activas del comercio, de la más urgente a la menos urgente.
 *
 * El endpoint devuelve SOLO las activas: no hay filtro por estado.
 *
 * @param {{pagina?: number, limite?: number}} [opciones]
 * @returns {Promise<{
 *   alertas: Array<{
 *     id: string,
 *     generadaEn: string,
 *     producto: { id: string, nombre: string, codigoBarras: string|null,
 *                 categoria: string|null, unidadMedida: string },
 *     stockActual: number,
 *     umbralMinimo: number,
 *     faltanteHastaElUmbral: number,
 *     stockAlGenerar: number,
 *     umbralAlGenerar: number,
 *     ubicaciones: Array<{ id: string, nombre: string, cantidad: number }>,
 *     proveedorSugerido: { id: string, nombre: string, telefono: string|null,
 *                          correo: string|null }|null,
 *     proveedores: Array<object>,
 *   }>,
 *   paginacion: { pagina: number, limite: number, total: number, totalPaginas: number },
 * }>}
 *
 * Lo que hay que saber de la respuesta, verificado en
 * `Backend/src/services/alertasActivas.service.js`:
 *
 * - **El orden ya viene resuelto** (`stockActual - umbralMinimo` ascendente,
 *   desempatando por nombre y por id). No se reordena en el cliente: ese orden
 *   NO es el mismo que `faltanteHastaElUmbral` descendente, así que reordenar
 *   por el faltante cambiaría la lista.
 * - **`faltanteHastaElUmbral` ya viene calculado.** No se resta nada acá. Da 0
 *   para un producto justo en el mínimo, y esa alerta aparece igual: alcanzar
 *   el umbral ya es estar en falta. No se filtran los ceros.
 * - `stockActual` y `umbralMinimo` son los valores VIVOS; `stockAlGenerar` y
 *   `umbralAlGenerar` son la foto de cuando nació la alerta.
 * - `ubicaciones` es siempre un array y excluye las ubicaciones en cero, así
 *   que vacío significa "no queda nada en ningún lado", no "falta el dato".
 * - `proveedorSugerido` es `null` cuando el producto no tiene proveedores
 *   activos asociados, y la alerta aparece igual. Es el primero por nombre de
 *   `proveedores`, no "el principal": la relación es N:M y el modelo no guarda
 *   cuál lo es.
 * - **`totalPaginas` es 0 cuando `total` es 0**, no 1.
 * - Una página más allá del final responde 200 con `alertas: []` y `total > 0`.
 *   No es un error.
 *
 * Errores que puede producir: 400 si `pagina` o `limite` no son enteros
 * positivos, 401 sin sesión, 403 si al rol le falta `alerta.read`.
 */
export function obtenerAlertas({ pagina, limite = LIMITE_DEL_PANEL } = {}) {
  const parametros = new URLSearchParams();

  const valores = {
    // La página 1 no viaja: es el default del backend y la URL queda limpia.
    pagina: pagina > 1 ? String(pagina) : undefined,
    // `limite` sí viaja siempre, porque el default del backend son 50 y el
    // panel quiere 6. Un valor que no sea un entero positivo no se manda en
    // vez de provocar un 400: el backend recorta solo lo que pasa de 200.
    limite: limite > 0 ? String(limite) : undefined,
  };

  for (const [clave, valor] of Object.entries(valores)) {
    if (valor) parametros.set(clave, valor);
  }

  const consulta = parametros.toString();

  return apiFetch(`/alertas${consulta ? `?${consulta}` : ""}`);
}
