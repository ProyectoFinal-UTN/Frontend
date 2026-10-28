import { useCallback, useEffect, useState } from "react";
import {
  ESTADO,
  activar as activarEnNavegador,
  desactivar as desactivarEnNavegador,
  leerEstado,
} from "../services/pushNavegador";

/**
 * El interruptor de notificaciones push de este dispositivo (HU-18).
 *
 * El estado sale del navegador y no del backend: el permiso y la suscripción
 * son de este navegador, así que en el celular puede estar activado y en la
 * computadora no.
 *
 * @returns {{
 *   estado: string|null,
 *   ocupado: boolean,
 *   fallo: Error|null,
 *   activar: () => Promise<void>,
 *   desactivar: () => Promise<void>,
 * }} `estado` es uno de `ESTADO`, o `null` mientras se averigua.
 */
export function useNotificacionesPush() {
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState(null);

  useEffect(() => {
    let vigente = true;

    function releer() {
      leerEstado()
        .then((leido) => {
          if (vigente) setEstado(leido);
        })
        .catch(() => {
          if (vigente) setEstado(ESTADO.INACTIVO);
        });
    }

    // Al volver a la pestaña se relee: quien había bloqueado el permiso y lo
    // habilitó desde la configuración del navegador ve el cambio sin recargar.
    function alVolver() {
      if (document.visibilityState === "visible") releer();
    }

    releer();
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vigente = false;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  const cambiar = useCallback(async (accion) => {
    setOcupado(true);
    setFallo(null);

    try {
      setEstado(await accion());
    } catch (error) {
      // El 503 no es un error de quien usa la app sino que push está apagado
      // en el servidor: se muestra como estado, sin recuadro rojo.
      if (error?.status === 503) {
        setEstado(ESTADO.SERVIDOR_APAGADO);
      } else {
        setFallo(error);
      }
    } finally {
      setOcupado(false);
    }
  }, []);

  const activar = useCallback(
    () => cambiar(activarEnNavegador),
    [cambiar],
  );
  const desactivar = useCallback(
    () => cambiar(desactivarEnNavegador),
    [cambiar],
  );

  return { estado, ocupado, fallo, activar, desactivar };
}
