import { apiFetch } from "./api";

/**
 * KPIs principales del dashboard (HU-22).
 *
 * Ninguna página llama a `fetch` directo; todo pasa por acá y de ahí a
 * `api.js`.
 */

/**
 * Las ventanas que ofrece el selector del dashboard, en días.
 *
 * Tres y no un campo libre: es un widget que se lee de un vistazo en el
 * celular. El backend acepta de 1 a 90 y recorta lo que pase de 90.
 */
export const VENTANAS = Object.freeze([7, 30, 90]);

/** La que trae el dashboard al abrir. Es también el default del backend. */
export const VENTANA_POR_DEFECTO = 30;

/**
 * Los KPIs del comercio: estado del stock, rotación y compras por proveedor.
 *
 * @param {{dias?: number}} [opciones]
 * @returns {Promise<{
 *   generadoEn: string,
 *   periodo: { dias: number, desde: string, hasta: string, zonaHoraria: string },
 *   stock: {
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
 * - **`stock` es el estado de AHORA** y no depende de `dias`. Lo que cambia
 *   con la ventana es `rotacion` y `comprasPorProveedor`.
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
 * Errores que puede producir: 400 si `dias` no es un entero positivo, 401 sin
 * sesión, 403 si al rol le falta `kpi.read` (el empleado no lo tiene).
 */
export function obtenerKpis({ dias } = {}) {
  // El default no viaja, como la página 1 de las alertas: la URL queda limpia
  // y el backend aplica el mismo valor. Un valor que no sea un entero positivo
  // tampoco, en vez de provocar un 400.
  const viaja =
    Number.isInteger(dias) && dias > 0 && dias !== VENTANA_POR_DEFECTO;

  return apiFetch(`/kpis${viaja ? `?dias=${dias}` : ""}`);
}
