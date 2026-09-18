import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CampoSelect from "../components/CampoSelect";
import Campo from "../components/Campo";
import { obtenerUbicaciones } from "../services/configuracion";
import {
  TIPOS_HISTORIAL,
  TIPOS_QUE_EXIGEN_MOTIVO,
  etiquetaDeTipo,
  obtenerHistorial,
} from "../services/movimientos";
import { obtenerProductos } from "../services/productos";

/**
 * Historial de movimientos de stock (HU-14).
 *
 * Es la pantalla para auditar lo que pasó en el negocio: todo el libro de
 * movimientos, del más nuevo al más viejo, con filtros combinables por rango de
 * fechas, producto, tipo y ubicación.
 *
 * Los filtros viven en la URL (`?productoId=…&tipo=…`) y no en un estado
 * local: así una búsqueda sobrevive a una recarga, se puede compartir el link,
 * y otras pantallas pueden abrir el historial ya filtrado. El filtro por
 * proveedor funciona por esa vía (`?proveedorId=…`) aunque todavía no tenga
 * desplegable: la tabla de proveedores llega con HU-19, y hasta entonces no hay
 * nombres para mostrar en la lista.
 */

const FILTROS = ["desde", "hasta", "productoId", "tipo", "ubicacionId", "proveedorId"];

const CLASES_BOTON_SECUNDARIO =
  "rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-4 py-2 text-sm font-bold text-(--color-texto) transition " +
  "hover:border-(--color-primario) disabled:opacity-50 " +
  "disabled:hover:border-(--color-borde)";

/** Fecha y hora en el formato que se lee acá, no el ISO del backend. */
function formatearFecha(iso) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "+5" / "−3": el signo explícito es lo que dice si entró o salió. */
function formatearCantidad(cantidad) {
  return cantidad > 0 ? `+${cantidad}` : `−${Math.abs(cantidad)}`;
}

/** Lee los filtros de la URL. Lo que no está queda como "". */
function leerFiltros(parametros) {
  const filtros = Object.fromEntries(
    FILTROS.map((clave) => [clave, parametros.get(clave) ?? ""]),
  );
  const pagina = Number.parseInt(parametros.get("pagina"), 10);
  return { ...filtros, pagina: pagina > 1 ? pagina : 1 };
}

/**
 * Un rango al revés no es algo que el backend pueda resolver mejor: responde
 * 400. Se avisa acá y no se consulta, para que el error aparezca al lado de las
 * fechas y no como una falla general de la pantalla.
 */
function errorDeRango({ desde, hasta }) {
  return desde && hasta && desde > hasta
    ? "La fecha «Desde» no puede ser posterior a «Hasta»."
    : "";
}

/**
 * El tipo como insignia, con las correcciones separadas de las operaciones
 * comerciales (criterio de HU-15: «el ajuste queda diferenciado de las ventas y
 * compras en el historial»).
 *
 * El color de la cantidad no alcanza para eso: dice si entró o salió, y un
 * ajuste de entrada se vería igual que una compra. Una corrección es lo que hay
 * que revisar al auditar, así que va en color de atención y aclara que lo es.
 * Se usa `TIPOS_QUE_EXIGEN_MOTIVO` porque es el mismo concepto: los tipos que
 * piden motivo son justamente los que corrigen el stock.
 */
