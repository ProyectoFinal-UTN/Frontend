import { apiFetch } from "./api";

/**
 * Registro de movimientos de stock (HU-13).
 *
 * Única puerta a la API para la pantalla de registro. Ninguna página llama a
 * `fetch` directo; todo pasa por acá y de ahí a `api.js`.
 *
 * El backend filtra siempre por el `comercio_id` de la sesión y toma el usuario
 * de la sesión también, así que ninguna de estas funciones necesita —ni debe—
 * mandarlos: la fecha y el autor del movimiento los pone el servidor.
 *
 * Dos campos que el endpoint acepta y este flujo no usa:
 *
 * - `proveedorId`: solo tendría sentido en una compra, pero la tabla PROVEEDOR
 *   es de HU-19 y todavía no existe, así que el backend ni siquiera lo valida.
 *   Se deja afuera hasta entonces en vez de mostrar un campo que no se puede
 *   completar.
 * - `transferenciaId`: lo usa el flujo de transferencia entre ubicaciones
 *   (HU-12), que crea sus movimientos de a pares ligados. No es un dato que
 *   alguien cargue a mano en un movimiento simple.
 */

/**
 * Tipos que acepta el backend, con la etiqueta que ve el comerciante.
 *
 * La etiqueta aclara si el movimiento suma o resta para no obligar a deducirlo:
 * el signo lo aplica el backend según el tipo (`SIGNO_POR_TIPO` en
 * `movimientos.service.js`), acá siempre se manda la cantidad en positivo.
 *
 * `transferencia` no está a propósito: ese tipo lo rechaza este endpoint porque
 * esos movimientos son de HU-12. Si cambian allá, hay que cambiarlos acá.
 */
export const TIPOS_MOVIMIENTO = [
  { valor: "compra", etiqueta: "Compra — entra mercadería" },
  { valor: "venta", etiqueta: "Venta — sale mercadería" },
  { valor: "merma", etiqueta: "Merma — se perdió o venció" },
  { valor: "ajuste", etiqueta: "Ajuste — corrección de inventario" },
];

/**
 * El ajuste es el único tipo que puede ir para los dos lados, así que es el
 * único que además pide un sentido. Los otros tres ya lo tienen implícito.
 */
export const TIPO_CON_SENTIDO = "ajuste";

export const SENTIDOS = [
  { valor: "entrada", etiqueta: "Entrada (suma al stock)" },
  { valor: "salida", etiqueta: "Salida (resta del stock)" },
];

/**
 * Tipos que el backend no acepta sin una explicación escrita (HU-15).
 *
 * Una compra o una venta se explican solas: hubo una operación comercial
 * detrás. Un ajuste y una merma, no —son la corrección de una diferencia entre
 * el stock del sistema y el real—, y sin el motivo el libro dice que faltan
 * seis unidades pero no por qué. Ese "por qué" es lo que hace auditable la
 * corrección.
 *
 * Espeja `TIPOS_QUE_EXIGEN_MOTIVO` en `movimientos.service.js` del backend: si
 * cambia allá, hay que cambiarlo acá.
 */
export const TIPOS_QUE_EXIGEN_MOTIVO = ["ajuste", "merma"];

/** Largo de `movimiento.motivo`, que es un varchar(255) en la base. */
export const MOTIVO_MAXIMO = 255;

/**
 * Registra el movimiento y actualiza el stock, en una sola transacción del lado
 * del backend.
 *
 * `cantidad` tiene que viajar como número y en positivo: el backend chequea
 * `typeof cantidad === "number"` y rechaza los strings, así que mandar el
 * `value` crudo de un `<input type="number">` vuelve con un 400.
 *
 * `ubicacionId` se omite cuando el comercio tiene una sola ubicación —el
 * backend la resuelve—; con más de una es obligatorio y sin él responde 400.
 *
 * `motivo` es obligatorio en los tipos de `TIPOS_QUE_EXIGEN_MOTIVO` (HU-15) y
 * opcional en los demás. Viaja recortado: el backend le hace `trim()` y una
 * cadena en blanco le vale lo mismo que no mandar nada, así que un motivo de
 * solo espacios vuelve con un 400 igual que uno vacío.
 *
 * Responde **409 si no hay stock suficiente** para descontar, con un mensaje
 * que ya nombra las unidades disponibles. Ese caso se muestra tal cual y no
 * como un error genérico: es una condición de negocio, no una falla.
 *
 * @returns `{ movimiento, stock }` — `stock.cantidad` es el saldo que quedó en
 *   esa ubicación, y `stock.ubicacionId` dice cuál usó el backend.
 */
export function registrarMovimiento(datos) {
  return apiFetch("/movimientos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}
