import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import AvisoDeError from "./AvisoDeError";
import { TIPO, clasificar } from "../services/errores";
import { obtenerAlertas } from "../services/alertas";

/**
 * Panel de alertas de reposición del dashboard (HU-17, SCRUM-129).
 *
 * Los productos que alcanzaron su umbral mínimo, de la más urgente a la menos.
 * Es la respuesta a "qué necesito reponer", y vive en Inicio porque es la
 * primera pantalla que se abre.
 *
 * ## Lo que NO hace, a propósito
 *
 * - **No decide qué está en falta.** Eso lo resuelve el backend dentro de la
 *   misma transacción que mueve el stock. Acá no se compara stock contra
 *   umbral ni se resta nada: `faltanteHastaElUmbral` ya viene calculado.
 * - **No reordena.** El orden del backend es por urgencia y no coincide con
 *   ordenar por `faltanteHastaElUmbral`, así que reordenar cambiaría la lista.
 * - **No ofrece descartar una alerta.** No hay endpoint: se cierran solas
 *   cuando el stock vuelve a superar el umbral.
 * - **No muestra "la ubicación" de la alerta.** No existe: el umbral es por
 *   producto y se compara contra el total del comercio (2 en el depósito + 1
 *   en el salón = 3 contra un mínimo de 10). Se muestra el desglose completo.
 *
 * ## Cómo sabe si está cargando, sin un estado de "cargando"
 *
 * Mismo mecanismo que `HistorialComprasProveedor` (HU-21): la respuesta se
 * guarda junto a la MARCA de lo que se pidió (`clave`), y `cargando` se deriva
 * en el render comparando esa marca con lo que la pantalla está pidiendo
 * ahora. Así ningún handler tiene que acordarse de prender nada, y
 * `react-hooks/set-state-in-effect` —que en este repo es ERROR— no tiene nada
 * que objetar: el único `setState` pasa dentro de un `.then`/`.catch`.
 */

/**
 * Cada cuánto se vuelve a pedir el listado.
 *
 * "Tiempo real" acá es refresco del cliente: no hay websocket y el backend
 * sugiere 30–60 s. Se eligió el extremo largo porque el aviso urgente ya lo
 * manda el push de HU-18 en el momento en que nace la alerta, y el caso en que
 * la frescura realmente importa —volver a la pestaña después de un rato— lo
 * cubre el refresco por foco, que es inmediato.
 *
 * Exportada para que el test no dependa de un número mágico.
 */
export const CADENCIA_DE_REFRESCO_MS = 60_000;

const CLASES_BOTON_SECUNDARIO =
  "rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-4 py-2 text-sm font-bold text-(--color-texto) transition " +
  "hover:border-(--color-primario) disabled:opacity-50 " +
  "disabled:hover:border-(--color-borde)";

