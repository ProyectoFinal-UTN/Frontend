import { useSesion } from "../services/auth";

/**
 * Estado de la sesión, para que las pantallas sepan quién está usando la app.
 *
 * Se apoya en la sesión reactiva de Better Auth: cuando alguien se registra,
 * inicia sesión o la cierra, los componentes que usen este hook se vuelven a
 * renderizar solos.
 *
 * @returns {{usuario: object|null, autenticado: boolean, cargando: boolean}}
 */
export function useAuth() {
  const { data, isPending } = useSesion();

  return {
    usuario: data?.user ?? null,
    autenticado: Boolean(data?.user),
    // Importa distinguirlo de "no autenticado": mientras se resuelve la
    // sesión no hay que mandar al login a alguien que sí la tiene.
    cargando: isPending,
  };
}
