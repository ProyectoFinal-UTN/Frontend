/**
 * Reglas del formulario de reporte PDF (HU-25), separadas del componente para
 * poder probarlas sin renderizar nada.
 *
 * El backend valida todo esto igual y responde 400. Se repite acá para que el
 * aviso aparezca al lado del campo, en el momento, y no como un error general
 * después de ir y volver del servidor.
 */

/** Una fecha → "YYYY-MM-DD" en la hora local, lo que usa `<input type="date">`. */
export function diaLocal(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Lo que muestra el formulario al abrirse: por período, del 1° del mes a hoy. */
export function valoresIniciales(hoy = new Date()) {
  return {
    tipo: "periodo",
    desde: diaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: diaLocal(hoy),
    productoId: "",
    proveedorId: "",
  };
}

/**
 * Los errores por campo; un objeto vacío si está todo bien.
 *
 * Las fechas se comparan como texto: en el formato `YYYY-MM-DD` el orden
 * alfabético coincide con el cronológico. Mismo criterio que `errorDeRango` en
 * el historial de movimientos (HU-14), con el mismo mensaje.
 */
export function validarReporte({ tipo, desde, hasta, productoId, proveedorId }) {
  const errores = {};

  if (!desde) errores.desde = "Elegí desde qué día querés el reporte.";
  if (!hasta) errores.hasta = "Elegí hasta qué día querés el reporte.";

  if (desde && hasta && desde > hasta) {
    errores.desde = "La fecha «Desde» no puede ser posterior a «Hasta».";
  }

  if (tipo === "producto" && !productoId) {
    errores.productoId = "Elegí de qué producto querés el reporte.";
  }

  if (tipo === "proveedor" && !proveedorId) {
    errores.proveedorId = "Elegí de qué proveedor querés el reporte.";
  }

  return errores;
}
