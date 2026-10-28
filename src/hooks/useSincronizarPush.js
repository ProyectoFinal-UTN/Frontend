import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { usePermisos } from "./usePermisos";
import { desuscribirAlSalir, sincronizar } from "../services/pushNavegador";

/**
 * Mantiene al día la suscripción push de este navegador con quien entró
 * (HU-18). Se usa una sola vez, en `Layout`, que solo lo monta con sesión.
 *
 * Al entrar —o al abrir la app ya logueado— reenvía la suscripción que haya,
 * sin preguntar nada: el backend hace upsert por endpoint, así que la deja a
 * nombre de quien está ahora y no la duplica. Si no hay suscripción o no hay
 * permiso, no hace nada: activar es siempre un toque en Configuración.
 *
 * Si el rol de quien entró no tiene `alerta:read`, suelta la suscripción que
 * haya quedado en el navegador: si no, seguirían llegando acá los avisos de la
 * persona anterior.
 */
export function useSincronizarPush() {
  const { usuario } = useAuth();
  const { puede, seSabe } = usePermisos();

  const usuarioId = usuario?.id ?? null;
  // `null` mientras no se saben los permisos: hasta entonces no se hace nada,
  // para no soltar la suscripción de alguien por una respuesta que no llegó.
  const habilitado = seSabe ? puede("alerta", "read") : null;

  // Una vez por persona y permiso, no en cada render ni en cada navegación.
  const hecho = useRef(null);

  useEffect(() => {
    if (!usuarioId || habilitado === null) return;

    const clave = `${usuarioId}:${habilitado}`;
    if (hecho.current === clave) return;
    hecho.current = clave;

    if (habilitado) {
      // Si falla no hay nada que mostrar: la suscripción sigue andando con lo
      // que el backend ya tenía, y se reintenta la próxima vez que entre.
      sincronizar().catch(() => {});
    } else {
      desuscribirAlSalir();
    }
  }, [usuarioId, habilitado]);
}
