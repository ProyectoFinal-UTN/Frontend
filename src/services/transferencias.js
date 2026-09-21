import { apiFetch } from "./api";

/**
 * Transferencia de stock entre ubicaciones (HU-12).
 *
 * Única puerta a la API para la pantalla de transferencias. Ninguna página
 * llama a `fetch` directo; todo pasa por acá y de ahí a `api.js`.
 *
 * El backend filtra por el `comercio_id` de la sesión y toma el usuario de la
 * sesión también, así que no se mandan: la fecha y el autor los pone el
 * servidor.
 */

/**
 * Mueve unidades de un producto de una ubicación a otra, en una sola
 * transacción del lado del backend: descuenta del origen y suma al destino, o
 * no pasa ninguna de las dos cosas.
 *
 * **No es idempotente.** Dos llamadas con el mismo cuerpo son dos
 * transferencias reales, así que quien la use tiene que garantizar que no se
 * dispare dos veces por el mismo envío.
 *
 * `datos`:
 * - `productoId`, `ubicacionOrigenId`, `ubicacionDestinoId`: obligatorios, y
 *   origen y destino distintos (si no, 400).
 * - `cantidad`: entero positivo que viaja como **número**. El backend chequea
 *   `typeof cantidad === "number"`, así que el `value` crudo de un
 *   `<input type="number">` vuelve con un 400. Entero incluso para productos en
 *   kg o l: `movimiento.cantidad` es un integer en la base (heredado de HU-13).
 * - `motivo`: opcional, hasta 255 caracteres.
 *
 * Responde **409** si el origen no tiene stock suficiente (o si el destino
 * pasaría el máximo de un integer), con un mensaje que ya nombra las unidades
 * disponibles y las pedidas: se muestra tal cual.
 *
 * @returns `{ transferencia, movimientos: [salida, entrada], stock: { origen,
 *   destino } }` — cada uno de `stock.origen` y `stock.destino` es
 *   `{ id, ubicacionId, cantidad }` con el saldo que quedó, para refrescar la
 *   pantalla sin otro pedido.
 */
export function transferirStock(datos) {
  return apiFetch("/transferencias", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}
