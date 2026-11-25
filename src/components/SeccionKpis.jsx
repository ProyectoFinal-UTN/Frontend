import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  Boxes,
  PackageX,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import AvisoDeError from "./AvisoDeError";
import { TIPO, clasificar } from "../services/errores";
import { VENTANAS, VENTANA_POR_DEFECTO, obtenerKpis } from "../services/kpis";

/**
 * Dashboard de KPIs principales (HU-22, SCRUM-141).
 *
 * Tres bloques, los que nombra la historia: estado del stock, rotación de
 * productos y compras por proveedor. Todos los números vienen calculados del
 * backend (`GET /api/kpis`); acá no se suma, no se resta ni se clasifica nada,
 * solo se muestra.
 *
 * ## Tiempo real
 *
 * Es refresco del cliente, igual que el panel de alertas (HU-17): cada minuto
 * con la pestaña visible, y en el acto al volver a ella. El backend tiene una
 * caché que se descarta sola cuando cambia el stock, así que refrescar seguido
 * es barato y una venta recién registrada aparece en la próxima carga.
 *
 * ## Carga en menos de dos segundos (RNF2)
 *
 * Un solo pedido trae los tres bloques. Los gráficos (Recharts) se cargan en
 * diferido: las tarjetas con los números se pintan apenas llega la respuesta,
 * y los gráficos se suman cuando termina de bajar su módulo.
 *
 * ## Cómo sabe si está cargando, sin un estado de "cargando"
 *
 * El mismo mecanismo que `SeccionAlertas`: la respuesta se guarda junto a la
 * marca de lo que se pidió (`clave`), y `cargando` se deriva en el render.
 * `react-hooks/set-state-in-effect` es ERROR en este repo y así no tiene nada
 * que objetar: el único `setState` pasa dentro de un `.then`/`.catch`.
 */

const GraficoKpi = lazy(() => import("./GraficoKpi"));

/** Cada cuánto se vuelve a pedir. Exportada para que el test no use un número mágico. */
export const CADENCIA_DE_REFRESCO_MS = 60_000;

const formatear = (valor) => Number(valor).toLocaleString("es-AR");

