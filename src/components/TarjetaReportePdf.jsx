import { useEffect, useRef, useState } from "react";
import { Download, FileText, Info, LoaderCircle } from "lucide-react";
import AvisoDeError from "./AvisoDeError";
import Campo from "./Campo";
import CampoSelect from "./CampoSelect";
import { usePermisos } from "../hooks/usePermisos";
import { obtenerProductos } from "../services/productos";
import { obtenerProveedores } from "../services/proveedores";
import {
  TIPOS_REPORTE,
  esLimiteSuperado,
  generarReporteMovimientos,
  guardarArchivo,
} from "../services/reportes";
import { validarReporte, valoresIniciales } from "./TarjetaReportePdf.validacion";

/**
 * Tarjeta «Generar reporte PDF» (HU-25, prototipo Figuras 12 y 13).
 *
 * Es un componente propio, y no código suelto dentro de la página de
 * Reportes, a propósito: esa página la arman y la siguen tocando otras
 * historias (HU-22, HU-23, HU-24). Así la página solo la monta con una línea y
 * los cambios de cada uno no se pisan.
 *
 * Se muestra solo a quien tiene `reporte:generar` (hoy propietario y gerente).
 * Al empleado no se le dibuja nada: ni la tarjeta, ni un cartel.
 */

/** Más opciones que esto y el selector suma un buscador arriba. */
const OPCIONES_SIN_BUSCADOR = 8;

/** Lo que cambia entre el selector de productos y el de proveedores. */
const SELECTORES = {
  producto: {
    campo: "productoId",
    id: "reporte-producto",
    etiqueta: "Producto",
    elegir: "Elegí un producto…",
    cargando: "Cargando productos…",
    vacio: "Todavía no hay productos cargados en el catálogo.",
    buscar: "Buscar producto",
    cargar: obtenerProductos,
  },
  proveedor: {
    campo: "proveedorId",
    id: "reporte-proveedor",
    etiqueta: "Proveedor",
    elegir: "Elegí un proveedor…",
    cargando: "Cargando proveedores…",
    vacio: "Todavía no hay proveedores cargados.",
    buscar: "Buscar proveedor",
    cargar: obtenerProveedores,
  },
};

const CATALOGO_SIN_PEDIR = { lista: null, cargando: false, fallo: null };

const CLASES_BOTON_PRIMARIO =
  "flex w-full items-center justify-center gap-2 rounded-(--radius) " +
  "bg-(--color-primario) px-5 py-3 font-bold text-(--color-primario-texto) " +
  "transition hover:opacity-90 focus:outline-none focus:ring-4 " +
  "focus:ring-(--color-primario-suave) disabled:cursor-wait disabled:opacity-60";

export default function TarjetaReportePdf() {
  const { puedeSalvoQueFalle, resuelto } = usePermisos();

  // `puedeSalvoQueFalle`, como la navegación: si la consulta de permisos se
  // cae, se muestra igual y el backend (la autoridad) responde 403 si no le
  // toca. Mientras está en vuelo no se muestra, para no hacerla aparecer y
  // desaparecer.
  if (!resuelto || !puedeSalvoQueFalle("reporte", "generar")) {
    return null;
  }

  return <FormularioReporte />;
}

