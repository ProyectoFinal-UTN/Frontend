import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Lightbulb, RefreshCw } from "lucide-react";
import AvisoDeError from "./AvisoDeError";
import { TIPO, clasificar } from "../services/errores";
import {
  PRIORIDADES,
  TIPOS_DE_RECOMENDACION,
  hayResumenDegradado,
  obtenerRecomendaciones,
} from "../services/asistente";

/**
 * Recomendaciones proactivas del asistente (HU-27, RF6).
 *
 * A diferencia de HU-26, acá nadie pregunta nada: el sistema mira los datos del
 * comercio y propone acciones por su cuenta. Por eso es una sección del
 * dashboard y no un turno del chat: el panel de HU-26 es una conversación de
 * pares pregunta→respuesta, y meter acá una respuesta sin pregunta obligaría a
 * inventar un turno que nadie escribió.
 *
 * **El backend redacta, esta pantalla pinta.** `texto` y `porQue` llegan
 * escritos sin jerga técnica —es el criterio de aceptación de la historia— y se
 * muestran TAL CUAL. No se arman frases nuevas concatenando `datos`: allá
 * `conUnidad()` ya decidió "1 unidad" vs "3 unidades" vs "3 kg", y rehacerlo
 * acá duplicaría esa lógica para terminar escribiendo "2 unidad".
 *
 * Tampoco se reordena la lista: viene ordenada por urgencia (reposición
 * primero, y dentro de cada tipo lo más crítico arriba).
 */

/**
 * Cómo se presenta cada tipo, y si la tarjeta lleva acción.
 *
 * `sin_historial` habla del comercio entero y trae `producto` en `null`: no hay
 * ninguna ficha a la que ir, así que no lleva link. Es además el tipo que más
 * aparece en desarrollo, con pocos datos de prueba cargados.
 */
const PRESENTACION = {
  [TIPOS_DE_RECOMENDACION.REPONER]: { etiqueta: "Para reponer" },
  [TIPOS_DE_RECOMENDACION.BAJA_ROTACION]: { etiqueta: "No se está vendiendo" },
  [TIPOS_DE_RECOMENDACION.SIN_HISTORIAL]: {
    etiqueta: "Todavía sin datos de ventas",
  },
};

/**
 * El badge de prioridad: color Y palabra.
 *
 * Solo color sería inaccesible —quien no distingue el rojo del ámbar se queda
 * sin la información— así que el badge dice "Alta", "Media" o "Baja".
 */
const TONOS_DE_PRIORIDAD = {
  [PRIORIDADES.ALTA]: {
    texto: "Alta",
    clases: "bg-(--color-peligro-suave) text-(--color-peligro)",
  },
  [PRIORIDADES.MEDIA]: {
    texto: "Media",
    clases: "bg-(--color-atencion-suave) text-(--color-atencion)",
  },
  [PRIORIDADES.BAJA]: {
    texto: "Baja",
    clases: "bg-(--color-apagado) text-(--color-texto-apagado)",
  },
};

/** "16:51". La hora sola: el día ya lo dice el encabezado de Inicio. */
function horaDe(generadoEn) {
  const fecha = new Date(generadoEn);

  // Un `generadoEn` que no se puede parsear no tiene que tirar la sección
  // entera abajo: es la línea menos importante de la pantalla.
  if (Number.isNaN(fecha.getTime())) return null;

  return fecha.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    // `hour12: false` explícito: el default de `es-AR` en ICU es de 12 horas y
    // sale "04:51 p. m.", que acá nadie escribe ni lee de un vistazo. En
    // Argentina la hora se dice 16:51. Se vio mirando la pantalla, no en un
    // test: la aserción comparaba contra la misma función y daba verde igual.
    hour12: false,
  });
}

