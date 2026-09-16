/**
 * Valida el formulario de login antes de molestar al servidor (HU-2).
 *
 * A propósito es más laxa que la del registro: acá no se exige largo mínimo ni
 * formato de contraseña. Quien ya tiene cuenta puede haberla creado cuando las
 * reglas eran otras, y rechazarle la clave antes de probarla sería mentirle
 * sobre por qué no entra. Del formato de la contraseña decide el backend.
 *
 * @returns un mensaje por cada campo vacío; vacío si están los dos.
 */
export function validarLogin({ correo, password }) {
  const errores = {};

  if (!correo.trim()) {
    errores.correo = "Ingresá tu correo.";
  }

  if (!password) {
    errores.password = "Ingresá tu contraseña.";
  }

  return errores;
}
