import { apiFetch } from "./api";

/**
 * Registro de accesos y acciones (HU-5).
 *
 * Solo lo lee el propietario: a cualquier otro rol el backend le responde 403.
 * Es de solo lectura — no hay forma de editar ni borrar un evento, que es lo
 * único que hace útil a una auditoría.
 */

/** Nombres legibles de las acciones, para no mostrar los códigos crudos. */
const ETIQUETAS_ACCION = {
  inicio_sesion: "Inició sesión",
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
};

/** Los recursos vienen en singular desde el backend. */
const ETIQUETAS_RECURSO = {
  sesion: "una sesión",
  producto: "un producto",
  ubicacion: "una ubicación",
  movimiento: "un movimiento",
  comercio: "los datos del negocio",
  configuracion: "la configuración",
  miembro: "un usuario",
  invitacion: "una invitación",
};

export function etiquetaDeAccion(accion) {
  return ETIQUETAS_ACCION[accion] ?? accion;
}

export function etiquetaDeRecurso(recurso) {
  return ETIQUETAS_RECURSO[recurso] ?? recurso;
}

/**
 * Arma la frase que se muestra en la lista.
 * Los accesos se leen solos ("Inició sesión"), así que no se les agrega el
 * recurso, que sería redundante.
 */
export function describirEvento(evento) {
  if (evento.accion === "inicio_sesion") {
    return etiquetaDeAccion(evento.accion);
  }

  return `${etiquetaDeAccion(evento.accion)} ${etiquetaDeRecurso(evento.recurso)}`;
}

export function obtenerAuditoria({ accion, recurso } = {}) {
  const parametros = new URLSearchParams();

  if (accion) parametros.set("accion", accion);
  if (recurso) parametros.set("recurso", recurso);

  const consulta = parametros.toString();

  return apiFetch(`/auditoria${consulta ? `?${consulta}` : ""}`);
}
