import { UNIDADES_MEDIDA } from "../services/productos";

export const LARGO_MAXIMO_NOMBRE = 150;
export const LARGO_MAXIMO_CATEGORIA = 100;

// Solo dígitos, de 6 a 64. Es el mismo formato que exige el backend
// (`FORMATO_CODIGO_BARRAS` en productos.service.js).
const FORMATO_CODIGO_BARRAS = /^\d{6,64}$/;

// Tope de un `integer` de Postgres, que es el tipo de `umbral_minimo` y de
// `stock.cantidad`. Un valor más grande falla en la base, no en la validación.
export const MAXIMO_ENTERO = 2147483647;

/**
 * Valida el formulario de productos antes de molestar al servidor (HU-9).
 *
 * Vive aparte de la página para poder probar las reglas sin renderizar, y
 * porque Fast Refresh pide que un archivo de componente exporte solo
 * componentes. Mismo motivo que `Registro.validacion.js`.
 *
 * Las reglas espejan las del backend a propósito: no para confiar en ellas
 * (el backend valida igual), sino para que el comerciante vea el problema en
 * el campo que lo tiene en vez de un error general después de esperar la
 * respuesta.
 *
 * @param campos los valores crudos del formulario, todos strings.
 * @param esEdicion en la edición no se pide stock: cambiar cantidades es HU-13.
 * @returns un mensaje por cada campo con problema; vacío si está todo bien.
 */
export function validarProducto(campos, { esEdicion = false } = {}) {
  const errores = {};

  const codigoBarras = texto(campos.codigoBarras);
  if (!codigoBarras) {
    errores.codigoBarras = "Ingresá el código de barras.";
  } else if (!FORMATO_CODIGO_BARRAS.test(codigoBarras)) {
    errores.codigoBarras = "Tiene que ser de 6 a 64 dígitos, sin letras.";
  }

  const nombre = texto(campos.nombre);
  if (!nombre) {
    errores.nombre = "Ingresá el nombre del producto.";
  } else if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    errores.nombre = `No puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`;
  }

  const categoria = texto(campos.categoria);
  if (!categoria) {
    errores.categoria = "Ingresá una categoría.";
  } else if (categoria.length > LARGO_MAXIMO_CATEGORIA) {
    errores.categoria = `No puede superar los ${LARGO_MAXIMO_CATEGORIA} caracteres.`;
  }

  if (!UNIDADES_MEDIDA.includes(campos.unidadMedida)) {
    errores.unidadMedida = "Elegí una unidad de medida.";
  }

  const umbral = validarEntero(campos.umbralMinimo);
  if (umbral) {
    errores.umbralMinimo = umbral;
  }

  if (!esEdicion) {
    const stock = validarEntero(campos.stockActual);
    if (stock) {
      errores.stockActual = stock;
    }
  }

  return errores;
}

/**
 * Recorta un campo de texto sin asumir que llegó un string.
 *
 * Hoy los tres campos que la usan vienen siempre poblados: `nombre`,
 * `codigoBarras` y `categoria` son `notNull` en el schema y el backend los
 * devuelve en todas las respuestas. La coerción es una red por si ese contrato
 * cambia, no la evidencia de que la API devuelva nulos: el formulario arma sus
 * valores con `{...CAMPOS_VACIOS, ...inicial}`, y un spread deja pasar un
 * `undefined` por encima del `""` por defecto. Sin esto, ese caso reventaría
 * con un TypeError que deja el botón «Guardar» muerto, sin alerta ni error de
 * campo que explique nada.
 */
function texto(valor) {
  return String(valor ?? "").trim();
}

/**
 * Reglas comunes a umbral mínimo y stock inicial.
 *
 * Se chequea el texto con un regex en vez de `Number(valor)` porque `Number`
 * acepta "1e3", " 5 " y "0x10", que después el backend rechaza: más vale
 * decirlo acá que dejar pasar un valor que parece número y no lo es.
 *
 * @returns el mensaje de error, o `null` si el valor sirve.
 */
function validarEntero(valor) {
  const texto = String(valor).trim();

  if (!texto) {
    return "Ingresá un número.";
  }

  if (!/^\d+$/.test(texto)) {
    return "Tiene que ser un número entero, sin decimales ni signos.";
  }

  if (Number(texto) > MAXIMO_ENTERO) {
    return `No puede superar ${MAXIMO_ENTERO}.`;
  }

  return null;
}