/** "2026-11-22" → "22/11". Es un día de Argentina, no un instante. */
function diaCorto(fecha) {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

/** La hora del cálculo, para decir de cuándo son los números. */
function horaDe(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Lo que muestra el gráfico de compras: una barra por grupo, totales completos. */
function barrasDeCompras(compras) {
  const barras = compras.proveedores.map((fila) => ({
    id: fila.proveedor.id,
    nombre: fila.proveedor.activo
      ? fila.proveedor.nombre
      : `${fila.proveedor.nombre} (de baja)`,
    unidades: fila.unidades,
    compras: fila.compras,
  }));

  // Los dos grupos que no son UN proveedor van al final y con su nombre: sin
  // ellos las barras no sumarían el total que dice la tarjeta de arriba.
  if (compras.otros) {
    barras.push({
      id: "otros",
      nombre: `Otros ${compras.otros.proveedores}`,
      unidades: compras.otros.unidades,
      compras: compras.otros.compras,
    });
  }
  if (compras.sinProveedor) {
    barras.push({
      id: "sin-proveedor",
      nombre: "Sin proveedor",
      unidades: compras.sinProveedor.unidades,
      compras: compras.sinProveedor.compras,
    });
  }

  return barras;
}

export default function SeccionKpis() {
  const [dias, setDias] = useState(VENTANA_POR_DEFECTO);
  const [intento, setIntento] = useState(0);
  const [carga, setCarga] = useState({
    clave: null,
    resultado: null,
    error: null,
  });

  // Igual que en `SeccionAlertas`: una vez que el backend dijo que el rol no
  // puede, queda solo el aviso. Sin latchear, el refresco de permisos que
  // dispara `AvisoDeError` desmonta la sección y la explicación parpadea.
  const [sinPermiso, setSinPermiso] = useState(false);

  // Cada pedido lleva un número y solo se acepta la respuesta del último: el
  // refresco de fondo y un cambio de ventana se pueden pisar, y los números de
  // 7 días no pueden quedar en pantalla con el selector en 90.
  const ultimoPedido = useRef(0);
  const enVuelo = useRef(false);
  const montado = useRef(true);

  const idTitulo = useId();

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const clave = `${dias}|${intento}`;
  const cargando = carga.clave !== clave;
  const { resultado, error } = carga;

  // Un 401 o un 403 no se curan solos: insistir cada minuto solo llena el log
  // del backend de rechazos. Un fallo de red sí, y el refresco es lo que lo cura.
  const tipoDeFallo = error ? (error.tipo ?? clasificar(error)) : null;
  const convieneInsistir = tipoDeFallo === null || tipoDeFallo === TIPO.GENERAL;

  const cargar = useCallback(
    (deFondo = false) => {
      if (deFondo && enVuelo.current) {
        return Promise.resolve();
      }

      ultimoPedido.current += 1;
      const numero = ultimoPedido.current;
      enVuelo.current = true;

      return obtenerKpis({ dias })
        .then((respuesta) => {
          if (!montado.current || numero !== ultimoPedido.current) return;

          // El render lee los tres bloques derecho. Un 2xx sin cuerpo o con
          // otra forma (un proxy mal configurado, un backend desfasado) tiraría
          // un TypeError y, sin error boundary, blanquearía Inicio entero.
          if (
            !respuesta?.stock ||
            !respuesta.rotacion ||
            !respuesta.comprasPorProveedor
          ) {
            throw new Error(
              "No se pudieron leer los indicadores. Probá de nuevo en un momento.",
            );
          }

          setCarga({ clave, resultado: respuesta, error: null });
        })
        .catch((fallo) => {
          if (!montado.current || numero !== ultimoPedido.current) return;

          // Lo que estaba en pantalla se conserva y el aviso va arriba.
          setCarga((previa) => ({
            clave,
            resultado: previa.resultado,
            error: fallo,
          }));

          if ((fallo?.tipo ?? clasificar(fallo)) === TIPO.PERMISO) {
            setSinPermiso(true);
          }
        })
        .finally(() => {
          if (numero === ultimoPedido.current) {
            enVuelo.current = false;
          }
        });
    },
    [clave, dias, setCarga, setSinPermiso],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!convieneInsistir) {
      return undefined;
    }

    function refrescar() {
      if (document.visibilityState === "visible") {
        cargar(true);
      }
    }

    const reloj = setInterval(refrescar, CADENCIA_DE_REFRESCO_MS);
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener("focus", refrescar);

    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", refrescar);
      window.removeEventListener("focus", refrescar);
    };
  }, [cargar, convieneInsistir]);

  const muestraDatos = Boolean(resultado) && !sinPermiso;

  return (
    <section
      aria-labelledby={idTitulo}
      data-testid="kpis"
      aria-busy={cargando}
      className="mt-8"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          id={idTitulo}
          className="flex items-center gap-2 text-xl font-extrabold text-(--color-texto)"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--color-primario-suave) text-(--color-primario)">
            <BarChart3 aria-hidden="true" className="size-5" />
          </span>
          Indicadores del negocio
        </h2>

        {!sinPermiso && <SelectorDeVentana dias={dias} alCambiar={setDias} />}
      </div>

      {error && (
        <div data-testid="kpis-error" className={muestraDatos ? "mb-4" : undefined}>
          <AvisoDeError
            fallo={error}
            alReintentar={
              sinPermiso ? undefined : () => setIntento((previo) => previo + 1)
            }
          />
        </div>
      )}

      {!resultado ? (
        !error && (
          <p data-testid="kpis-cargando" className="text-(--color-texto-apagado)">
            Calculando tus indicadores…
          </p>
        )
      ) : sinPermiso ? null : (
        <div className={cargando ? "opacity-50 transition-opacity" : ""}>
          <p
            data-testid="kpis-actualizado"
            aria-live="polite"
            className="mb-4 text-sm text-(--color-texto-apagado)"
          >
            {cargando
              ? "Actualizando…"
              : `Actualizado a las ${horaDe(resultado.generadoEn)}. El stock es el de ahora; ventas y compras, de los últimos ${resultado.periodo.dias} días.`}
          </p>

          <div className="grid gap-6">
            <BloqueStock stock={resultado.stock} />
            <BloqueRotacion
              rotacion={resultado.rotacion}
              dias={resultado.periodo.dias}
            />
            <BloqueCompras
              compras={resultado.comprasPorProveedor}
              dias={resultado.periodo.dias}
            />
          </div>

          {/*
            Explícito y no escondido: sin precios en el sistema, alguien va a
            buscar "cuánto vendí en pesos" y tiene que saber por qué no está.
          */}
          <p
            data-testid="kpis-sin-montos"
            className="mt-4 text-sm text-(--color-texto-apagado)"
          >
            Los indicadores son en unidades: el sistema todavía no registra
            precios de venta ni de compra.
          </p>
        </div>
      )}
    </section>
  );
}

