export const LARGOS = {
  nombre: 150,
  rubro: 100,
  direccion: 255,
  telefono: 40,
  correoContacto: 255,
};

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida el perfil del comercio antes de molestar al servidor (HU-6).
 *
 * Las mismas reglas que aplica el backend, repetidas acá a propósito: así el
 * comerciante ve el error al lado del campo que lo tiene, en vez de un mensaje
 * suelto arriba después de esperar la respuesta. El backend igual valida, que
 * es lo que cuenta para la integridad de los datos.
 *
 * `nombre` y `rubro` son obligatorios; el resto opcional, pero válido si se
 * carga.
 *
 * @returns un mensaje por cada campo con problema; vacío si está todo bien.
 */
export function validarPerfil(perfil) {
  const errores = {};

  if (!perfil.nombre?.trim()) {
    errores.nombre = "Ingresá el nombre del negocio.";
  } else if (perfil.nombre.trim().length > LARGOS.nombre) {
    errores.nombre = `No puede superar los ${LARGOS.nombre} caracteres.`;
  }

  if (!perfil.rubro?.trim()) {
    errores.rubro = "Ingresá el rubro.";
  } else if (perfil.rubro.trim().length > LARGOS.rubro) {
    errores.rubro = `No puede superar los ${LARGOS.rubro} caracteres.`;
  }

  for (const campo of ["direccion", "telefono"]) {
    const valor = perfil[campo]?.trim() ?? "";

    if (valor.length > LARGOS[campo]) {
      errores[campo] = `No puede superar los ${LARGOS[campo]} caracteres.`;
    }
  }

  const correo = perfil.correoContacto?.trim() ?? "";

  if (correo && !FORMATO_CORREO.test(correo)) {
    errores.correoContacto = "Ese correo no parece válido.";
  } else if (correo.length > LARGOS.correoContacto) {
    errores.correoContacto = `No puede superar los ${LARGOS.correoContacto} caracteres.`;
  }

  return errores;
}
