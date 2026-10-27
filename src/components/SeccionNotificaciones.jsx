import AvisoDeError from "./AvisoDeError";
import { useNotificacionesPush } from "../hooks/useNotificacionesPush";
import { ESTADO } from "../services/pushNavegador";

/**
 * Notificaciones push de reposición (HU-18): el interruptor para activarlas o
 * silenciarlas en este dispositivo.
 *
 * Activarlas es siempre un toque de la persona, nunca algo que pase solo al
 * abrir la pantalla: el navegador muestra el cartel de permiso una sola vez, y
 * Safari directamente no lo muestra si el pedido no sale de un toque.
 *
 * Qué producto avisa y cuándo lo decide el backend, con el umbral de cada
 * producto (HU-16). Acá solo se suscribe el dispositivo.
 */

/** Por qué el interruptor está deshabilitado, con lo que se puede hacer. */
const EXPLICACION = {
  [ESTADO.SIN_SOPORTE]: (
    <p>
      Este navegador no permite notificaciones push. Probá con Chrome, Edge o
      Firefox actualizados. En iPhone hace falta iOS 16.4 o superior y la app
      instalada en la pantalla de inicio.
    </p>
  ),
  [ESTADO.IOS_SIN_INSTALAR]: (
    <>
      <p>
        En iPhone las notificaciones solo funcionan con la app instalada en la
        pantalla de inicio (iOS 16.4 o superior). Para instalarla:
      </p>
      <ol className="mt-2 list-decimal pl-5">
        <li>Abrí esta página en Safari.</li>
        <li>
          Tocá el botón Compartir y elegí «Agregar a pantalla de inicio».
        </li>
        <li>Entrá desde ese ícono y volvé a esta pantalla.</li>
      </ol>
    </>
  ),
  [ESTADO.SERVIDOR_APAGADO]: (
    <p>
      Las notificaciones push no están disponibles en este momento: el servidor
      no las tiene activadas. Avisale a quien administra el sistema.
    </p>
  ),
  [ESTADO.DENEGADO]: (
    <>
      <p>
        Las notificaciones están bloqueadas para esta app, y el navegador no
        deja volver a preguntar. Para habilitarlas:
      </p>
      <ul className="mt-2 list-disc pl-5">
        <li>
          En la computadora: tocá el candado al lado de la dirección, entrá a
          Notificaciones y elegí «Permitir».
        </li>
        <li>
          En Android: en Chrome, menú ⋮ → Configuración → Configuración de
          sitios → Notificaciones, y permití esta app.
        </li>
        <li>
          En iPhone: Ajustes → Notificaciones → Gestión PyME, y activá
          «Permitir notificaciones».
        </li>
      </ul>
      <p className="mt-2">Después volvé a esta pantalla.</p>
    </>
  ),
};

const SIN_RESPUESTA =
  "No se activaron porque el permiso quedó sin responder. Tocá de nuevo el " +
  "interruptor y elegí «Permitir».";

function textoDeEstado(estado, ocupado) {
  if (estado === null) return "Revisando este dispositivo…";
  if (ocupado) return "Guardando…";
  if (estado === ESTADO.ACTIVO) return "Activadas en este dispositivo.";
  return "Desactivadas en este dispositivo.";
}

export default function SeccionNotificaciones() {
  const { estado, ocupado, fallo, activar, desactivar } =
    useNotificacionesPush();

  const activo = estado === ESTADO.ACTIVO;
  const explicacion = EXPLICACION[estado];
  const deshabilitado = estado === null || ocupado || Boolean(explicacion);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-(--color-texto)">
          Notificaciones
        </h2>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Te avisamos cuando un producto llega a su stock mínimo, aunque no
          tengas la app abierta. Se activan por dispositivo: hacelo en cada
          celular o computadora donde quieras recibirlas.
        </p>
      </div>

      <section className="rounded-(--radius) border-2 border-(--color-borde) px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3
              id="push-etiqueta"
              className="font-extrabold text-(--color-texto)"
            >
              Notificaciones push
            </h3>
            <p
              id="push-estado"
              className="mt-1 text-sm text-(--color-texto-apagado)"
            >
              {textoDeEstado(estado, ocupado)}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={activo}
            aria-labelledby="push-etiqueta"
            aria-describedby="push-estado"
            disabled={deshabilitado}
            onClick={activo ? desactivar : activar}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center
                        rounded-full transition focus:outline-none focus:ring-4
                        focus:ring-(--color-primario-suave)
                        disabled:cursor-not-allowed disabled:opacity-50
                        ${activo ? "bg-(--color-primario)" : "bg-(--color-borde)"}`}
          >
            <span
              aria-hidden="true"
              className={`inline-block size-6 rounded-full bg-(--color-tarjeta)
                          shadow transition-transform
                          ${activo ? "translate-x-7" : "translate-x-1"}`}
            />
          </button>
        </div>

        {explicacion && (
          // En gris y no en rojo: nada de esto es un error de quien usa la app.
          <div
            role="status"
            data-testid="push-explicacion"
            className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3
                       text-sm text-(--color-texto)"
          >
            {explicacion}
          </div>
        )}

        {estado === ESTADO.SIN_RESPUESTA && (
          <p
            role="status"
            className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3
                       text-sm text-(--color-texto)"
          >
            {SIN_RESPUESTA}
          </p>
        )}

        {fallo && (
          <div className="mt-4">
            <AvisoDeError fallo={fallo} />
          </div>
        )}
      </section>
    </div>
  );
}
