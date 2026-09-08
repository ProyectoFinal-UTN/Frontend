import {
  SENTIDOS,
  TIPOS_MOVIMIENTO,
  TIPO_CON_SENTIDO,
} from "../services/movimientos";

/** Tope de un `integer` de Postgres, que es el tipo de `movimiento.cantidad`. */
export const MAXIMO_ENTERO = 2147483647;

/**
 * Valida el formulario de registro de movimiento antes de molestar al servidor
 * (HU-13).
 *
 * Vive aparte de la página para poder probar las reglas sin renderizar, y
 * porque Fast Refresh pide que un archivo de componente exporte solo
 * componentes. Mismo motivo que `Productos.validacion.js`.
 *
 * Las reglas espejan las de `validarDatosMovimiento` en el backend a propósito:
 * no para confiar en ellas —el backend valida igual— sino para que el problema
 * aparezca en el campo que lo tiene, y no como un error general después de
 * esperar la respuesta.
 *
 * @param campos los valores crudos del formulario, todos strings.
 * @param pideUbicacion true solo si el comercio tiene más de una ubicación; con
 *   una sola el campo ni se muestra y el backend la resuelve.
 * @returns un mensaje por cada campo con problema; vacío si está todo bien.
 */
export function validarMovimiento(campos, { pideUbicacion = false } = {}) {
  const errores = {};

  if (!campos.productoId) {
    errores.productoId = "Elegí el producto.";
  }

  if (!TIPOS_MOVIMIENTO.some(({ valor }) => valor === campos.tipo)) {
    errores.tipo = "Elegí qué tipo de movimiento es.";
  }

  // El sentido solo se pide en el ajuste, que es el único tipo que puede sumar
  // o restar. Exigirlo siempre agregaría un campo que en los otros tres tipos
  // ya está decidido.
  if (
    campos.tipo === TIPO_CON_SENTIDO &&
    !SENTIDOS.some(({ valor }) => valor === campos.sentido)
  ) {
    errores.sentido = "Indicá si el ajuste suma o resta stock.";
  }

  const cantidad = validarCantidad(campos.cantidad);
  if (cantidad) {
    errores.cantidad = cantidad;
  }

  if (pideUbicacion && !campos.ubicacionId) {
    errores.ubicacionId = "Elegí de qué ubicación sale o a cuál entra.";
  }

  return errores;
}

/**
 * Reglas de la cantidad de un movimiento.
 *
 * Se chequea el texto con un regex en vez de `Number(valor)` porque `Number`
 * acepta "1e3", " 5 " y "0x10", que después el backend rechaza. Mismo criterio
 * que `validarEntero` en `Productos.validacion.js`.
 *
 * A diferencia de aquel, acá el cero no sirve: la cantidad se manda siempre
 * como magnitud positiva y un movimiento de 0 unidades no mueve nada, así que
 * el backend lo rechaza con un 400. Por eso son dos funciones y no una: un
 * producto sí puede darse de alta con stock 0.
 *
 * Se exporta porque `DetalleProducto.jsx` (HU-11) ofrece el mismo movimiento
 * de ajuste por fila de ubicación, con el producto y la ubicación ya elegidos
 * por contexto. Antes tenía una copia literal de estas reglas; el problema no
 * era el duplicado en sí sino que esa copia quedaba sin cobertura: el campo
 * declara `min="1"` y hereda `step="1"`, así que el navegador frena el cero,
 * los decimales y los signos antes del `onSubmit` y ningún E2E puede llegar a
 * esas ramas. Los tests de este módulo son los que las ejercitan.
 *
 * Los mensajes son contrato de los E2E de Infraestructura: si cambian acá,
 * hay que actualizar `tests/e2e/detalle-producto.spec.js` allá.
 *
 * @returns el mensaje de error, o `null` si el valor sirve.
 */
export function validarCantidad(valor) {
  const texto = String(valor ?? "").trim();

  if (!texto) {
    return "Ingresá cuántas unidades.";
  }

  if (!/^\d+$/.test(texto)) {
    return "Tiene que ser un número entero, sin decimales ni signos.";
  }

  if (Number(texto) === 0) {
    return "Tiene que ser al menos 1.";
  }

  if (Number(texto) > MAXIMO_ENTERO) {
    return `No puede superar ${MAXIMO_ENTERO}.`;
  }

  return null;
}
