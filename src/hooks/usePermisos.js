import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  cargarConfiguracion,
  leer,
  refrescarPermisos,
  suscribir,
} from "../services/permisos";

/**
 * Qué puede hacer quien está usando la app (HU-32).
 *
 * Se pregunta siempre por ACCIÓN, nunca por nombre de rol:
 *
 *   const { puede } = usePermisos();
 *   {puede("producto", "create") && <BotonNuevoProducto />}
 *
 * Preguntar `rol === "propietario"` obliga a repetir la matriz de permisos en
 * cada componente y a tocarlos todos cuando cambia. Preguntar por la acción
 * deja esa decisión donde corresponde, que es el backend.
 *
 * @returns {{
 *   puede: (recurso: string, accion: string) => boolean,
 *   rol: string|null,
 *   configuracion: object|null,
 *   resuelto: boolean,
 *   cargando: boolean,
 *   error: Error|null,
 *   refrescar: () => Promise<object|null>,
 * }}
 */
export function usePermisos() {
  const estado = useSyncExternalStore(suscribir, leer, leer);

  // En efecto y no en el render: `cargarConfiguracion` publica estado, y
  // publicar durante el render de otro componente es un update en medio del
  // render. Al estar deduplicada, que la llamen diez pantallas no cuesta nada.
  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const permisos = estado.configuracion?.permisos;

  const puede = useCallback(
    /**
     * Sin permisos cargados devuelve `false`, a propósito: mientras no se sabe,
     * no se ofrece. Es el default seguro para ESCONDER un botón, y por eso las
     * pantallas muestran su "Cargando…" en vez de una UI a medio armar.
     *
     * Ojo: no es el default correcto para ACUSAR a alguien de no tener permiso.
     * Esa distinción la hace `RutaProtegida`, que mira `cargando` y `error`.
     */
    (recurso, accion) => permisos?.[recurso]?.includes(accion) === true,
    [permisos],
  );

  const seSabe = estado.configuracion !== null;
  const fallo = estado.error !== null;

  const puedeSalvoQueFalle = useCallback(
    /**
     * Como `puede`, pero devuelve `true` cuando averiguarlo FALLÓ.
     *
     * Para las acciones donde equivocarse escondiendo es peor que equivocarse
     * mostrando: si la request se cae, esconder le saca una función a quien sí
     * podía usarla, mientras que mostrar de más termina en un 403 del backend,
     * que es la autoridad y además explica qué pasó.
     *
     * Ojo con la diferencia entre "falló" y "todavía no llegó": mientras está
     * en vuelo devuelve `false`, igual que `puede`. Si devolviera `true`, el
     * empleado vería aparecer «Escanear producto» y desaparecer un instante
     * después, que es peor que esperar. Por eso las pantallas que usan esto
     * miran `resuelto` para no dibujar la lista antes de tiempo.
     *
     * No se usa para datos sensibles —la lista del equipo, la auditoría—, donde
     * el default correcto es el de `puede`.
     */
    (recurso, accion) => fallo || puede(recurso, accion),
    [fallo, puede],
  );

  return useMemo(
    () => ({
      puede,
      puedeSalvoQueFalle,
      seSabe,
      rol: estado.configuracion?.rol ?? null,
      configuracion: estado.configuracion,
      // Si ya se sabe algo —los permisos o que fallaron—, distinto de
      // `!cargando`: en el primer render el efecto todavía no corrió, así que
      // `cargando` es falso y no hay datos. Quien mire `!cargando` para decidir
      // si alguien tiene permiso va a acusarlo durante ese render.
      resuelto: estado.configuracion !== null || estado.error !== null,
      cargando: estado.cargando,
      error: estado.error,
      refrescar: refrescarPermisos,
    }),
    [puede, puedeSalvoQueFalle, seSabe, estado],
  );
}
