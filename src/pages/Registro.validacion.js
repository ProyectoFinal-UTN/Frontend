export const LARGO_MINIMO_PASSWORD = 8;

// El backend hashea con bcrypt, que ignora todo lo que pase de 72 bytes: dos
// contraseñas con ese prefijo servirían indistintamente para entrar.
export const LARGO_MAXIMO_PASSWORD = 72;

/**
 * Valida el formulario de registro antes de molestar al servidor (HU-1).
 *
 * Vive aparte de la página para poder probar las reglas sin renderizar, y
 * porque Fast Refresh pide que un archivo de componente exporte solo
 * componentes.
 *
 * @returns un mensaje por cada campo con problema; vacío si está todo bien.
 */
export function validarRegistro({ correo, password, confirmacion }) {
  const errores = {};

  if (!correo.trim()) {
    errores.correo = "Ingresá tu correo.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
    errores.correo = "Ese correo no parece válido.";
  }

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
