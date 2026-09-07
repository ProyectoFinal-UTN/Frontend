// Los mismos límites que el registro, importados en vez de repetidos: si el
// backend cambia el mínimo, se toca un solo lugar.
import {
  LARGO_MAXIMO_PASSWORD,
  LARGO_MINIMO_PASSWORD,
} from "./Registro.validacion";

/**
 * Validaciones de la recuperación de contraseña (HU-3).
 *
 * Viven aparte de las páginas para poder probar las reglas sin renderizar, como
 * el resto del repo.
 */

/** Paso 1: pedir el link. Solo hace falta el correo. */
export function validarPedidoDeRecuperacion({ correo }) {
  const errores = {};

  if (!correo.trim()) {
    errores.correo = "Ingresá tu correo.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
    errores.correo = "Ese correo no parece válido.";
  }

  return errores;
}

/**
 * Paso 2: elegir la contraseña nueva.
 *
 * Las mismas reglas que el registro, y por las mismas razones: el mínimo lo
 * exige el backend y el máximo existe porque bcrypt ignora todo lo que pase de
 * 72 bytes.
 */
export function validarPasswordNueva({ password, confirmacion }) {
  const errores = {};

  if (!password) {
    errores.password = "Ingresá una contraseña.";
  } else if (password.length < LARGO_MINIMO_PASSWORD) {
    errores.password = `Usá al menos ${LARGO_MINIMO_PASSWORD} caracteres.`;
  } else if (password.length > LARGO_MAXIMO_PASSWORD) {
    errores.password = `No puede superar los ${LARGO_MAXIMO_PASSWORD} caracteres.`;
  }

  if (!confirmacion) {
    errores.confirmacion = "Repetí la contraseña.";
  } else if (password !== confirmacion) {
    errores.confirmacion = "Las contraseñas no coinciden.";
  }

  return errores;
}
