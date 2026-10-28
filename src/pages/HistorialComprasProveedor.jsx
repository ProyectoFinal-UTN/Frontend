import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AvisoDeError from "../components/AvisoDeError";
import Campo from "../components/Campo";
import { obtenerHistorialDeCompras } from "../services/proveedores";

/**
 * Historial de compras a un proveedor (HU-21).
 *
 * Responde la pregunta de la historia —cómo viene la relación comercial con
 * este proveedor— con lo único que el libro de movimientos puede contestar:
 * volumen. **No hay montos.** El libro no guarda precio ni costo, `resumen.montos`
 * llega siempre en null y acá no se dibuja ninguna columna de importe ni total
 * gastado. Lo que se muestra es cuántas compras, cuántas unidades y entre qué
 * fechas.
 *
 * Es una ruta propia (`/proveedores/:id/compras`) y no un panel dentro de la
 * fila del directorio por una razón concreta: el directorio lista solo
 * proveedores activos, y este historial tiene que poder verse para uno dado de
 * baja. Por eso el título sale del bloque `proveedor` de la respuesta y **no de
 * una segunda llamada a `GET /proveedores/:id`**, que para un proveedor dado de
 * baja responde 404 y tiraría abajo una pantalla que el backend sí sabe servir.
 *
 * Los filtros viven en la URL, igual que en `HistorialMovimientos`: así el
 * período sobrevive a una recarga y el link se puede compartir.
 */

const CLASES_BOTON_SECUNDARIO =
  "rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-4 py-2 text-sm font-bold text-(--color-texto) transition " +
  "hover:border-(--color-primario) disabled:opacity-50 " +
  "disabled:hover:border-(--color-borde)";

/** Fecha y hora de una compra, en el formato que se lee acá. */
function formatearFecha(iso) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Solo el día, para los extremos del resumen. Sin compras en el período el
 * backend manda null, y un `new Date(null)` se vería como "Invalid Date".
 */
function formatearDia(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Lee el período y la página de la URL. Lo que no está queda como "". */
function leerFiltros(parametros) {
  const pagina = Number.parseInt(parametros.get("pagina"), 10);
  return {
    desde: parametros.get("desde") ?? "",
    hasta: parametros.get("hasta") ?? "",
    pagina: pagina > 1 ? pagina : 1,
  };
}

/**
 * Un rango al revés no es algo que el backend pueda resolver mejor: responde
 * 400. Se avisa acá y no se consulta, para que el error aparezca al lado de las
 * fechas. Es comodidad, no autoridad: si igual llega un 400, manda el backend.
 */
function errorDeRango({ desde, hasta }) {
  return desde && hasta && desde > hasta
    ? "La fecha «Desde» no puede ser posterior a «Hasta»."
    : "";
}

/**
 * Las cuatro métricas del período. Son las que el contrato sí puede dar, y
 * ninguna se calcula acá: todas vienen de `resumen`, que el backend computa
 * sobre **todo el período filtrado** y no sobre la página que se está viendo.
 * Sumar las cantidades de `compras` daría el total de la página —24 donde el
 * período tiene 912— y el número cambiaría al paginar, que es justo lo que no
 * tiene que pasar.
 */
function ResumenDelPeriodo({ resumen }) {
  const metricas = [
    { id: "compras", etiqueta: "Compras", valor: resumen.compras },
    { id: "unidades", etiqueta: "Unidades", valor: resumen.unidades },
    { id: "primera", etiqueta: "Primera", valor: formatearDia(resumen.primeraCompra) },
    { id: "ultima", etiqueta: "Última", valor: formatearDia(resumen.ultimaCompra) },
  ];

  return (
    <section
      aria-label="Resumen del período"
      data-testid="historial-compras-resumen"
      className="mb-6 rounded-(--radius) border-2 border-(--color-borde)
                 bg-(--color-tarjeta) px-4 py-4"
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metricas.map(({ id, etiqueta, valor }) => (
          <div key={id}>
            <dt className="text-sm text-(--color-texto-apagado)">{etiqueta}</dt>
            <dd
              data-testid={`resumen-${id}`}
              className="text-xl font-extrabold tabular-nums text-(--color-texto)"
            >
              {valor}
            </dd>
          </div>
        ))}
      </dl>

      {/*
        La ausencia de importes es una decisión del contrato, no un dato que
        falta cargar. Dicho acá para que nadie la lea como un bug.
      */}
      <p className="mt-3 text-sm text-(--color-texto-apagado)">
        El sistema registra el volumen de lo que comprás, no los importes.
      </p>
    </section>
  );
}