function FormularioReporte() {
  const [valores, setValores] = useState(() => valoresIniciales());
  const [errores, setErrores] = useState({});
  const [catalogos, setCatalogos] = useState({
    producto: CATALOGO_SIN_PEDIR,
    proveedor: CATALOGO_SIN_PEDIR,
  });
  const [generando, setGenerando] = useState(false);
  const [fallo, setFallo] = useState(null);
  const [descargado, setDescargado] = useState("");

  // Un ref y no solo el estado: dos clics muy seguidos llegan antes de que
  // React vuelva a dibujar el botón deshabilitado, y los dos verían
  // `generando === false`. El ref cambia en el acto.
  const enCurso = useRef(false);

  // Las respuestas pueden volver después de que la tarjeta se desmontó (la
  // persona se fue de la pantalla). Ahí no se toca el estado.
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  function actualizarCatalogo(tipo, cambios) {
    if (!montado.current) return;
    setCatalogos((actuales) => ({
      ...actuales,
      [tipo]: { ...actuales[tipo], ...cambios },
    }));
  }

  /**
   * Pide productos o proveedores la primera vez que hacen falta, no antes: el
   * reporte por período no necesita ninguno de los dos.
   */
  function cargarCatalogo(tipo, { forzar = false } = {}) {
    const selector = SELECTORES[tipo];
    const actual = catalogos[tipo];
    if (!selector || actual.cargando || (actual.lista && !forzar)) return;

    actualizarCatalogo(tipo, { cargando: true, fallo: null });

    selector
      .cargar()
      .then((lista) =>
        actualizarCatalogo(tipo, {
          lista: Array.isArray(lista) ? lista : [],
          cargando: false,
        }),
      )
      .catch((error) =>
        actualizarCatalogo(tipo, { lista: null, cargando: false, fallo: error }),
      );
  }

  function limpiarResultado() {
    setFallo(null);
    setDescargado("");
  }

  function elegirTipo(tipo) {
    // Lo que se eligió para el tipo anterior no vale para este: un productoId
    // en un reporte por proveedor es un 400 del backend.
    setValores((actuales) => ({
      ...actuales,
      tipo,
      productoId: "",
      proveedorId: "",
    }));
    setErrores((actuales) => {
      const siguientes = { ...actuales };
      delete siguientes.productoId;
      delete siguientes.proveedorId;
      return siguientes;
    });
    limpiarResultado();
    cargarCatalogo(tipo);
  }

  function cambiarValor(campo, valor) {
    setValores((actuales) => ({ ...actuales, [campo]: valor }));
    // Si arregla el campo, el aviso se va. El de rango se va si toca
    // cualquiera de las dos fechas.
    setErrores((actuales) => {
      const siguientes = { ...actuales };
      delete siguientes[campo];
      if (campo === "hasta") delete siguientes.desde;
      return siguientes;
    });
    limpiarResultado();
  }

  async function generar(evento) {
    evento.preventDefault();
    if (enCurso.current) return;

    const encontrados = validarReporte(valores);
    setErrores(encontrados);
    limpiarResultado();
    if (Object.keys(encontrados).length > 0) return;

    enCurso.current = true;
    setGenerando(true);

    try {
      const { blob, nombreArchivo } = await generarReporteMovimientos(valores);
      // Sin movimientos en el rango NO es un error: el PDF llega igual y lo
      // dice adentro, así que se guarda como cualquier otro.
      guardarArchivo(blob, nombreArchivo);
      if (montado.current) setDescargado(nombreArchivo);
    } catch (error) {
      if (montado.current) setFallo(error);
    } finally {
      enCurso.current = false;
      if (montado.current) setGenerando(false);
    }
  }

  const selector = SELECTORES[valores.tipo];

  return (
    <section
      aria-labelledby="titulo-reporte-pdf"
      data-testid="tarjeta-reporte-pdf"
      className="rounded-[2rem] border-2 border-(--color-borde) bg-(--color-tarjeta) p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-(--color-acento-suave) text-(--color-acento)">
          <FileText aria-hidden="true" className="size-6" />
        </span>
        <div className="min-w-0">
          <h2
            id="titulo-reporte-pdf"
            className="text-xl font-extrabold text-(--color-texto)"
          >
            Generar reporte PDF
          </h2>
          <p className="text-sm text-(--color-texto-apagado)">
            Elegí el tipo y el rango de fechas
          </p>
        </div>
      </div>

      <form noValidate onSubmit={generar} className="mt-6 flex flex-col gap-4">
        {/*
          Radios de verdad, con pinta de botón. Así la flecha del teclado pasa
          de uno a otro y el lector de pantalla dice «1 de 3, seleccionado»
          sin tener que programarlo.
        */}
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-(--color-texto)">
            Tipo de reporte
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPOS_REPORTE.map(({ valor, etiqueta }) => {
              const elegido = valores.tipo === valor;
              return (
                <label
                  key={valor}
                  data-testid={`tipo-reporte-${valor}`}
                  className={`relative flex cursor-pointer items-center justify-center rounded-(--radius)
                              border-2 px-3 py-3 text-center text-sm font-bold transition
                              has-focus-visible:ring-4 has-focus-visible:ring-(--color-primario-suave)
                              ${
                                elegido
                                  ? "border-(--color-primario) bg-(--color-primario) text-(--color-primario-texto)"
                                  : "border-(--color-borde) bg-(--color-tarjeta) text-(--color-texto) hover:border-(--color-primario)"
                              }`}
                >
                  <input
                    type="radio"
                    name="tipo-reporte"
                    value={valor}
                    checked={elegido}
                    onChange={() => elegirTipo(valor)}
                    // Invisible pero ENCIMA de toda la píldora, y no `sr-only`:
                    // así el clic cae en el radio mismo, y un E2E puede hacer
                    // `getByRole("radio").check()` sin que la etiqueta lo tape.
                    className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                  />
                  {etiqueta}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="reporte-desde"
            etiqueta="Desde"
            type="date"
            value={valores.desde}
            max={valores.hasta || undefined}
            onChange={(e) => cambiarValor("desde", e.target.value)}
            error={errores.desde}
          />
          <Campo
            id="reporte-hasta"
            etiqueta="Hasta"
            type="date"
            value={valores.hasta}
            min={valores.desde || undefined}
            onChange={(e) => cambiarValor("hasta", e.target.value)}
            error={errores.hasta}
          />
        </div>

        {selector && (
          // `key`: al pasar de producto a proveedor se arma un selector nuevo,
          // con el buscador vacío.
          <SelectorDeCatalogo
            key={valores.tipo}
            selector={selector}
            catalogo={catalogos[valores.tipo]}
            valor={valores[selector.campo]}
            error={errores[selector.campo]}
            alCambiar={(valor) => cambiarValor(selector.campo, valor)}
            alReintentar={() => cargarCatalogo(valores.tipo, { forzar: true })}
          />
        )}

        <p className="flex items-center gap-1.5 text-xs text-(--color-texto-apagado)">
          <Info aria-hidden="true" className="size-3.5 shrink-0" />
          El reporte incluye cantidades, no montos.
        </p>

        {fallo && (
          <div className="flex flex-col gap-2">
            <AvisoDeError fallo={fallo} />
            {esLimiteSuperado(fallo) && (
              <p
                data-testid="sugerencia-acotar-rango"
                className="text-sm text-(--color-texto-apagado)"
              >
                Probá con un rango más corto —por ejemplo, de a un mes— y
                generá un reporte por cada parte.
              </p>
            )}
          </div>
        )}

        {descargado && (
          <p
            role="status"
            data-testid="reporte-descargado"
            className="rounded-(--radius) bg-(--color-exito-suave) px-4 py-3 text-sm font-semibold text-(--color-exito)"
          >
            Reporte descargado: {descargado}
          </p>
        )}

        <button
          type="submit"
          disabled={generando}
          aria-busy={generando}
          className={CLASES_BOTON_PRIMARIO}
        >
          {generando ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              Generando…
            </>
          ) : (
            <>
              <Download aria-hidden="true" className="size-5" />
              Generar y descargar
            </>
          )}
        </button>
      </form>
    </section>
  );
}

/** "Yerba Ñandú" → "yerba nandu", para buscar sin depender de tildes. */
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function coincide(opcion, busqueda) {
  return [opcion.nombre, opcion.codigoBarras].some((dato) =>
    normalizar(dato).includes(busqueda),
  );
}

/**
 * El desplegable de producto o de proveedor, con buscador si la lista es
 * larga. Solo lista los ACTIVOS: es lo que devuelven `GET /api/productos` y
 * `GET /api/proveedores`.
 */
function SelectorDeCatalogo({ selector, catalogo, valor, error, alCambiar, alReintentar }) {
  const [busqueda, setBusqueda] = useState("");

  if (catalogo.fallo) {
    return <AvisoDeError fallo={catalogo.fallo} alReintentar={alReintentar} />;
  }

  if (catalogo.cargando || !catalogo.lista) {
    return (
      <CampoSelect id={selector.id} etiqueta={selector.etiqueta} disabled value="">
        <option value="">{selector.cargando}</option>
      </CampoSelect>
    );
  }

  if (catalogo.lista.length === 0) {
    return (
      <p
        role="status"
        className="rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm text-(--color-texto)"
      >
        {selector.vacio}
      </p>
    );
  }

  const conBuscador = catalogo.lista.length > OPCIONES_SIN_BUSCADOR;
  const termino = normalizar(busqueda.trim());
  // Lo ya elegido queda siempre en la lista: si el buscador lo escondiera, el
  // desplegable mostraría otra cosa que la que se va a mandar.
  const opciones = termino
    ? catalogo.lista.filter((o) => o.id === valor || coincide(o, termino))
    : catalogo.lista;

  return (
    <div className="flex flex-col gap-2">
      {conBuscador && (
        <Campo
          id={`${selector.id}-buscar`}
          etiqueta={selector.buscar}
          type="search"
          placeholder="Escribí para filtrar la lista"
          autoComplete="off"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}
      <CampoSelect
        id={selector.id}
        etiqueta={selector.etiqueta}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        error={error}
      >
        <option value="">
          {opciones.length === 0 ? "Ninguno coincide con la búsqueda" : selector.elegir}
        </option>
        {opciones.map((opcion) => (
          <option key={opcion.id} value={opcion.id}>
            {opcion.nombre}
          </option>
        ))}
      </CampoSelect>
    </div>
  );
}