function InsigniaTipo({ tipo }) {
  const esCorreccion = TIPOS_QUE_EXIGEN_MOTIVO.includes(tipo);

  return (
    <span
      data-correccion={esCorreccion || undefined}
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        esCorreccion
          ? "bg-(--color-atencion-suave) text-(--color-atencion)"
          : "bg-(--color-apagado) text-(--color-texto)"
      }`}
    >
      {etiquetaDeTipo(tipo)}
      {esCorreccion && <span className="font-semibold"> · corrección</span>}
    </span>
  );
}

function Movimiento({ movimiento }) {
  const entrada = movimiento.cantidad > 0;

  return (
    <li className="flex flex-col gap-2 rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-(--color-texto)">
            {movimiento.producto.nombre}
            {!movimiento.producto.activo && (
              <span className="ml-2 text-xs font-semibold text-(--color-texto-apagado)">
                (dado de baja)
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-(--color-texto-apagado)">
            <InsigniaTipo tipo={movimiento.tipo} />
            <time dateTime={movimiento.fecha} className="tabular-nums">
              {formatearFecha(movimiento.fecha)}
            </time>
          </p>
        </div>

        <p
          className={`shrink-0 text-lg font-extrabold tabular-nums ${
            entrada ? "text-(--color-exito)" : "text-(--color-peligro)"
          }`}
          aria-label={`${entrada ? "Entrada" : "Salida"} de ${Math.abs(movimiento.cantidad)} ${movimiento.producto.unidadMedida}`}
        >
          {formatearCantidad(movimiento.cantidad)}
          <span className="ml-1 text-xs font-semibold text-(--color-texto-apagado)">
            {movimiento.producto.unidadMedida}
          </span>
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-(--color-texto-apagado)">Ubicación</dt>
        <dd className="text-(--color-texto)">{movimiento.ubicacion.nombre}</dd>

        <dt className="text-(--color-texto-apagado)">Registró</dt>
        <dd className="truncate text-(--color-texto)">
          {movimiento.usuario.nombre || movimiento.usuario.correo}
        </dd>

        <dt className="text-(--color-texto-apagado)">Código</dt>
        <dd className="text-(--color-texto) tabular-nums">
          {movimiento.producto.codigoBarras}
        </dd>

        {movimiento.motivo && (
          <>
            <dt className="text-(--color-texto-apagado)">Motivo</dt>
            <dd className="text-(--color-texto)">{movimiento.motivo}</dd>
          </>
        )}

        {movimiento.proveedorId && (
          <>
            <dt className="text-(--color-texto-apagado)">Proveedor</dt>
            <dd className="truncate text-(--color-texto)">
              <Link
                to={`/movimientos?proveedorId=${movimiento.proveedorId}`}
                className="text-(--color-primario) underline"
              >
                Ver sus movimientos
              </Link>
            </dd>
          </>
        )}
      </dl>
    </li>
  );
}

export default function HistorialMovimientos() {
  const [parametros, setParametros] = useSearchParams();
  const filtros = leerFiltros(parametros);
  const rangoInvalido = errorDeRango(filtros);

  const [catalogo, setCatalogo] = useState({ productos: [], ubicaciones: [] });
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  // Cada consulta lleva un número. Si el usuario cambia dos filtros seguidos,
  // la respuesta de la primera puede llegar después que la de la segunda, y
  // pisaría la lista con resultados que ya no corresponden a lo que se ve en
  // los filtros. Solo se acepta la respuesta de la última.
  const ultimaConsulta = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // El catálogo alimenta los desplegables. Si falla, el historial igual se
  // puede ver sin filtrar por producto o ubicación, así que no bloquea nada.
  useEffect(() => {
    Promise.all([obtenerProductos(), obtenerUbicaciones()])
      .then(([productos, ubicaciones]) => {
        if (montado.current) setCatalogo({ productos, ubicaciones });
      })
      .catch(() => {});
  }, []);

  // `consulta` es el string de la URL: cambia exactamente cuando cambia algún
  // filtro, y a diferencia del objeto `filtros` no es uno nuevo en cada render.
  const consulta = parametros.toString();

  const cargar = useCallback(() => {
    const actuales = leerFiltros(new URLSearchParams(consulta));

    if (errorDeRango(actuales)) {
      return Promise.resolve();
    }

    ultimaConsulta.current += 1;
    const numero = ultimaConsulta.current;

    return obtenerHistorial(actuales)
      .then((respuesta) => {
        if (!montado.current || numero !== ultimaConsulta.current) return;
        setResultado(respuesta);
        setError("");
      })
      .catch((fallo) => {
        if (!montado.current || numero !== ultimaConsulta.current) return;
        setError(fallo.message);
      })
      .finally(() => {
        if (montado.current && numero === ultimaConsulta.current) {
          setCargando(false);
        }
      });
    // Los setters son estables; van porque el React Compiler los infiere como
    // dependencias y sin ellos descarta la memoización.
  }, [consulta, setCargando, setError, setResultado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Cambia un filtro y vuelve a la primera página: la actual deja de existir. */
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

  function irAPagina(pagina) {
    setParametros((previos) => {
      const nuevos = new URLSearchParams(previos);
      if (pagina > 1) nuevos.set("pagina", String(pagina));
      else nuevos.delete("pagina");
      return nuevos;
    });
    window.scrollTo?.({ top: 0 });
  }

  const hayFiltros = FILTROS.some((clave) => filtros[clave]);
  const pideUbicacion = catalogo.ubicaciones.length > 1 || filtros.ubicacionId;

  // Un producto dado de baja no está en el catálogo, pero se puede llegar a su
  // historial por link. Sin esta opción el desplegable mostraría «Todos» con el
  // filtro puesto, y la lista no coincidiría con lo que dice el filtro.
  const productoFueraDeCatalogo =
    filtros.productoId &&
    !catalogo.productos.some((p) => p.id === filtros.productoId);

  const paginacion = resultado?.paginacion;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <header className="mb-6">
        <Link to="/" className="text-sm font-bold text-(--color-primario) underline">
          ← Volver al inicio
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-(--color-texto)">
          Historial de movimientos
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Todo lo que entró y salió del stock, del más reciente al más antiguo.
        </p>
      </header>

      <section aria-label="Filtros" className="mb-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo
            id="desde"
            etiqueta="Desde"
            type="date"
            value={filtros.desde}
            max={filtros.hasta || undefined}
            onChange={alCambiarFiltro}
            error={rangoInvalido}
          />
          <Campo
            id="hasta"
            etiqueta="Hasta"
            type="date"
            value={filtros.hasta}
            min={filtros.desde || undefined}
            onChange={alCambiarFiltro}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoSelect
            id="productoId"
            etiqueta="Producto"
            value={filtros.productoId}
            onChange={alCambiarFiltro}
          >
            <option value="">Todos</option>
            {productoFueraDeCatalogo && (
              <option value={filtros.productoId}>Producto dado de baja</option>
            )}
            {catalogo.productos.map((producto) => (
              <option key={producto.id} value={producto.id}>
                {producto.nombre}
              </option>
            ))}
          </CampoSelect>

          <CampoSelect
            id="tipo"
            etiqueta="Tipo"
            value={filtros.tipo}
            onChange={alCambiarFiltro}
          >
            <option value="">Todos</option>
            {TIPOS_HISTORIAL.map(({ valor, etiqueta }) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </CampoSelect>

          {/*
            Con una sola ubicación, filtrar por ella no cambia nada: el campo no
            se muestra, igual que en el registro de movimientos.
          */}
          {pideUbicacion && (
            <CampoSelect
              id="ubicacionId"
              etiqueta="Ubicación"
              value={filtros.ubicacionId}
              onChange={alCambiarFiltro}
            >
              <option value="">Todas</option>
              {catalogo.ubicaciones.map((ubicacion) => (
                <option key={ubicacion.id} value={ubicacion.id}>
                  {ubicacion.nombre}
                </option>
              ))}
            </CampoSelect>
          )}
        </div>

        {filtros.proveedorId && (
          <p className="text-sm text-(--color-texto-apagado)">
            Mostrando solo los movimientos de un proveedor.
          </p>
        )}

        {hayFiltros && (
          <button
            type="button"
            onClick={() => setParametros({}, { replace: true })}
            className={`self-start ${CLASES_BOTON_SECUNDARIO}`}
          >
            Limpiar filtros
          </button>
        )}
      </section>

      {/*
        Con el rango al revés no se consulta, así que `cargando` puede no bajar
        nunca si la página se abrió con ese rango en la URL. El aviso ya está al
        lado de las fechas: no hay nada que esperar.
      */}
      {cargando && !rangoInvalido && (
        <p className="text-(--color-texto-apagado)">Cargando movimientos…</p>
      )}

      {!cargando && error && (
        <div
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setCargando(true);
              cargar();
            }}
            className="mt-2 rounded-(--radius) bg-(--color-peligro)
                       px-3 py-2 text-sm font-bold text-(--color-peligro-texto)"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !error && resultado && !rangoInvalido && (
        <>
          <p className="mb-3 text-sm text-(--color-texto-apagado)" aria-live="polite">
            {paginacion.total === 1
              ? "1 movimiento"
              : `${paginacion.total} movimientos`}
          </p>

          {resultado.movimientos.length === 0 ? (
            <p className="rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm text-(--color-texto-apagado)">
              {hayFiltros
                ? "No hay movimientos que coincidan con esos filtros."
                : "Todavía no hay movimientos registrados."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {resultado.movimientos.map((movimiento) => (
                <Movimiento key={movimiento.id} movimiento={movimiento} />
              ))}
            </ul>
          )}

          {paginacion.totalPaginas > 1 && (
            <nav
              aria-label="Paginación"
              className="mt-6 flex items-center justify-between gap-3"
            >
              <button
                type="button"
                onClick={() => irAPagina(paginacion.pagina - 1)}
                disabled={paginacion.pagina <= 1}
                className={CLASES_BOTON_SECUNDARIO}
              >
                ← Anterior
              </button>
              <span className="text-sm tabular-nums text-(--color-texto-apagado)">
                Página {paginacion.pagina} de {paginacion.totalPaginas}
              </span>
              <button
                type="button"
                onClick={() => irAPagina(paginacion.pagina + 1)}
                disabled={paginacion.pagina >= paginacion.totalPaginas}
                className={CLASES_BOTON_SECUNDARIO}
              >
                Siguiente →
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}
