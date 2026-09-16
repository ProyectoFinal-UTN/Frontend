import { apiFetch } from "./api";

/**
 * Equipo del comercio (HU-4).
 *
 * Única puerta a la API para la pestaña de usuarios. El backend filtra siempre
 * por el comercio de la sesión, así que ninguna de estas funciones necesita
 * —ni debe— mandarlo.
 */

/** Los tres roles de RF9, con un nombre y una explicación para la pantalla. */
export const ROLES = [
  {
    id: "propietario",
    etiqueta: "Propietario",
    descripcion: "Control total. Administra usuarios y ve la auditoría.",
  },
  {
    id: "gerente",
    etiqueta: "Gerente",
    descripcion: "Opera el negocio completo. Ve el equipo, pero no lo cambia.",
  },
  {
    id: "empleado",
    etiqueta: "Empleado",
    descripcion: "Registra movimientos y consulta. No configura ni borra.",
  },
];

export function etiquetaDeRol(id) {
  return ROLES.find((rol) => rol.id === id)?.etiqueta ?? id;
}

/** Trae el equipo, las invitaciones pendientes y los roles asignables. */
export function obtenerEquipo() {
  return apiFetch("/miembros");
}

export function invitar({ correo, rol }) {
  return apiFetch("/miembros/invitaciones", {
    method: "POST",
    body: JSON.stringify({ correo, rol }),
  });
}

export function cancelarInvitacion(id) {
  return apiFetch(`/miembros/invitaciones/${id}`, { method: "DELETE" });
}

export function cambiarRol(miembroId, rol) {
  return apiFetch(`/miembros/${miembroId}/rol`, {
    method: "PUT",
    body: JSON.stringify({ rol }),
  });
}

export function quitarMiembro(miembroId) {
  return apiFetch(`/miembros/${miembroId}`, { method: "DELETE" });
}

/**
 * Arma el link que el propietario le pasa al invitado.
 *
 * Se construye contra el origen actual del navegador y no contra una URL
 * configurada, para que funcione igual en desarrollo, en la red local y en
 * producción sin tocar nada.
 */
export function linkDeInvitacion(id) {
  return `${window.location.origin}/invitacion/${id}`;
}

/** Datos de una invitación. No exige sesión: el invitado puede no tener cuenta. */
export function verInvitacion(id) {
  return apiFetch(`/invitaciones/${id}`);
}

/** Para quien ya tiene cuenta y sesión iniciada. */
export function aceptarInvitacion(id) {
  return apiFetch(`/invitaciones/${id}/aceptar`, { method: "POST" });
}