/** Botones y no un `<select>`: tres opciones se tocan mejor con el pulgar. */
function SelectorDeVentana({ dias, alCambiar }) {
  return (
    <div
      role="group"
      aria-label="Período de ventas y compras"
      className="inline-flex rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) p-1"
    >
      {VENTANAS.map((opcion) => {
        const activa = opcion === dias;
        return (
          <button
            key={opcion}
            type="button"
            aria-pressed={activa}
            onClick={() => alCambiar(opcion)}
            className={`rounded-[calc(var(--radius)-4px)] px-3 py-1.5 text-sm font-bold transition
              focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)
              ${
                activa
                  ? "bg-(--color-primario) text-(--color-primario-texto)"
                  : "text-(--color-texto-apagado) hover:text-(--color-texto)"
              }`}
          >
            {opcion} días
          </button>
        );
      })}
    </div>
  );
}

const TONOS = {
  primario: "bg-(--color-primario-suave) text-(--color-primario)",
  exito: "bg-(--color-exito-suave) text-(--color-exito)",
  atencion: "bg-(--color-atencion-suave) text-(--color-atencion)",
  peligro: "bg-(--color-peligro-suave) text-(--color-peligro)",
};

function Bloque({ titulo, testId, children }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className="rounded-[2rem] border-2 border-(--color-borde) bg-(--color-tarjeta) p-5 shadow-sm sm:p-6"
    >
      <h3 id={id} className="mb-4 text-lg font-extrabold text-(--color-texto)">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Un número grande con su etiqueta. `testId` es el ancla de los tests y del E2E. */
function Indicador({ icono: Icono, tono, valor, titulo, detalle, testId }) {
  return (
    <div data-testid={testId} className="rounded-(--radius) bg-(--color-apagado) p-4">
      <span className={`grid size-9 place-items-center rounded-full ${TONOS[tono]}`}>
        <Icono aria-hidden="true" className="size-5" />
      </span>
      <p
        data-testid={`${testId}-valor`}
        className="mt-3 text-2xl font-extrabold tabular-nums text-(--color-texto)"
      >
        {formatear(valor)}
      </p>
      <p className="font-bold text-(--color-texto)">{titulo}</p>
      {detalle && (
        <p className="text-sm text-(--color-texto-apagado)">{detalle}</p>
      )}
    </div>
  );
}

/**
 * Un gráfico con su título y, para lectores de pantalla, la tabla con los
 * mismos datos. El gráfico es `aria-hidden` (ver `GraficoKpi`).
 */
function Figura({ titulo, tipo, datos, columnas, testId }) {
  return (
    <figure data-testid={testId} className="mt-5">
      <figcaption className="mb-2 text-sm font-bold text-(--color-texto)">
        {titulo}
      </figcaption>
      <Suspense
        fallback={
          <div
            data-testid={`${testId}-cargando`}
            className="h-32 animate-pulse rounded-(--radius) bg-(--color-apagado)"
          />
        }
      >
        <GraficoKpi tipo={tipo} datos={datos} />
      </Suspense>
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            {columnas.map((columna) => (
              <th key={columna.titulo} scope="col">
                {columna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((fila, i) => (
            <tr key={fila.id ?? fila.fecha ?? i}>
              {columnas.map((columna) => (
                <td key={columna.titulo}>{columna.valor(fila)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Vacio({ testId, children }) {
  return (
    <p
      data-testid={testId}
      className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm font-semibold text-(--color-texto)"
    >
      {children}
    </p>
  );
}

function BloqueStock({ stock }) {
  const partes = [
    { clave: "normal", etiqueta: "Bien", valor: stock.normal, color: "bg-(--color-exito)" },
    { clave: "bajo", etiqueta: "En o bajo el mínimo", valor: stock.bajoUmbral, color: "bg-(--color-atencion)" },
    { clave: "sin", etiqueta: "Sin stock", valor: stock.sinStock, color: "bg-(--color-peligro)" },
  ];

  return (
    <Bloque titulo="Estado del stock" testId="kpis-stock">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          testId="kpi-productos"
          icono={Boxes}
          tono="primario"
          valor={stock.productos}
          titulo="Productos activos"
        />
        <Indicador
          testId="kpi-unidades-stock"
          icono={Boxes}
          tono="exito"
          valor={stock.unidades}
          titulo="Unidades en stock"
          detalle="en todas las ubicaciones"
        />
        <Indicador
          testId="kpi-bajo-umbral"
          icono={TrendingDown}
          tono="atencion"
          valor={stock.bajoUmbral}
          titulo="En o bajo el mínimo"
          detalle="todavía queda algo"
        />
        <Indicador
          testId="kpi-sin-stock"
          icono={PackageX}
          tono="peligro"
          valor={stock.sinStock}
          titulo="Sin stock"
        />
      </div>

      {stock.productos === 0 ? (
        <Vacio testId="kpis-stock-vacio">
          Todavía no cargaste productos. Cuando lo hagas, acá vas a ver cómo está
          tu stock.
        </Vacio>
      ) : (
        <>
          {/*
            Barra segmentada y no un gráfico de torta: las tres partes suman
            el total (el backend las da excluyentes) y una barra se lee bien en
            el ancho de un celular. Es CSS puro, no espera a Recharts.
          */}
          <div className="mt-5">
            <div
              role="img"
              aria-label={partes
                .map((parte) => `${parte.etiqueta}: ${parte.valor}`)
                .join(", ")}
              className="flex h-4 overflow-hidden rounded-full bg-(--color-apagado)"
            >
              {partes
                .filter((parte) => parte.valor > 0)
                .map((parte) => (
                  <span
                    key={parte.clave}
                    className={parte.color}
                    style={{ width: `${(parte.valor / stock.productos) * 100}%` }}
                  />
                ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-(--color-texto-apagado)">
              {partes.map((parte) => (
                <li key={parte.clave} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2.5 rounded-full ${parte.color}`} />
                  {parte.etiqueta}: <span className="font-bold tabular-nums">{formatear(parte.valor)}</span>
                </li>
              ))}
            </ul>
          </div>

          {stock.porUbicacion.length > 0 && (
            <Figura
              testId="kpis-figura-ubicaciones"
              titulo="Unidades por ubicación"
              tipo="stockPorUbicacion"
              datos={stock.porUbicacion}
              columnas={[
                { titulo: "Ubicación", valor: (fila) => fila.nombre },
                { titulo: "Unidades", valor: (fila) => formatear(fila.unidades) },
                { titulo: "Productos", valor: (fila) => formatear(fila.productos) },
              ]}
            />
          )}
        </>
      )}
    </Bloque>
  );
}

/** "alcanza para 8 días", o nada si no hay ritmo de venta del que hablar. */
function textoDeCobertura(fila) {
  if (fila.diasDeCobertura === null) return null;
  if (fila.stockActual <= 0) return "sin stock";
  if (fila.diasDeCobertura === 0) return "alcanza para menos de un día";
  if (fila.diasDeCobertura === 1) return "alcanza para 1 día";
  return `alcanza para ${formatear(fila.diasDeCobertura)} días`;
}

function BloqueRotacion({ rotacion, dias }) {
  return (
    <Bloque titulo={`Rotación · últimos ${dias} días`} testId="kpis-rotacion">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador
          testId="kpi-ventas"
          icono={ShoppingCart}
          tono="primario"
          valor={rotacion.ventas}
          titulo="Ventas"
          detalle="operaciones registradas"
        />
        <Indicador
          testId="kpi-unidades-vendidas"
          icono={TrendingUp}
          tono="exito"
          valor={rotacion.unidadesVendidas}
          titulo="Unidades vendidas"
        />
        <Indicador
          testId="kpi-sin-ventas"
          icono={PackageX}
          tono="atencion"
          valor={rotacion.productosSinVentas}
          titulo="Sin ventas"
          detalle="con stock y sin moverse"
        />
      </div>

      {rotacion.ventas === 0 ? (
        <Vacio testId="kpis-rotacion-vacio">
          No hubo ventas en los últimos {dias} días.
        </Vacio>
      ) : (
        <>
          <Figura
            testId="kpis-figura-ventas"
            titulo="Unidades vendidas por día"
            tipo="ventasPorDia"
            datos={rotacion.porDia}
            columnas={[
              { titulo: "Día", valor: (fila) => diaCorto(fila.fecha) },
              { titulo: "Ventas", valor: (fila) => formatear(fila.ventas) },
              { titulo: "Unidades", valor: (fila) => formatear(fila.unidades) },
            ]}
          />

          <h4 className="mt-5 text-sm font-bold text-(--color-texto)">
            Los más vendidos
          </h4>
          <ol data-testid="kpis-mas-vendidos" className="mt-2 grid gap-2">
            {rotacion.masVendidos.map((fila, i) => (
              <li
                key={fila.producto.id}
                data-testid="kpis-mas-vendido"
                // `data-kpi-producto-id` y no `data-producto-id`: el page
                // object de alertas (HU-17) busca ese atributo en toda la
                // página, y un producto que está en falta y además entre los
                // más vendidos aparecía dos veces. Lo encontró el E2E.
                data-kpi-producto-id={fila.producto.id}
                className="flex items-center gap-3 rounded-(--radius) bg-(--color-apagado) px-4 py-3"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-(--color-primario-suave) text-sm font-extrabold text-(--color-primario)">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-(--color-texto)">
                    {fila.producto.nombre}
                    {!fila.producto.activo && (
                      <span className="font-normal text-(--color-texto-apagado)"> (dado de baja)</span>
                    )}
                  </span>
                  <span className="block text-sm text-(--color-texto-apagado)">
                    {formatear(fila.unidadesVendidas)} {fila.producto.unidadMedida} en{" "}
                    {fila.ventas === 1 ? "1 venta" : `${formatear(fila.ventas)} ventas`}
                  </span>
                </span>
                {textoDeCobertura(fila) && (
                  <span
                    data-testid="kpis-cobertura"
                    className="shrink-0 text-right text-sm font-semibold text-(--color-texto)"
                  >
                    {textoDeCobertura(fila)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Bloque>
  );
}

function BloqueCompras({ compras, dias }) {
  const barras = barrasDeCompras(compras);

  return (
    <Bloque titulo={`Compras por proveedor · últimos ${dias} días`} testId="kpis-compras">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador
          testId="kpi-compras"
          icono={Truck}
          tono="primario"
          valor={compras.compras}
          titulo="Compras"
          detalle="operaciones registradas"
        />
        <Indicador
          testId="kpi-unidades-compradas"
          icono={Boxes}
          tono="exito"
          valor={compras.unidades}
          titulo="Unidades compradas"
        />
        <Indicador
          testId="kpi-proveedores"
          icono={Truck}
          tono="atencion"
          valor={compras.proveedoresConCompras}
          titulo="Proveedores"
          detalle="a los que les compraste"
        />
      </div>

      {compras.compras === 0 ? (
        <Vacio testId="kpis-compras-vacio">
          No registraste compras en los últimos {dias} días.
        </Vacio>
      ) : (
        <Figura
          testId="kpis-figura-compras"
          titulo="Unidades compradas por proveedor"
          tipo="comprasPorProveedor"
          datos={barras}
          columnas={[
            { titulo: "Proveedor", valor: (fila) => fila.nombre },
            { titulo: "Compras", valor: (fila) => formatear(fila.compras) },
            { titulo: "Unidades", valor: (fila) => formatear(fila.unidades) },
          ]}
        />
      )}
    </Bloque>
  );
}