function Compra({ compra }) {
  return (
    <li
      data-testid="compra-fila"
      data-compra-id={compra.id}
      className="flex flex-col gap-2 rounded-(--radius) border-2
                 border-(--color-borde) bg-(--color-tarjeta) px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-(--color-texto)">
            {compra.producto.nombre}
            {/*
              Un producto dado de baja al que igual se le compró en su momento
              sigue siendo parte del historial: la fila se muestra. Esconderla
              haría que las unidades del resumen no cerraran con lo que se ve.
            */}
            {!compra.producto.activo && (
              <span
                data-testid="producto-dado-de-baja"
                className="ml-2 text-xs font-semibold text-(--color-texto-apagado)"
              >
                (dado de baja)
              </span>
            )}
          </p>
          <time
            dateTime={compra.fecha}
            className="mt-1 block text-sm tabular-nums text-(--color-texto-apagado)"
          >
            {formatearFecha(compra.fecha)}
          </time>
        </div>

        {/*
          Sin signo, a diferencia del historial de HU-14: acá son todas
          entradas y el backend las manda siempre positivas. Un "+24" sugeriría
          que puede existir un "−24", y en esta pantalla no existe.
        */}
        <p
          className="shrink-0 text-lg font-extrabold tabular-nums text-(--color-texto)"
          aria-label={`${compra.cantidad} ${compra.producto.unidadMedida}`}
        >
          {compra.cantidad}
          <span className="ml-1 text-xs font-semibold text-(--color-texto-apagado)">
            {compra.producto.unidadMedida}
          </span>
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-(--color-texto-apagado)">Ubicación</dt>
        <dd className="text-(--color-texto)">{compra.ubicacion.nombre}</dd>

        <dt className="text-(--color-texto-apagado)">Código</dt>
        <dd className="text-(--color-texto) tabular-nums">
          {compra.producto.codigoBarras}
        </dd>

        {compra.motivo && (
          <>
            <dt className="text-(--color-texto-apagado)">Motivo</dt>
            <dd className="text-(--color-texto)">{compra.motivo}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

export default function HistorialComprasProveedor() {
  const { id } = useParams();
  const [parametros, setParametros] = useSearchParams();
  const filtros = leerFiltros(parametros);
  const rangoInvalido = errorDeRango(filtros);

  // La respuesta se guarda junto al proveedor y a la consulta de la que salió.
  // Guardar esas dos marcas es lo que deja derivar todo lo demás, sin un estado
  // de "cargando" que haya que acordarse de prender en cada botón.
  const [carga, setCarga] = useState({
    id: null,
    clave: null,
    resultado: null,
    error: null,
  });

  // Reintentar es pedir la misma consulta de nuevo. Como un contador y no como
  // una llamada suelta, para que la pantalla se entere de que hay algo en vuelo
  // igual que con cualquier otro cambio.
  const [intento, setIntento] = useState(0);

  // Cada consulta lleva un número. Si se cambian dos filtros seguidos, la
  // respuesta de la primera puede llegar después que la de la segunda y pisar
  // la lista con datos que ya no corresponden a lo que dicen los filtros. Solo
  // se acepta la respuesta de la última.
  const ultimaConsulta = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const consulta = parametros.toString();

  // Lo que la pantalla está pidiendo ahora mismo. Comparado con la marca de lo
  // último que volvió, dice si hay algo en vuelo: así un cambio de URL que no
  // pasa por los controles —el botón atrás del navegador, un link de un
  // proveedor a otro— también avisa, en vez de dejar los datos anteriores a la
  // vista como si ya fueran los nuevos.
  const clave = `${id}|${consulta}|${intento}`;

  // Un resultado de otro proveedor quedó viejo en cuanto cambió la URL: se
  // descarta en el mismo render, sin esperar a que vuelva la consulta nueva.
  // Si no, el nombre, el badge y el resumen del anterior se leerían como suyos.
  const esDeEsteProveedor = carga.id === id;
  const resultado = esDeEsteProveedor ? carga.resultado : null;
  const error = esDeEsteProveedor ? carga.error : null;

  // Con el rango al revés no se consulta —el aviso ya está al lado de las
  // fechas—, así que no hay nada que esperar.
  const cargando = !rangoInvalido && carga.clave !== clave;

  const cargar = useCallback(() => {
    const actuales = leerFiltros(new URLSearchParams(consulta));

    if (errorDeRango(actuales)) {
      return Promise.resolve();
    }

    ultimaConsulta.current += 1;
    const numero = ultimaConsulta.current;

    return obtenerHistorialDeCompras(id, actuales)
      .then((respuesta) => {
        if (!montado.current || numero !== ultimaConsulta.current) return;
        setCarga({ id, clave, resultado: respuesta, error: null });
      })
      .catch((fallo) => {
        if (!montado.current || numero !== ultimaConsulta.current) return;
        setCarga((previa) => ({
          id,
          clave,
          // El nombre del proveedor no depende del período, así que sobrevive a
          // un error de filtro. Si el que falló es otro proveedor, en cambio, no
          // hay nada suyo que conservar.
          resultado: previa.id === id ? previa.resultado : null,
          error: fallo,
        }));
      });
    // `setCarga` es estable; va porque el React Compiler lo infiere como
    // dependencia y sin él descarta la memoización.
  }, [clave, consulta, id, setCarga]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Cambia el período y vuelve a la primera página. Se resetea a propósito: el
   * período nuevo tiene otra cantidad de resultados, así que la página 4 del
   * anterior puede no existir, y conservarla deja mirando un vacío que parece
   * decir "este proveedor no tiene compras" cuando sí las tiene.
   */
  function alCambiarFiltro(evento) {
    const { name, value } = evento.target;

    setParametros(
      (previos) => {
        const nuevos = new URLSearchParams(previos);
        if (value) nuevos.set(name, value);
        else nuevos.delete(name);
        nuevos.delete("pagina");
        return nuevos;
      },
      { replace: true },
    );
  }

  /** Paginar no toca el período: solo cambia `?pagina`. */
  function irAPagina(pagina) {
    setParametros((previos) => {
      const nuevos = new URLSearchParams(previos);
      if (pagina > 1) nuevos.set("pagina", String(pagina));
      else nuevos.delete("pagina");
      return nuevos;
    });

    window.scrollTo?.({ top: 0 });
  }

  const hayPeriodo = Boolean(filtros.desde || filtros.hasta);

  // El orden importa, y es el del backend: un filtro inválido corta **antes**
  // de buscar el proveedor, así que un id inexistente con una fecha rota da 400
  // y no 404. Si se mirara el 404 primero, la pantalla diría "no existe" cuando
  // lo que hay que arreglar es la fecha.
  const errorDeFiltro = error?.status === 400 ? error.message : "";
  const sinProveedor = error?.status === 404;
  // Con el rango al revés no se consulta, así que su "Reintentar" no mandaría
  // nada: el error que quedó es de un intento anterior y el accionable es el
  // de las fechas. Se muestra uno solo.
  const errorGeneral =
    error && !errorDeFiltro && !sinProveedor && !rangoInvalido ? error : null;

  // La identidad del proveedor no depende del período, así que sobrevive a un
  // error de filtro. Pero no a un 404: ahí el nombre que quedó es de otro
  // proveedor, y ponerlo arriba de "no existe" sería decir dos cosas opuestas.
  const proveedor = sinProveedor ? null : resultado?.proveedor;
  const paginacion = resultado?.paginacion;
  const compras = resultado?.compras ?? [];

  const vacio = paginacion?.total === 0;
  // 200 con `compras: []` y total > 0: se pidió una página más allá del final.
  // NO es un error, y no tiene que verse como uno.
  const paginaFueraDeRango = paginacion?.total > 0 && compras.length === 0;

  const muestraDatos = Boolean(resultado) && !error && !rangoInvalido;
  const muestraPaginacion =
    muestraDatos && paginacion.totalPaginas > 1 && !paginaFueraDeRango;

  // `limite` sale SIEMPRE de la respuesta y nunca del valor que se pidió: el
  // backend recorta en silencio cualquier límite por encima de 200, y un
  // contador armado con lo pedido mentiría.
  const primeraFila = muestraDatos
    ? (paginacion.pagina - 1) * paginacion.limite + 1
    : 0;

  return (
    <main
      data-testid="historial-compras"
      aria-busy={cargando}
      className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10"
    >
      <header className="mb-6">
        <Link
          to="/proveedores"
          className="text-sm font-bold text-(--color-primario) underline"
        >
          ← Volver a proveedores
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 text-3xl font-extrabold text-(--color-texto)">
          {proveedor?.nombre ?? "Historial de compras"}
          {/*
            La baja es lógica: el proveedor deja de aparecer en el directorio,
            pero lo que se le compró sigue siendo historia válida. El badge
            explica por qué no está en la lista sin esconder sus compras.
          */}
          {proveedor?.activo === false && (
            <span
              data-testid="proveedor-dado-de-baja"
              className="rounded-full bg-(--color-apagado) px-3 py-1 text-sm
                         font-bold text-(--color-texto-apagado)"
            >
              dado de baja
            </span>
          )}
        </h1>
        {!sinProveedor && (
          <p className="mt-2 text-(--color-texto-apagado)">
            Qué le compraste, cuándo y cuánto, de lo más reciente a lo más
            antiguo.
          </p>
        )}
      </header>

      {sinProveedor ? (
        /*
          Los tres casos que el backend mete acá —no existe, es de otro comercio,
          o el id está mal formado— llegan con el mismo mensaje a propósito, y la
          UI no puede distinguirlos. Se tratan como uno solo. Sin "Reintentar":
          volver a pedirlo no lo va a hacer existir.
        */
        <div
          role="alert"
          data-testid="historial-compras-sin-proveedor"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{error.message}</p>
          <Link
            to="/proveedores"
            className="mt-2 inline-block text-sm font-bold underline"
          >
            Ver tus proveedores
          </Link>
        </div>
      ) : (
        <>
          {muestraDatos && <ResumenDelPeriodo resumen={resultado.resumen} />}

          <section aria-label="Período" className="mb-6 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Campo
                id="desde"
                etiqueta="Desde"
                type="date"
                data-testid="filtro-desde"
                value={filtros.desde}
                max={filtros.hasta || undefined}
                onChange={alCambiarFiltro}
                error={rangoInvalido}
              />
              <Campo
                id="hasta"
                etiqueta="Hasta"
                type="date"
                data-testid="filtro-hasta"
                value={filtros.hasta}
                min={filtros.desde || undefined}
                onChange={alCambiarFiltro}
              />
            </div>

            {/*
              El 400 del backend se muestra con SU texto, pegado a las fechas:
              es el que sabe qué regla se rompió. La validación local de acá
              arriba es una comodidad, no una garantía de que no vaya a llegar.
            */}
            {errorDeFiltro && (
              <p
                role="alert"
                data-testid="historial-compras-error"
                className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                           text-sm font-semibold text-(--color-peligro)"
              >
                {errorDeFiltro}
              </p>
            )}

            {hayPeriodo && (
              <button
                type="button"
                data-testid="historial-compras-limpiar"
                onClick={() => setParametros({}, { replace: true })}
                className={`self-start ${CLASES_BOTON_SECUNDARIO}`}
              >
                Limpiar período
              </button>
            )}
          </section>

          {/*
            Con el rango al revés no se consulta, así que `cargando` puede no
            bajar nunca si la pantalla se abrió con ese rango en la URL. El
            aviso ya está al lado de las fechas: no hay nada que esperar.
          */}
          {cargando && !resultado && !rangoInvalido && (
            <p
              data-testid="historial-compras-cargando"
              className="text-(--color-texto-apagado)"
            >
              Cargando el historial de compras…
            </p>
          )}

          {/* 401, 403 y los fallos de red: `AvisoDeError` ya sabe que un 403 no
              cierra la sesión (HU-32). No se reimplementa acá. */}
          {errorGeneral && (
            <div data-testid="historial-compras-error">
              <AvisoDeError
                fallo={errorGeneral}
                alReintentar={() => setIntento((previo) => previo + 1)}
              />
            </div>
          )}

          {muestraDatos && (
            /*
              Mientras viaja una consulta nueva la lista anterior se atenúa en
              vez de desaparecer: con conexión lenta, un salto a blanco y vuelta
              se lee como que el filtro borró todo.
            */
            <div className={cargando ? "opacity-50 transition-opacity" : ""}>
              <p
                className="mb-3 text-sm text-(--color-texto-apagado)"
                aria-live="polite"
              >
                {cargando
                  ? "Actualizando…"
                  : paginacion.total === 1
                    ? "1 compra"
                    : `${paginacion.total} compras`}
              </p>

              {vacio && (
                <p
                  data-testid="historial-compras-vacio"
                  className="rounded-(--radius) bg-(--color-apagado) px-4 py-3
                             text-sm text-(--color-texto-apagado)"
                >
                  {hayPeriodo
                    ? "No le registraste compras en este período."
                    : "Todavía no le registraste ninguna compra a este proveedor."}
                </p>
              )}

              {paginaFueraDeRango && (
                /*
                  El backend responde 200 con la lista vacía, no 404: pedir una
                  página que no existe no es una falla. Se dice en gris y con la
                  salida puesta, no en rojo.
                */
                <div
                  data-testid="historial-compras-pagina-vacia"
                  className="rounded-(--radius) bg-(--color-apagado) px-4 py-3
                             text-sm text-(--color-texto-apagado)"
                >
                  <p>Esa página ya no tiene compras.</p>
                  <button
                    type="button"
                    onClick={() => irAPagina(1)}
                    className={`mt-2 ${CLASES_BOTON_SECUNDARIO}`}
                  >
                    Volver a la primera
                  </button>
                </div>
              )}

              {compras.length > 0 && (
                <ul
                  data-testid="historial-compras-lista"
                  className="flex flex-col gap-2"
                >
                  {compras.map((compra) => (
                    <Compra key={compra.id} compra={compra} />
                  ))}
                </ul>
              )}

              {muestraPaginacion && (
                <nav
                  aria-label="Paginación"
                  data-testid="historial-compras-paginacion"
                  className="mt-6 flex flex-col items-center gap-3"
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <button
                      type="button"
                      data-testid="pagina-anterior"
                      onClick={() => irAPagina(paginacion.pagina - 1)}
                      disabled={paginacion.pagina <= 1}
                      className={CLASES_BOTON_SECUNDARIO}
                    >
                      ← Anterior
                    </button>
                    <span
                      data-testid="pagina-actual"
                      className="text-sm tabular-nums text-(--color-texto-apagado)"
                    >
                      Página {paginacion.pagina} de {paginacion.totalPaginas}
                    </span>
                    <button
                      type="button"
                      data-testid="pagina-siguiente"
                      onClick={() => irAPagina(paginacion.pagina + 1)}
                      disabled={paginacion.pagina >= paginacion.totalPaginas}
                      className={CLASES_BOTON_SECUNDARIO}
                    >
                      Siguiente →
                    </button>
                  </div>
                  <p className="text-sm tabular-nums text-(--color-texto-apagado)">
                    Mostrando {primeraFila}–{primeraFila + compras.length - 1} de{" "}
                    {paginacion.total}
                  </p>
                </nav>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
