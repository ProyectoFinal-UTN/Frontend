/**
 * Topes de cada campo: son el largo de la columna en el backend
 * (`proveedor` en schema.js) y los mismos que valida `proveedores.service.js`.
 */
export const LARGOS_MAXIMOS = {
  nombre: 150,
  contacto: 150,
  telefono: 40,
  correo: 255,
  rubro: 100,
  condicionesPago: 255,
};

// El mismo formato mínimo que usa el backend (`FORMATO_CORREO`): algo, una
// arroba, algo, un punto, algo.
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida el formulario de proveedores antes de molestar al servidor (HU-19).
 *
 * Vive aparte de la pantalla por lo mismo que `Productos.validacion.js`: para
 * probar las reglas sin renderizar, y porque Fast Refresh pide que un archivo
 * de componente exporte solo componentes.
 *
 * Solo el nombre es obligatorio. El resto se valida si se completó.
 *
 * @param campos los valores crudos del formulario, todos strings.
 * @returns un mensaje por cada campo con problema; vacío si está todo bien.
 */
export function validarProveedor(campos) {
  const errores = {};

  const nombre = texto(campos.nombre);
  if (!nombre) {
    errores.nombre = "Ingresá el nombre del proveedor.";
  }

  for (const [campo, maximo] of Object.entries(LARGOS_MAXIMOS)) {
    if (!errores[campo] && texto(campos[campo]).length > maximo) {
      errores[campo] = `No puede superar los ${maximo} caracteres.`;
    }
  }

  const correo = texto(campos.correo);
  if (!errores.correo && correo && !FORMATO_CORREO.test(correo)) {
    errores.correo = "Revisá el correo: tiene que ser como nombre@dominio.com.";
  }

  return errores;
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}
