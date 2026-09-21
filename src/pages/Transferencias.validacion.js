import { MOTIVO_MAXIMO } from "../services/movimientos";
import { validarCantidad } from "./RegistrarMovimiento.validacion";

/**
 * Unidades de medida continuas: las que admitirían fracciones si la base las
 * guardara. No las guarda —`movimiento.cantidad` es un integer (HU-13)—, así
 * que para estas la pantalla aclara que se cargan enteras, para que no
 * parezca un bug.
 */
export const UNIDADES_CONTINUAS = ["kg", "l"];

/**
 * "12 unidades", "1 unidad", "12 kg".
 *
 * La unidad `unidad` es la única que se pluraliza: "3 kg" o "2 caja" se leen
 * raro igual, pero inventar plurales para todo el catálogo sería adivinar.
 * Sin unidad conocida se asume `unidad`, que es el default del alta (HU-9).
 */
export function formatearCantidad(cantidad, unidad = "unidad") {
  if (!unidad || unidad === "unidad") {
    return `${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}`;
  }

  return `${cantidad} ${unidad}`;
}

/**
 * Valida el formulario de transferencia antes de molestar al servidor (HU-12).
 *
 * Vive aparte de la página por lo mismo que `RegistrarMovimiento.validacion.js`:
 * para probar las reglas sin renderizar, y porque Fast Refresh pide que un
 * archivo de componente exporte solo componentes.
 *
 * El tope por stock es el criterio de aceptación «bloqueo si la cantidad supera
 * el stock disponible en el origen». No reemplaza al backend —entre que se
 * cargó el disponible y el envío alguien pudo vender, y ahí responde 409—,
 * pero evita mandar lo que ya se sabe que va a ser rechazado.
 *
 * Los mensajes son contrato de los E2E de Infraestructura: si cambian acá, hay
 * que actualizar el spec de transferencias allá.
 *
 * @param campos los valores crudos del formulario, todos strings.
 * @param contexto.disponible saldo del producto en el origen elegido, o `null`
 *   si todavía no se conoce (la consulta no volvió o falló). Sin ese dato no se
 *   deja enviar: sería renunciar al bloqueo que pide la historia.
 * @param contexto.unidad unidad de medida del producto, para los mensajes.
 * @param contexto.nombreOrigen nombre de la ubicación de origen, para los
 *   mensajes.
 * @returns un mensaje por cada campo con problema; vacío si está todo bien.
 */
export function validarTransferencia(
  campos,
  { disponible = null, unidad = "unidad", nombreOrigen = null } = {},
) {
  const errores = {};

  if (!campos.productoId) {
    errores.productoId = "Elegí el producto.";
  }

  if (!campos.ubicacionOrigenId) {
    errores.ubicacionOrigenId = "Elegí de dónde sale.";
  }

  if (!campos.ubicacionDestinoId) {
    errores.ubicacionDestinoId = "Elegí a dónde va.";
  } else if (campos.ubicacionDestinoId === campos.ubicacionOrigenId) {
    // La pantalla ya saca el origen de las opciones del destino, así que esto
    // no debería pasar. Queda por si acaso: el backend lo rechaza con un 400.
    errores.ubicacionDestinoId = "El destino tiene que ser distinto del origen.";
  }

  const cantidad = validarCantidad(campos.cantidad) ?? validarTope(campos, {
    disponible,
    unidad,
    nombreOrigen,
  });
  if (cantidad) {
    errores.cantidad = cantidad;
  }

  // Opcional, a diferencia del ajuste y la merma (HU-15): el par de
  // movimientos ligados ya explica qué pasó. Solo se mide el largo, recortado
  // como lo recorta el backend.
  if (String(campos.motivo ?? "").trim().length > MOTIVO_MAXIMO) {
    errores.motivo = `No puede superar ${MOTIVO_MAXIMO} caracteres.`;
  }

  return errores;
}

/**
 * El tope por stock, una vez que la cantidad ya es un entero válido.
 *
 * Sin origen elegido no hay contra qué comparar: el error va en el origen, no
 * acá.
 */
function validarTope(campos, { disponible, unidad, nombreOrigen }) {
  if (!campos.productoId || !campos.ubicacionOrigenId) {
    return null;
  }

  if (typeof disponible !== "number") {
    return "Todavía no sabemos cuánto hay en el origen. Esperá a que se consulte el stock.";
  }

  if (Number(campos.cantidad) <= disponible) {
    return null;
  }

  const donde = nombreOrigen ? ` en ${nombreOrigen}` : " en el origen";

  if (disponible === 0) {
    return `No hay stock${donde}. Elegí otro origen.`;
  }

  const disponibles = disponible === 1 ? "disponible" : "disponibles";

  return `Hay ${formatearCantidad(disponible, unidad)} ${disponibles}${donde}. No podés transferir más.`;
}