export default function SeccionRecomendaciones() {
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Una vez que el backend dijo que el rol no puede, se deja de ofrecer el
  // botón de actualizar y se muestra solo el aviso. `AvisoDeError` llama a
  // `refrescarPermisos()` ante un 403, y ese refresco puede confirmar que no
  // hay permiso y desmontar esta sección con el aviso adentro: sin latchear,
  // la explicación aparece y desaparece, que es peor que no mostrarla.
  const [sinPermiso, setSinPermiso] = useState(false);

  // Candado de envío, el mismo patrón que el asistente de HU-26: el `disabled`
  // del botón no alcanza porque dos clics en el mismo tick lo ven todavía
  // habilitado —React no re-renderizó entre uno y otro—. Acá importa porque
  // cada llamada puede gastar crédito del proveedor, que es compartido.
  const enVuelo = useRef(false);
  // La respuesta puede volver con la sección ya desmontada (se cerró sesión).
  const montado = useRef(true);

  const idTitulo = useId();

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  /**
   * Pide las recomendaciones y publica el resultado.
   *
   * No prende `cargando` acá adentro: arranca en `true` para la carga inicial,
   * y el refresco manual lo prende en su handler. Un `setCargando(true)`
   * sincrónico en el efecto de montaje dispara un render en cascada, y el
   * linter de React lo rechaza.
   *
   * Cadena de promesa y no `async/await`, como `HistorialMovimientos` e
   * `Inicio`: por la misma regla del linter, que mira si el efecto puede
   * publicar estado de forma sincrónica y no distingue el `await` del medio.
   */
  const pedir = useCallback(() => {
    if (enVuelo.current) return Promise.resolve();

    enVuelo.current = true;

    return obtenerRecomendaciones()
      .then((respuesta) => {
        if (!montado.current) return;

        // `apiFetch` devuelve `null` ante un 2xx sin cuerpo o con un JSON que
        // no se pudo parsear. Guardarlo dejaba la sección en "Buscando
        // sugerencias…" para siempre: un estado de carga que miente, porque ya
        // no hay nada en vuelo. Para este contrato una respuesta vacía no es
        // válida —`resumen` y `modo` nunca son opcionales— así que se trata
        // como lo que es, un fallo, y cae en el `catch` de abajo con su
        // "Reintentar".
        if (!respuesta) {
          throw new Error(
            "No se pudieron leer las sugerencias. Probá de nuevo en un momento.",
          );
        }

        setDatos(respuesta);
        setFallo(null);
      })
      .catch((error) => {
        if (!montado.current) return;

        setFallo(error);
        // `error.tipo` lo pone `apiFetch`; se reclasifica si no vino, para que
        // un error armado a mano en un test se comporte igual.
        if ((error?.tipo ?? clasificar(error)) === TIPO.PERMISO) {
          setSinPermiso(true);
        }
      })
      .finally(() => {
        enVuelo.current = false;
        if (montado.current) setCargando(false);
      });
  }, []);

  useEffect(() => {
    pedir();
  }, [pedir]);

  /** El refresco manual: prende el indicador y vuelve a pedir. */
  const actualizar = useCallback(() => {
    if (enVuelo.current) return;

    setCargando(true);
    pedir();
  }, [pedir]);

  // Los datos viejos se mantienen mientras se refresca: vaciar la lista para
  // volver a llenarla un segundo después se lee como que no hay nada.
  const recomendaciones = datos?.recomendaciones ?? [];
  const hora = datos ? horaDe(datos.generadoEn) : null;

  return (
    <section
      aria-labelledby={idTitulo}
      data-testid="recomendaciones"
      className="mt-8"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          id={idTitulo}
          className="flex items-center gap-2 text-xl font-extrabold text-(--color-texto)"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--color-acento) text-(--color-acento-texto)">
            <Lightbulb aria-hidden="true" className="size-5" />
          </span>
          Sugerencias para tu negocio
        </h2>

        {/*
          Solo cuando ya hay algo que refrescar. Antes de la primera respuesta
          no hay nada que actualizar, y el botón decía "Actualizando…" —porque
          `cargando` arranca en `true`— arriba del "Buscando sugerencias…":
          dos indicadores del mismo estado, uno con la palabra equivocada. Si
          la primera carga falla, la salida es el "Reintentar" del aviso.
        */}
        {datos && !sinPermiso && (
          <button
            type="button"
            onClick={actualizar}
            disabled={cargando}
            data-testid="recomendaciones-actualizar"
            className="flex items-center gap-2 rounded-full border-2
                       border-(--color-borde) px-4 py-2 text-sm font-bold
                       text-(--color-texto) transition
                       hover:bg-(--color-apagado)
                       disabled:cursor-not-allowed disabled:opacity-50
                       focus:outline-none focus:ring-4
                       focus:ring-(--color-primario-suave)"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {cargando ? "Actualizando…" : "Actualizar"}
          </button>
        )}
      </div>

      {/*
        Un fallo con datos en pantalla se avisa ARRIBA y no en lugar de ellos.
        Si un refresco se cae, lo que ya se estaba viendo seguía siendo válido
        un segundo antes: tirarlo abajo es perder información buena por un
        problema de red, y contradice la misma razón por la que la lista no se
        vacía mientras se refresca.

        Las dos excepciones en las que el aviso SÍ toma el lugar del contenido:
        la primera carga —no hay nada que conservar— y un 403, donde los datos
        dejaron de corresponderle a este rol y no se siguen mostrando.

        `AvisoDeError` decide el texto y la salida según el tipo; un 403 nunca
        manda al login.
      */}
      {fallo && (
        <div className={datos && !sinPermiso ? "mb-4" : undefined}>
          <AvisoDeError
            fallo={fallo}
            alReintentar={sinPermiso ? undefined : actualizar}
          />
        </div>
      )}

      {!datos ? (
        // Sin `fallo` todavía no llegó nada; con `fallo` el aviso ya ocupa el
        // lugar y este texto mentiría diciendo que sigue buscando.
        !fallo && (
          <p className="text-(--color-texto-apagado)">Buscando sugerencias…</p>
        )
      ) : sinPermiso ? null : (
        <>
          <Encabezado datos={datos} hora={hora} />

          {recomendaciones.length === 0 ? (
            <Vacio />
          ) : (
            <ul
              aria-label="Sugerencias"
              className="mt-4 grid gap-4 lg:grid-cols-2"
            >
              {recomendaciones.map((recomendacion) => (
                <Tarjeta
                  // No el índice: con índice React reusa el DOM de una tarjeta
                  // para otro producto al refrescar, y el `aria-label` del link
                  // queda nombrando a otro con el foco encima. El backend
                  // garantiza que esta clave es única (deduplica por producto
                  // entre `reponer` y `baja_rotacion`, y `sin_historial` es como
                  // máximo una).
                  key={`${recomendacion.tipo}:${recomendacion.producto?.id ?? "comercio"}`}
                  recomendacion={recomendacion}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Encabezado({ datos, hora }) {
  return (
    <div className="rounded-[2rem] border-2 border-(--color-borde) bg-(--color-tarjeta) p-6 shadow-sm">
      {/*
        Sin `aria-live`: el resumen está cacheado 10 minutos del lado del
        servidor, así que un refresco suele devolver el mismo párrafo, y
        anunciarlo de nuevo es ruido para quien usa lector de pantalla.
        `whitespace-pre-line` por si el modelo lo arma en más de un párrafo.
      */}
      <p
        data-testid="recomendaciones-resumen"
        className="whitespace-pre-line text-(--color-texto)"
      >
        {datos.resumen}
      </p>

      {hora && (
        <p
          data-testid="recomendaciones-generado-en"
          className="mt-2 text-xs text-(--color-texto-apagado)"
        >
          {/*
            Esta línea es la única señal de que el refresco ocurrió, y la que
            evita el "hice clic y no pasó nada" sin mentir sobre el resumen:
            `generadoEn` se recalcula en cada llamada aunque el párrafo vuelva
            idéntico.
          */}
          Actualizado a las {hora}
        </p>
      )}

      {hayResumenDegradado(datos) && (
        // El aviso es sobre el PÁRRAFO DE ARRIBA, no sobre la lista: con
        // `limitado` las recomendaciones llegan completas. La última oración
        // existe para que nadie lea esto y desconfíe de lo que tiene debajo.
        <p
          data-testid="recomendaciones-resumen-limitado"
          className="mt-3 rounded-(--radius) bg-(--color-atencion-suave) px-3
                     py-2 text-xs font-semibold text-(--color-atencion)"
        >
          El resumen de arriba lo armó el sistema porque el asistente
          inteligente no está disponible en este momento. Las sugerencias de
          abajo no cambian.
        </p>
      )}
    </div>
  );
}

/**
 * Sin ninguna recomendación.
 *
 * Se decide por `recomendaciones.length === 0` y NO por
 * `modo === "sin_novedades"`, aunque hoy el backend los haga equivalentes. Son
 * dos preguntas distintas —qué hay para mostrar, y de dónde salió el resumen—
 * y cada una se responde con su propio dato.
 *
 * Ojo con qué es "vacío": un comercio sin ventas NO cae acá, devuelve una
 * tarjeta `sin_historial`, que es contenido. Esto es el comercio ordenado.
 *
 * El texto NO repite que no hay nada: eso ya lo dice el `resumen` de arriba
 * ("Por ahora no tengo sugerencias para hacerte: no hay productos por debajo
 * del mínimo y los que tenés se están moviendo"). Decirlo dos veces, y encima
 * arrancando con las mismas palabras, se lee como un error de armado. Lo que
 * agrega esta línea es lo único que el resumen no dice: que esto se va a
 * poblar solo, así que no hay que volver a mirar.
 */
function Vacio() {
  return (
    <p
      data-testid="recomendaciones-vacio"
      className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm
                 font-semibold text-(--color-texto)"
    >
      Te aviso acá cuando algo baje del mínimo o deje de moverse.
    </p>
  );
}

function Tarjeta({ recomendacion }) {
  const { tipo, prioridad, producto, texto, porQue, datos } = recomendacion;

  const presentacion = PRESENTACION[tipo];
  // Un `prioridad` que el backend agregue mañana no tiene que dejar un badge
  // sin estilo; cae en la más baja, que es la que menos grita.
  const tono = TONOS_DE_PRIORIDAD[prioridad] ?? TONOS_DE_PRIORIDAD[PRIORIDADES.BAJA];

  return (
    <li
      data-testid={`recomendacion-${tipo}`}
      data-prioridad={prioridad}
      className="flex flex-col rounded-[2rem] border-2 border-(--color-borde)
                 bg-(--color-tarjeta) p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${tono.clases}`}
        >
          {tono.texto}
        </span>
        {presentacion && (
          <span className="text-xs font-bold text-(--color-texto-apagado) uppercase">
            {presentacion.etiqueta}
          </span>
        )}
      </div>

      {/*
        `producto?.nombre` y no `producto.nombre`: `sin_historial` lo trae en
        `null` porque habla del comercio entero. Ahí el título es la etiqueta
        del tipo, que ya está arriba, así que no se dibuja ninguno.
      */}
      {producto?.nombre && (
        <p className="mt-3 font-extrabold text-(--color-texto)">
          {producto.nombre}
        </p>
      )}

      {/* Tal cual llega del backend. No se recorta ni se reformatea. */}
      <p className="mt-2 text-(--color-texto)">{texto}</p>
      <p className="mt-2 text-sm text-(--color-texto-apagado)">{porQue}</p>

      {/*
        El único campo de `datos` que se muestra, y solo porque es un string sin
        número: cualquier cifra de `datos` ya está dentro de `texto` y `porQue`
        con su unidad y su concordancia resueltas allá.
      */}
      {datos?.categoria && (
        <p className="mt-3 text-xs text-(--color-texto-apagado)">
          Categoría: {datos.categoria}
        </p>
      )}

      {/*
        La acción directa, solo cuando hay un producto al que ir. Mismo texto
        visible y mismo nombre accesible que la fila del catálogo
        (`SeccionProductos`), así quien ya lo usó no tiene que aprender otro.
      */}
      {producto?.id && (
        <Link
          to={`/productos/${producto.id}`}
          aria-label={`Ver stock de ${producto.nombre}`}
          className="mt-4 self-start rounded-full bg-(--color-primario-suave)
                     px-4 py-2 text-sm font-bold text-(--color-primario)
                     transition hover:opacity-90 focus:outline-none
                     focus:ring-4 focus:ring-(--color-primario-suave)"
        >
          Ver stock
        </Link>
      )}
    </li>
  );
}
