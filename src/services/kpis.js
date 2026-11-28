import { apiFetch } from "./api";

/**
 * KPIs principales del dashboard (HU-22), filtrables por período (HU-23).
 *
 * Ninguna página llama a `fetch` directo; todo pasa por acá y de ahí a
 * `api.js`.
 */

/**
 * Las ventanas móviles que ofrecía el selector de HU-22, en días.
 *
 * Se conserva porque es la API pública del módulo y su test la usa. El catálogo
 * completo del selector —con los presets de calendario de HU-23— vive en
 * `services/periodos.js` (`PERIODOS`), que es de donde sale el `periodo` que
 * recibe `obtenerKpis`.
 */
export const VENTANAS = Object.freeze([7, 30, 90]);

/** La que trae el dashboard al abrir. Es también el default del backend. */
export const VENTANA_POR_DEFECTO = 30;

/**
 * Los KPIs del comercio: estado del stock, rotación y compras por proveedor.
 *
 * El período se pide de UNA de las dos formas, y son excluyentes (mandar las
 * dos es un 400). Lo resuelve `parametrosDePeriodo` en `services/periodos.js`,
 * que devuelve una o la otra y nunca ambas:
 *
 *   { dias }          la ventana móvil que termina hoy. Es el default.
 *                     Tope 90: si se pide más, el backend RECORTA EN SILENCIO,
 *                     así que el período efectivo se lee de `periodo.dias` de
 *                     la RESPUESTA y nunca del valor que se pidió.
 *   { desde, hasta }  un rango absoluto, los DOS extremos inclusive, en ISO
 *                     8601 con zona explícita. Tope 366 días calendario: si se
 *                     pasa, el backend RECHAZA con 400 y no recorta.
 *
 * @param {{dias?: number, desde?: string, hasta?: string}} [periodo]
 * @returns {Promise<{
 *   generadoEn: string,
 *   periodo: { dias: number, desde: string, hasta: string, zonaHoraria: string },
 *   stock: {
 *     alcance: "actual",
 *     productos: number, unidades: number, sinStock: number,
 *     bajoUmbral: number, normal: number, productosSinVentas: number,
 *     porUbicacion: Array<{ id: string, nombre: string, unidades: number,
 *                           productos: number }>,
 *   },
 *   rotacion: {
 *     ventas: number, unidadesVendidas: number, productosSinVentas: number,
 *     masVendidos: Array<{
 *       producto: { id: string, nombre: string, categoria: string,
 *                   unidadMedida: string, activo: boolean },
 *       ventas: number, unidadesVendidas: number, stockActual: number,
 *       diasDeCobertura: number|null,
 *     }>,
 *     porDia: Array<{ fecha: string, ventas: number, unidades: number }>,
 *     montos: null,
 *   },
 *   comprasPorProveedor: {
 *     compras: number, unidades: number, proveedoresConCompras: number,
 *     proveedores: Array<{
 *       proveedor: { id: string, nombre: string, activo: boolean },
 *       compras: number, unidades: number, ultimaCompra: string,
 *     }>,
 *     otros: { proveedores: number, compras: number, unidades: number }|null,
 *     sinProveedor: { compras: number, unidades: number }|null,
 *     montos: null,
 *   },
 * }>}
 *
 * Lo que hay que saber de la respuesta, verificado en
 * `Backend/src/services/kpis.service.js`:
 *
 * - **`stock` es el estado de AHORA** y no depende del período: viaja con
 *   `alcance: "actual"` justamente para que la pantalla lo rotule. Lo que sigue
 *   al período es `rotacion` y `comprasPorProveedor`. Lo mismo arrastran
 *   `masVendidos[].stockActual` y `diasDeCobertura`, que cruza el stock de hoy
 *   con el ritmo de venta del período: "al ritmo del período, lo que tengo HOY
 *   me dura N días", que NO es la cobertura que había en ese período.
 * - `sinStock`, `bajoUmbral` y `normal` son excluyentes y suman `productos`:
 *   se pueden graficar como partes de un todo sin restar nada.
 * - **No hay montos.** El modelo no guarda precios; `montos` viene en `null`
 *   a propósito. No se muestran pesos inventados.
 * - `porDia` trae un elemento por día de la ventana, con 0 en los días sin
 *   ventas, ya ordenado del más viejo a hoy. Las fechas son días de Argentina
 *   (`"2026-11-22"`), no instantes: no se pasan por `new Date()` sin zona.
 * - `diasDeCobertura` es `null` si el producto no se vendió en la ventana.
 * - Los totales de compras incluyen lo que no entra en `proveedores` (va en
 *   `otros`) y lo que no tiene proveedor (`sinProveedor`).
 *
 * Errores que puede producir, todos con el mensaje ya redactado para el
 * usuario final en `{ error }`: 400 si `dias` no es un entero positivo, si
 * llegan `dias` y el rango juntos, si falta uno de los dos extremos, si una
 * fecha no es ISO 8601 con zona, si `desde` es posterior a `hasta` o si el
 * rango abarca más de 366 días; 401 sin sesión; 403 si al rol le falta
 * `kpi.read` (el empleado no lo tiene).
 *
 * El 403 se evalúa ANTES que el período: un empleado con fechas mal recibe 403
 * igual. Un 400 nunca es un problema de permisos ni al revés.
 */
export function obtenerKpis({ dias, desde, hasta } = {}) {
  const parametros = new URLSearchParams();

  // El default no viaja, como la página 1 de las alertas: la URL queda limpia
  // y el backend aplica el mismo valor. Un valor que no sea un entero positivo
  // tampoco, en vez de provocar un 400.
  if (Number.isInteger(dias) && dias > 0 && dias !== VENTANA_POR_DEFECTO) {
    parametros.set("dias", String(dias));
  } else if (desde && hasta) {
    // Los dos o ninguno: mandar uno solo es un 400 ("el período necesita un
    // rango de fechas"). Y nunca junto con `dias`, que es el otro 400: de ahí
    // el `else` y no un segundo `if`. Quien arma el período
    // (`parametrosDePeriodo`) ya devuelve una forma o la otra, así que no hay
    // modo de que lleguen las dos; el `else` es el cinturón.
    parametros.set("desde", desde);
    parametros.set("hasta", hasta);
  }

  const consulta = parametros.toString();

  return apiFetch(`/kpis${consulta ? `?${consulta}` : ""}`);
}