/** Cuándo saltó la alerta, en el formato que se lee acá. */
function formatearFecha(iso) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeccionAlertas() {
  // La respuesta se guarda junto a la marca de la consulta de la que salió.
  // Guardar esa marca es lo que deja derivar `cargando` sin un estado que haya
  // que acordarse de prender en cada botón.
  const [carga, setCarga] = useState({
    clave: null,
    resultado: null,
    error: null,
  });

  // La página vive en estado local y NO en la URL, a diferencia de HU-21: esto
  // es un widget de `/`, y meterle un `?pagina=2` al dashboard ensucia una URL
  // que se comparte y se la pelearía con cualquier otro widget que mañana
  // quiera sus propios parámetros.
  const [pagina, setPagina] = useState(1);

  // Reintentar es pedir lo mismo de nuevo. Como contador y no como una llamada
  // suelta, para que la pantalla se entere de que hay algo en vuelo igual que
  // con cualquier otro cambio.
  const [intento, setIntento] = useState(0);

  // Una vez que el backend dijo que el rol no puede, se deja de mostrar la
  // lista y queda solo el aviso. `AvisoDeError` llama a `refrescarPermisos()`
  // ante un 403, y ese refresco puede confirmar que no hay permiso y desmontar
  // esta sección con el aviso adentro: sin latchear, la explicación aparece y
  // desaparece, que es peor que no mostrarla.
  const [sinPermiso, setSinPermiso] = useState(false);

  // Cada pedido lleva un número. El polling, el foco y un clic en "Siguiente"
  // pueden solapar pedidos sin que el usuario toque nada, y la respuesta del
  // primero puede llegar después que la del segundo: solo se acepta la del
  // último. Es el bug de HU-21 —datos viejos mostrados como nuevos— y acá es
  // más fácil de disparar, porque la pantalla se pide sola.
  const ultimoPedido = useRef(0);

  // Candado SOLO para los refrescos de fondo. Si frenara también a los que
  // nacen de un cambio de `clave`, un clic en "Siguiente" durante la carga
  // inicial se descartaría y `cargando` no bajaría nunca.
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

  // Lo que la pantalla está pidiendo ahora mismo. El tick del polling NO entra
  // acá: un refresco de fondo no tiene que verse ni anunciarse como una carga.
  const clave = `${pagina}|${intento}`;
  const cargando = carga.clave !== clave;

  const { resultado, error } = carga;

  // Si tiene sentido seguir preguntando solo.
  //
  // Un fallo de red se cura solo, y el polling es justamente lo que lo cura:
  // ahí hay que insistir. Un 401 o un 403 no se curan solos —el backend va a
  // contestar lo mismo hasta que alguien vuelva a entrar o le den el permiso—,
  // así que insistir cada minuto no arregla nada y llena el log del backend de
  // rechazos. Se mira el tipo y no el status para que los dos 403 de cuenta
  // (sin comercio, rol inválido) caigan del mismo lado.
  const tipoDeFallo = error ? (error.tipo ?? clasificar(error)) : null;
  const convieneInsistir = tipoDeFallo === null || tipoDeFallo === TIPO.GENERAL;

  const cargar = useCallback(
    /**
     * @param {boolean} deFondo si lo disparó el polling o el foco, y no la
     *   persona. Un refresco de fondo se saltea si ya hay uno en vuelo.
     */
    (deFondo = false) => {
      if (deFondo && enVuelo.current) {
        return Promise.resolve();
      }

      ultimoPedido.current += 1;
      const numero = ultimoPedido.current;
      enVuelo.current = true;

      // Cadena de promesa y no `async/await`, como el resto del repo: el
      // linter mira si el efecto puede publicar estado de forma sincrónica y
      // no distingue el `await` del medio.
      return obtenerAlertas({ pagina })
        .then((respuesta) => {
          if (!montado.current || numero !== ultimoPedido.current) return;

          // `apiFetch` devuelve `null` ante un 2xx sin cuerpo o con un JSON
          // que no se pudo parsear. Guardarlo dejaba el panel en "Buscando…"
          // para siempre: un estado de carga que miente, porque ya no hay nada
          // en vuelo. Para este contrato `alertas` y `paginacion` nunca son
          // opcionales, así que se trata como el fallo que es.
          if (!respuesta) {
            throw new Error(
              "No se pudieron leer las alertas. Probá de nuevo en un momento.",
            );
          }

          setCarga({ clave, resultado: respuesta, error: null });
        })
        .catch((fallo) => {
          if (!montado.current || numero !== ultimoPedido.current) return;

          // Los datos anteriores se conservan: lo que estaba en pantalla era
          // válido un segundo antes, y el aviso va ARRIBA, no en su lugar.
          setCarga((previa) => ({
            clave,
            resultado: previa.resultado,
            error: fallo,
          }));

          // `fallo.tipo` lo pone `apiFetch`; se reclasifica si no vino, para
          // que un error armado a mano en un test se comporte igual.
          if ((fallo?.tipo ?? clasificar(fallo)) === TIPO.PERMISO) {
            setSinPermiso(true);
          }
        })
        .finally(() => {
          // Solo el último pedido levanta el candado. Si lo levantara uno que
          // ya fue superado, un tick del polling se colaría encima del que
          // todavía está en vuelo.
          if (numero === ultimoPedido.current) {
            enVuelo.current = false;
          }
        });
      // Los setters son estables; van porque el React Compiler los infiere
      // como dependencias y sin ellos descarta la memoización.
    },
    [clave, pagina, setCarga, setSinPermiso],
  );

  // Carga inicial, cambio de página y reintento: los tres cambian `clave`, que
  // cambia la identidad de `cargar`, que vuelve a disparar este efecto.
  useEffect(() => {
    cargar();
  }, [cargar]);

  // Refresco de fondo. Llama a `cargar(true)`, que escribe la MISMA `clave`:
  // así el panel se actualiza sin mostrar "Actualizando…" ni mover `aria-busy`
  // —que es lo que los page objects de Infraestructura esperan para saber que
  // la carga terminó, y que un tick cualquiera volvería intermitente—.
  useEffect(() => {
    // Con un 401 o un 403 no se programa nada: ver `convieneInsistir`. Cuando
    // una carga vuelve a salir bien el error se limpia, esto se vuelve a montar
    // y el refresco arranca de nuevo.
    if (!convieneInsistir) {
      return undefined;
    }

    function refrescar() {
      // Con la pestaña en segundo plano no se pide nada: el reloj sigue
      // latiendo, que es barato, pero no se gasta una request que nadie va a
      // mirar. Al volver, `visibilitychange` dispara el refresco en el acto,
      // sin esperar el tick.
      if (document.visibilityState === "visible") {
        cargar(true);
      }
    }

    const reloj = setInterval(refrescar, CADENCIA_DE_REFRESCO_MS);
    // `visibilitychange` salta también al ocultar la pestaña; la guarda de
    // arriba filtra ese caso. `focus` cubre volver a la ventana sin que la
    // pestaña hubiera estado oculta (otra app encima).
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener("focus", refrescar);

    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", refrescar);
      window.removeEventListener("focus", refrescar);
    };
  }, [cargar, convieneInsistir]);

  const paginacion = resultado?.paginacion;
  const alertas = resultado?.alertas ?? [];

  const vacio = paginacion?.total === 0;
  // 200 con `alertas: []` y total > 0: se pidió una página más allá del final,
  // o se resolvieron alertas mientras se la estaba mirando. NO es un error, y
  // no tiene que verse como uno.
  const paginaFueraDeRango = paginacion?.total > 0 && alertas.length === 0;

  const muestraDatos = Boolean(resultado) && !sinPermiso;
  const muestraPaginacion =
    muestraDatos && paginacion.totalPaginas > 1 && !paginaFueraDeRango;

  // `limite` sale SIEMPRE de la respuesta y nunca del valor que se pidió: el
  // backend recorta en silencio cualquier límite por encima de 200, y un
  // contador armado con lo pedido mentiría.
  const primeraFila =
    muestraDatos && alertas.length > 0
      ? (paginacion.pagina - 1) * paginacion.limite + 1
      : 0;

  /**
   * Cambia de página.
   *
   * Sin el `window.scrollTo({ top: 0 })` que hacen las pantallas de historial:
   * allá la lista ES la pantalla y volver arriba deja los controles a la
   * vista, pero acá el panel está en el medio del dashboard y saltar al
   * encabezado alejaría de lo que se acaba de pedir.
   */
  function irAPagina(siguiente) {
    setPagina(siguiente);
  }

  function reintentar() {
    setIntento((previo) => previo + 1);
  }

  return (
    <section
      aria-labelledby={idTitulo}
      data-testid="alertas"
      aria-busy={cargando}
      className="mt-8"
    >
      <h2
        id={idTitulo}
        className="mb-4 flex items-center gap-2 text-xl font-extrabold text-(--color-texto)"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--color-atencion-suave) text-(--color-atencion)">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        Hay que reponer
      </h2>

      {/*
        Un fallo con datos en pantalla se avisa ARRIBA y no en lugar de ellos:
        lo que se estaba viendo seguía siendo válido un segundo antes, y
        tirarlo abajo es perder información buena por un problema de red.

        Las dos excepciones en las que el aviso SÍ toma el lugar del contenido:
        la primera carga —no hay nada que conservar— y un 403, donde los datos
        dejaron de corresponderle a este rol.

        `AvisoDeError` decide el texto y la salida según el tipo (401, 403 de
        permiso, los dos 403 de cuenta, y todo lo demás); un 403 nunca manda al
        login. El `div` con testid le da al E2E un ancla estable sin pisar los
        testids propios del aviso.
      */}
      {error && (
        <div
          data-testid="alertas-error"
          className={muestraDatos ? "mb-4" : undefined}
        >
          <AvisoDeError
            fallo={error}
            alReintentar={sinPermiso ? undefined : reintentar}
          />
        </div>
      )}

      {!resultado ? (
        // Sin `error` todavía no llegó nada; con `error` el aviso ya ocupa el
        // lugar y este texto mentiría diciendo que sigue buscando.
        !error && (
          <p data-testid="alertas-cargando" className="text-(--color-texto-apagado)">
            Buscando lo que hay que reponer…
          </p>
        )
      ) : sinPermiso ? null : (
        <>
          {/*
            La lista se atenúa en vez de desaparecer: con conexión lenta, un
            salto a blanco y vuelta se lee como que ya no hay nada que reponer,
            que es justo la conclusión opuesta a la verdadera.
          */}
          <div className={cargando ? "opacity-50 transition-opacity" : ""}>
            {!vacio && (
              <p
                data-testid="alertas-contador"
                aria-live="polite"
                className="mb-3 text-sm tabular-nums text-(--color-texto-apagado)"
              >
                {/*
                  Durante el polling este texto solo cambia si la cantidad de
                  alertas cambió de verdad, así que el `aria-live` no es ruido:
                  anuncia una novedad real. "Actualizando…" no aparece en los
                  refrescos de fondo porque esos no mueven `cargando`.
                */}
                {cargando
                  ? "Actualizando…"
                  : paginacion.total === 1
                    ? "1 producto para reponer"
                    : muestraPaginacion
                      ? `${primeraFila} a ${primeraFila + alertas.length - 1} de ${paginacion.total}`
                      : `${paginacion.total} productos para reponer`}
              </p>
            )}

            {vacio && (
              <p
                data-testid="alertas-vacio"
                className="rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm
                           font-semibold text-(--color-texto)"
              >
                No tenés nada por debajo del mínimo. Cuando un producto llegue a
                su umbral, aparece acá.
              </p>
            )}

            {paginaFueraDeRango && (
              /*
                Gris y no rojo, y con la salida puesta. Se ve parecido al vacío
                de arriba y significa lo contrario: ahí no hay nada que
                reponer, acá sí hay y se está mirando una página que ya no
                existe. Por eso llevan testids distintos: con uno solo, un test
                pasaría en el caso equivocado sin que nadie se entere.
              */
              <div
                data-testid="alertas-pagina-vacia"
                className="rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm
                           text-(--color-texto-apagado)"
              >
                <p>Esa página ya no tiene alertas.</p>
                <button
                  type="button"
                  onClick={() => irAPagina(1)}
                  className={`mt-2 ${CLASES_BOTON_SECUNDARIO}`}
                >
                  Volver a la primera
                </button>
              </div>
            )}

            {alertas.length > 0 && (
              <ul
                data-testid="alertas-lista"
                aria-label="Productos para reponer"
                className="grid gap-4 lg:grid-cols-2"
              >
                {alertas.map((alerta) => (
                  // No el índice: con índice React reusa el DOM de una fila
                  // para otro producto al refrescar, y el nombre accesible del
                  // link queda nombrando a otro con el foco encima.
                  <Fila key={alerta.id} alerta={alerta} />
                ))}
              </ul>
            )}
          </div>

          {muestraPaginacion && (
            <nav
              aria-label="Paginación"
              data-testid="alertas-paginacion"
              className="mt-6 flex items-center justify-between gap-3"
            >
              {/*
                Los controles se mueven con `pagina` —lo que se PIDIÓ— y no con
                `paginacion.pagina` —lo que volvió—. Mientras un cambio de
                página está en vuelo las dos difieren, y con la segunda los
                botones mienten: "Siguiente" vuelve a pedir la página que ya se
                está pidiendo, y en la última página sigue habilitado porque la
                respuesta vieja dice que todavía queda una. `totalPaginas` sí
                sale de la respuesta: no depende de qué página se esté mirando.
              */}
              <button
                type="button"
                data-testid="pagina-anterior"
                onClick={() => irAPagina(pagina - 1)}
                disabled={pagina <= 1}
                className={CLASES_BOTON_SECUNDARIO}
              >
                ← Anterior
              </button>
              <span
                data-testid="pagina-actual"
                className="text-sm tabular-nums text-(--color-texto-apagado)"
              >
                Página {pagina} de {paginacion.totalPaginas}
              </span>
              <button
                type="button"
                data-testid="pagina-siguiente"
                onClick={() => irAPagina(pagina + 1)}
                disabled={pagina >= paginacion.totalPaginas}
                className={CLASES_BOTON_SECUNDARIO}
              >
                Siguiente →
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function Fila({ alerta }) {
  const { producto, ubicaciones, proveedorSugerido, proveedores } = alerta;
  const unidad = producto.unidadMedida;

  // La foto de cuando saltó la alerta sirve para una sola cosa que vale la
  // pena decir: que el problema empeoró mientras nadie hizo nada. Si el stock
  // no bajó, la línea no aportaría nada y estaría en todas las filas. El
  // `umbralAlGenerar` no se usa: un cambio de umbral es asunto de HU-16 y
  // mezclarlo acá confundiría la causa del faltante.
  const bajoDesdeElAviso = alerta.stockActual < alerta.stockAlGenerar;

  // El sugerido es simplemente el primero por nombre. Los demás se nombran
  // para que no parezca que es el único a quien pedirle: la relación es N:M y
  // el modelo no guarda cuál es el principal.
  const otros = proveedores.slice(1);

  return (
    <li
      data-testid="alerta-fila"
      data-alerta-id={alerta.id}
      data-producto-id={producto.id}
      className="flex flex-col rounded-[2rem] border-2 border-(--color-borde)
                 bg-(--color-tarjeta) p-6 shadow-sm"
    >
      <p className="font-extrabold text-(--color-texto)">{producto.nombre}</p>

      {/*
        El faltante ya viene calculado por el backend. Un producto justo en el
        mínimo da 0 y aparece igual en el listado: alcanzar el umbral ya es
        estar en falta. Los dos casos llevan testids distintos porque dicen
        cosas distintas —"comprá 7" y "estás al límite"— y se parecen entre sí.
      */}
      {alerta.faltanteHastaElUmbral > 0 ? (
        <p
          data-testid="alerta-faltante"
          aria-label={`Faltan ${alerta.faltanteHastaElUmbral} ${unidad} para el mínimo`}
          className="mt-2 text-lg font-extrabold tabular-nums text-(--color-atencion)"
        >
          Faltan {alerta.faltanteHastaElUmbral} {unidad} para el mínimo
        </p>
      ) : (
        <p
          data-testid="alerta-faltante-cero"
          className="mt-2 text-lg font-extrabold text-(--color-atencion)"
        >
          Está justo en el mínimo
        </p>
      )}

      {/*
        Los valores VIVOS, que es lo que pide la subtarea. El `aria-label` dice
        el dato completo porque el `textContent` sale pegado ("3unidad") y
        atarse a eso fue una trampa en HU-21.
      */}
      <p
        data-testid="alerta-stock"
        aria-label={`Te quedan ${alerta.stockActual} ${unidad}, el mínimo es ${alerta.umbralMinimo}`}
        className="mt-1 text-sm tabular-nums text-(--color-texto)"
      >
        Te quedan <strong>{alerta.stockActual}</strong> {unidad} · mínimo{" "}
        {alerta.umbralMinimo}
      </p>

      {bajoDesdeElAviso && (
        <p
          data-testid="alerta-bajo-desde-el-aviso"
          className="mt-1 text-sm tabular-nums font-semibold text-(--color-peligro)"
        >
          Bajó de {alerta.stockAlGenerar} a {alerta.stockActual} desde el aviso
        </p>
      )}

      {/*
        Dónde está lo que queda, COMPLETO. No existe "la ubicación de la
        alerta": el umbral es por producto y se compara contra el total del
        comercio, así que mostrar solo la primera diría que el resto no está.

        Sin `<ul>`: la tarjeta ya es un `<li>` y los tests cuentan las filas por
        `listitem`.
      */}
      {ubicaciones.length > 0 ? (
        <div
          data-testid="alertas-ubicaciones"
          className="mt-3 flex flex-wrap gap-2 text-sm"
        >
          {ubicaciones.map((ubicacion) => (
            <span
              key={ubicacion.id}
              data-testid="alerta-ubicacion"
              data-ubicacion-id={ubicacion.id}
              aria-label={`${ubicacion.nombre}: ${ubicacion.cantidad} ${unidad}`}
              className="rounded-full bg-(--color-apagado) px-3 py-1 tabular-nums
                         text-(--color-texto)"
            >
              {ubicacion.nombre} <strong>{ubicacion.cantidad}</strong>
            </span>
          ))}
        </div>
      ) : (
        <p
          data-testid="alerta-sin-ubicaciones"
          className="mt-3 text-sm text-(--color-texto-apagado)"
        >
          No queda nada en ninguna ubicación.
        </p>
      )}

      {/*
        "Sugerido" y nunca "principal": el modelo no guarda cuál lo es. El
        teléfono va como link para llamar desde el celular, igual que en HU-27.
      */}
      {proveedorSugerido ? (
        <div data-testid="alerta-proveedor-sugerido" className="mt-3 text-sm">
          <p className="font-bold text-(--color-texto)">
            Sugerido: {proveedorSugerido.nombre}
          </p>
          <p className="text-(--color-texto)">
            {proveedorSugerido.telefono && (
              <a
                href={`tel:${proveedorSugerido.telefono.replace(/[^\d+]/g, "")}`}
                className="text-(--color-primario) underline"
              >
                {proveedorSugerido.telefono}
              </a>
            )}
            {proveedorSugerido.telefono && proveedorSugerido.correo && " · "}
            {proveedorSugerido.correo && (
              <a
                href={`mailto:${proveedorSugerido.correo}`}
                className="text-(--color-primario) underline"
              >
                {proveedorSugerido.correo}
              </a>
            )}
          </p>
        </div>
      ) : (
        <p
          data-testid="alerta-sin-proveedor"
          className="mt-3 text-sm text-(--color-texto-apagado)"
        >
          Este producto no tiene proveedor asociado.
        </p>
      )}

      {otros.length > 0 && (
        <p
          data-testid="alerta-otros-proveedores"
          className="mt-1 text-sm text-(--color-texto-apagado)"
        >
          También se lo podés pedir a{" "}
          {otros.map((proveedor) => proveedor.nombre).join(", ")}
        </p>
      )}

      <p
        data-testid="alerta-generada-en"
        className="mt-3 text-xs text-(--color-texto-apagado)"
      >
        Avisado el {formatearFecha(alerta.generadaEn)}
      </p>

      {/*
        "Ver el detalle de" y no "Ver stock de": las sugerencias de HU-27 usan
        ese segundo texto y muestran los MISMOS productos en el MISMO
        dashboard, así que dos links con el mismo nombre accesible romperían
        cualquier búsqueda por nombre. Tampoco contiene ninguno de los nombres
        de la navegación, que es lo que exige el contrato de `Inicio`.
      */}
      <Link
        to={`/productos/${producto.id}`}
        aria-label={`Ver el detalle de ${producto.nombre}`}
        className="mt-4 self-start rounded-full bg-(--color-primario-suave)
                   px-4 py-2 text-sm font-bold text-(--color-primario)
                   transition hover:opacity-90 focus:outline-none
                   focus:ring-4 focus:ring-(--color-primario-suave)"
      >
        Ver el detalle
      </Link>
    </li>
  );
}
