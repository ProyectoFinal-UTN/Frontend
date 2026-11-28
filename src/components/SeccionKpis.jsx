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
  CalendarRange,
  PackageX,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import AvisoDeError from "./AvisoDeError";
import Campo from "./Campo";
import { TIPO, clasificar } from "../services/errores";
import { obtenerKpis } from "../services/kpis";
import {
  ID_PERSONALIZADO,
  PERIODOS,
  PERIODO_POR_DEFECTO,
  UNIDAD_DE_SERIE,
  agruparSerie,
  claveDePeriodo,
  diaEnZona,
  diasPedidos,
  etiquetaDeRespuesta,
  opcionDe,
  parametrosDePeriodo,
  periodoListo,
  terminaHoy,
  validarPeriodo,
} from "../services/periodos";

/**
 * Dashboard de KPIs principales (HU-22, SCRUM-141) con filtro de período
 * (HU-23, SCRUM-144).
 *
 * Tres bloques, los que nombra la historia: estado del stock, rotación de
 * productos y compras por proveedor. Todos los números vienen calculados del
 * backend (`GET /api/kpis`); acá no se suma, no se resta ni se clasifica nada,
 * solo se muestra.
 *
 * ## El período, y los dos bloques que NO lo siguen
 *
 * El selector ofrece ventanas móviles (hoy, 7, 30, 90 días), períodos de
 * calendario (esta semana, este mes) y un rango escrito a mano. Qué se le manda
 * al backend en cada caso lo decide `services/periodos.js`.
 *
 * **`rotacion` y `comprasPorProveedor` siguen al período. `stock` no**: viene
 * con `alcance: "actual"` y es siempre el estado de ahora, porque la tabla de
 * stock es la caché del saldo actual y no guarda su historia (reconstruirla
 * sería recorrer el libro entero y no entra en los 2 s de RNF2). Lo mismo
 * arrastran `masVendidos[].stockActual` y `diasDeCobertura`.
 *
 * Por eso el bloque de stock va separado y rotulado: sin el cartel, alguien lee
 * "108 unidades" como el stock que tenía en marzo. Es el riesgo más grande de
 * esta pantalla y la razón de `BadgeDeAlcance` y de `kpis-cobertura-proyectada`.
 *
 * ## Tiempo real
 *
 * Es refresco del cliente, igual que el panel de alertas (HU-17): cada minuto
 * con la pestaña visible, y en el acto al volver a ella. El backend tiene una
 * caché por comercio Y período que se descarta sola cuando cambia el stock, así
 * que refrescar seguido es barato y una venta recién registrada aparece en la
 * próxima carga. No hay websocket.
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

/** La hora del cálculo, para decir de cuándo son los números. */
function horaDe(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Cómo se nombra el período en el título de un bloque.
 *
 * Se arma con `pedido` —la marca de QUÉ se pidió, guardada junto a la
 * respuesta— y con el `periodo` que VOLVIÓ. Las dos cosas viajan juntas a
 * propósito: mientras se está recargando, en pantalla siguen los datos
 * anteriores, y rotularlos con el período recién elegido sería mentir.
 *
 * La redacción de la ventana móvil es la de HU-22, palabra por palabra, porque
 * el E2E que ya está mergeado busca "Rotación · últimos 30 días".
 */
function tituloDePeriodo(pedido, periodo) {
  return pedido.clase === "movil"
    ? `últimos ${periodo.dias} días`
    : etiquetaDeRespuesta(periodo);
}

/** Igual, pero para cerrar una frase: "No hubo ventas en …". */
function fraseDePeriodo(pedido, periodo) {
  return pedido.clase === "movil"
    ? `los últimos ${periodo.dias} días`
    : "el período elegido";
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

/**
 * @param {{ alCambiarPeriodo?: (periodo: object) => void }} props
 *   `alCambiarPeriodo` es el gancho para HU-24 (SCRUM-147, drill-down): avisa
 *   cuál es el período activo cada vez que cambia, así el drill-down puede
 *   pedir sus datos del mismo período sin levantar este estado ni duplicar el
 *   selector. Sin el prop, el componente se comporta igual que antes.
 */
export default function SeccionKpis({ alCambiarPeriodo }) {
  const [periodo, setPeriodo] = useState(PERIODO_POR_DEFECTO);
  const [abierto, setAbierto] = useState(false);
  const [intento, setIntento] = useState(0);
  const [carga, setCarga] = useState({
    clave: null,
    pedido: null,
    resultado: null,
    error: null,
  });

  // Igual que en `SeccionAlertas`: una vez que el backend dijo que el rol no
  // puede, queda solo el aviso. Sin latchear, el refresco de permisos que
  // dispara `AvisoDeError` desmonta la sección y la explicación parpadea.
  const [sinPermiso, setSinPermiso] = useState(false);

  // Cada pedido lleva un número y solo se acepta la respuesta del último: el
  // refresco de fondo y un cambio de período se pueden pisar, y los números de
  // 7 días no pueden quedar en pantalla con el selector en 90.
  const ultimoPedido = useRef(0);
  const enVuelo = useRef(false);
  const montado = useRef(true);

  const idTitulo = useId();
  const idErrorDeRango = useId();

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const errorDeRango = validarPeriodo(periodo);
  const listo = periodoListo(periodo);

  const clave = `${claveDePeriodo(periodo)}|${intento}`;
  // Con el período a medio escribir o al revés no se consulta —el aviso ya está
  // al lado de las fechas—, así que no hay nada que esperar y la sección no se
  // anuncia como ocupada.
  const cargando = listo && carga.clave !== clave;
  const { resultado, error, pedido } = carga;

  // Un 401 o un 403 no se curan solos: insistir cada minuto solo llena el log
  // del backend de rechazos. Un 400 TAMPOCO se cura solo —es el período lo que
  // está mal—, y sin esta excepción un rango de más de 366 días se re-pediría
  // cada minuto para siempre. Un fallo de red sí se cura, y el refresco es lo
  // que lo cura.
  const tipoDeFallo = error ? (error.tipo ?? clasificar(error)) : null;
  const convieneInsistir =
    (tipoDeFallo === null || tipoDeFallo === TIPO.GENERAL) &&
    error?.status !== 400;

  const cargar = useCallback(
    (deFondo = false) => {
      if (!periodoListo(periodo)) {
        return Promise.resolve();
      }

      if (deFondo && enVuelo.current) {
        return Promise.resolve();
      }

      const parametros = parametrosDePeriodo(periodo);

      // La marca de QUÉ se pidió, que se guarda junto a la respuesta. `clase`
      // decide la redacción de los títulos y `dias` es contra lo que se compara
      // `periodo.dias` para descubrir un recorte.
      const marca = {
        clase: opcionDe(periodo.id)?.clase ?? "calendario",
        dias: diasPedidos(periodo),
      };

      ultimoPedido.current += 1;
      const numero = ultimoPedido.current;
      enVuelo.current = true;

      return obtenerKpis(parametros)
        .then((respuesta) => {
          if (!montado.current || numero !== ultimoPedido.current) return;

          // El render lee los tres bloques derecho. Un 2xx sin cuerpo o con
          // otra forma (un proxy mal configurado, un backend desfasado) tiraría
          // un TypeError y, sin error boundary, blanquearía Inicio entero.
          if (
            !respuesta?.stock ||
            !respuesta.rotacion ||
            !respuesta.comprasPorProveedor ||
            !respuesta.periodo
          ) {
            throw new Error(
              "No se pudieron leer los indicadores. Probá de nuevo en un momento.",
            );
          }

          // Cinturón sobre el contador: en la vía del rango, el backend
          // devuelve los extremos que se le mandaron (en UTC, mismo instante),
          // así que una respuesta de OTRO rango se puede reconocer por el
          // cuerpo y no solo por el orden en que llegó. En la vía móvil no se
          // puede: `periodo.hasta` es el instante del pedido y `periodo.dias`
          // difiere legítimamente del pedido cuando el backend recorta a 90.
          //
          // Tira un error en vez de descartar en silencio: una respuesta vieja
          // ya la filtró el contador, así que si se llega acá con otro rango es
          // que el backend contestó otra cosa. Descartándola, la sección se
          // quedaba "cargando" para siempre sin decir por qué.
          if (parametros.desde && !esElRangoPedido(parametros, respuesta.periodo)) {
            throw new Error(
              "Los indicadores que llegaron no son del período que pediste. " +
                "Probá de nuevo en un momento.",
            );
          }

          setCarga({ clave, pedido: marca, resultado: respuesta, error: null });
        })
        .catch((fallo) => {
          if (!montado.current || numero !== ultimoPedido.current) return;

          // Lo que estaba en pantalla se conserva, con su propia marca: el
          // aviso va arriba y los datos de abajo siguen siendo los del período
          // con el que se pintaron.
          setCarga((previa) => ({
            clave,
            pedido: previa.pedido,
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
    [clave, periodo, setCarga, setSinPermiso],
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

  function elegir(nuevo) {
    setPeriodo(nuevo);
    alCambiarPeriodo?.(nuevo);
  }

  function elegirPreset(id) {
    setAbierto(false);
    // Volver a tocar el preset que ya está elegido no vuelve a pedir: `periodo`
    // es un objeto, así que sin esta guarda cada clic crea una referencia nueva,
    // `cargar` se rearma y el efecto dispara otro pedido del mismo período.
    if (periodo.id !== id) {
      elegir({ id });
    }
  }

  function abrirPersonalizado() {
    setAbierto(true);
    // Arranca con el día de hoy en los dos extremos: un rango de un día es
    // válido, así que al abrirlo ya se ve algo en vez de dos campos vacíos.
    if (periodo.id !== ID_PERSONALIZADO) {
      const hoy = diaEnZona();
      elegir({ id: ID_PERSONALIZADO, desde: hoy, hasta: hoy });
    }
  }

  function cambiarExtremo(extremo, valor) {
    elegir({ ...periodo, id: ID_PERSONALIZADO, [extremo]: valor });
  }

  // Un 400 solo puede ser del período: es lo único que esta pantalla manda. Se
  // muestra junto al selector, con el texto del backend tal cual, y no por
  // `AvisoDeError`: reintentar lo mismo da lo mismo, y lo accionable es la
  // fecha. Es el mismo criterio que el historial de compras de HU-21.
  const errorDePeriodo = error?.status === 400 ? error : null;
  const errorGeneral = error && !errorDePeriodo ? error : null;

  // El recorte silencioso: el backend baja a 90 cualquier `dias` mayor y
  // responde 200 sin decir nada. El selector no ofrece más de 90, así que hoy
  // es inalcanzable; se mira igual, contra `periodo.dias` de la RESPUESTA,
  // para que el día que se agregue un campo libre —o el backend baje el tope—
  // nadie crea que está mirando un año.
  const recortado =
    resultado && pedido?.dias != null && resultado.periodo.dias !== pedido.dias;

  const muestraDatos = Boolean(resultado) && !sinPermiso;

  return (
    <section
      aria-labelledby={idTitulo}
      data-testid="kpis"
      aria-busy={cargando}
      className="mt-8"
    >
      <h2
        id={idTitulo}
        className="mb-4 flex items-center gap-2 text-xl font-extrabold text-(--color-texto)"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--color-primario-suave) text-(--color-primario)">
          <BarChart3 aria-hidden="true" className="size-5" />
        </span>
        Indicadores del negocio
      </h2>

      {!sinPermiso && (
        <SelectorDePeriodo
          periodo={periodo}
          abierto={abierto}
          errorDeRango={errorDeRango}
          idErrorDeRango={idErrorDeRango}
          alElegirPreset={elegirPreset}
          alAbrirPersonalizado={abrirPersonalizado}
          alCambiarExtremo={cambiarExtremo}
        />
      )}

      {errorDePeriodo && (
        <p
          role="alert"
          data-testid="kpis-periodo-error"
          className="mt-3 rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          {errorDePeriodo.message}
        </p>
      )}

      {recortado && (
        // Informativo y NO `role="alert"`: el backend respondió 200, no falló
        // nada. Es el par que se confunde con el rechazo del rango por 366.
        <p
          data-testid="kpis-periodo-recortado"
          className="mt-3 rounded-(--radius) bg-(--color-atencion-suave) px-4 py-3
                     text-sm font-semibold text-(--color-atencion)"
        >
          Pediste {formatear(pedido.dias)} días y el máximo es{" "}
          {formatear(resultado.periodo.dias)}: estás viendo los últimos{" "}
          {formatear(resultado.periodo.dias)} días.
        </p>
      )}

      {errorGeneral && (
        <div
          data-testid="kpis-error"
          className={muestraDatos ? "mt-3 mb-4" : "mt-3"}
        >
          <AvisoDeError
            fallo={errorGeneral}
            alReintentar={
              sinPermiso ? undefined : () => setIntento((previo) => previo + 1)
            }
          />
        </div>
      )}

      {!resultado ? (
        !error && (
          <p
            data-testid="kpis-cargando"
            className="mt-4 text-(--color-texto-apagado)"
          >
            Calculando tus indicadores…
          </p>
        )
      ) : sinPermiso ? null : (
        <div className={cargando ? "mt-4 opacity-50 transition-opacity" : "mt-4"}>
          <p
            data-testid="kpis-actualizado"
            aria-live="polite"
            className="mb-4 text-sm text-(--color-texto-apagado)"
          >
            {cargando ? (
              "Actualizando…"
            ) : (
              <>
                Actualizado a las {horaDe(resultado.generadoEn)}. Ventas y
                compras, de{" "}
                <span data-testid="kpis-periodo-vigente" className="font-bold">
                  {fraseDePeriodo(pedido, resultado.periodo)}
                </span>
                . El stock es el de ahora.
              </>
            )}
          </p>

          <div className="grid gap-6">
            <BloqueStock stock={resultado.stock} />
            <BloqueRotacion
              rotacion={resultado.rotacion}
              periodo={resultado.periodo}
              pedido={pedido}
            />
            <BloqueCompras
              compras={resultado.comprasPorProveedor}
              periodo={resultado.periodo}
              pedido={pedido}
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

/**
 * Si la respuesta es la del rango que se pidió.
 *
 * El backend devuelve los extremos del rango tal como se los mandaron, pero
 * serializados en UTC con `Z`: `2026-03-01T00:00:00.000-03:00` vuelve como
 * `2026-03-01T03:00:00.000Z`. Es el mismo instante en otra representación, así
 * que se comparan como instantes y no como texto.
 */
function esElRangoPedido(parametros, periodo) {
  return (
    new Date(parametros.desde).getTime() === new Date(periodo.desde).getTime() &&
    new Date(parametros.hasta).getTime() === new Date(periodo.hasta).getTime()
  );
}

/**
 * El selector de período.
 *
 * Botones y no un `<select>`: se tocan mejor con el pulgar. El grupo conserva
 * el `role="group"` y el `aria-label` de HU-22, y los botones de 7, 30 y 90 su
 * nombre accesible, porque el page object del E2E que ya está mergeado los
 * busca así (`ventana(30)` → el botón "30 días").
 *
 * El rango a mano vive detrás de "Personalizado" y no siempre a la vista: el
 * caso común es tocar un preset, y dos campos vacíos permanentes ocupan lugar
 * sin decir nada.
 */
function SelectorDePeriodo({
  periodo,
  abierto,
  errorDeRango,
  idErrorDeRango,
  alElegirPreset,
  alAbrirPersonalizado,
  alCambiarExtremo,
}) {
  const personalizado = periodo.id === ID_PERSONALIZADO;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Período de ventas y compras"
        data-testid="kpis-selector"
        className="flex flex-wrap gap-1 rounded-(--radius) border-2 border-(--color-borde)
                   bg-(--color-tarjeta) p-1"
      >
        {PERIODOS.map((opcion) => (
          <BotonDePeriodo
            key={opcion.id}
            testId={`periodo-${opcion.id}`}
            activo={periodo.id === opcion.id}
            onClick={() => alElegirPreset(opcion.id)}
          >
            {opcion.etiqueta}
          </BotonDePeriodo>
        ))}

        <BotonDePeriodo
          testId="periodo-personalizado"
          activo={personalizado}
          aria-expanded={abierto}
          onClick={alAbrirPersonalizado}
        >
          <CalendarRange aria-hidden="true" className="mr-1 inline size-4" />
          Personalizado
        </BotonDePeriodo>
      </div>

      {abierto && (
        <div className="flex flex-col gap-2">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Campo
              id="periodo-desde"
              etiqueta="Desde"
              type="date"
              data-testid="periodo-desde"
              value={personalizado ? (periodo.desde ?? "") : ""}
              max={personalizado ? (periodo.hasta || undefined) : undefined}
              onChange={(evento) => alCambiarExtremo("desde", evento.target.value)}
              aria-invalid={Boolean(errorDeRango)}
              aria-describedby={errorDeRango ? idErrorDeRango : undefined}
            />
            <Campo
              id="periodo-hasta"
              etiqueta="Hasta"
              type="date"
              data-testid="periodo-hasta"
              value={personalizado ? (periodo.hasta ?? "") : ""}
              min={personalizado ? (periodo.desde || undefined) : undefined}
              onChange={(evento) => alCambiarExtremo("hasta", evento.target.value)}
              aria-invalid={Boolean(errorDeRango)}
              aria-describedby={errorDeRango ? idErrorDeRango : undefined}
            />
          </div>

          {errorDeRango && (
            // Con el rango así no se consulta nada: el aviso es el del cliente,
            // no el del backend, y es el par que se confunde con
            // `kpis-periodo-error` (que sí viene de una respuesta 400).
            <p
              id={idErrorDeRango}
              role="alert"
              data-testid="kpis-periodo-rango-invalido"
              className="text-sm font-semibold text-(--color-peligro)"
            >
              {errorDeRango}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BotonDePeriodo({ testId, activo, children, ...props }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={activo}
      className={`rounded-[calc(var(--radius)-4px)] px-3 py-1.5 text-sm font-bold transition
        focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)
        ${
          activo
            ? "bg-(--color-primario) text-(--color-primario-texto)"
            : "text-(--color-texto-apagado) hover:text-(--color-texto)"
        }`}
      {...props}
    >
      {children}
    </button>
  );
}

const TONOS = {
  primario: "bg-(--color-primario-suave) text-(--color-primario)",
  exito: "bg-(--color-exito-suave) text-(--color-exito)",
  atencion: "bg-(--color-atencion-suave) text-(--color-atencion)",
  peligro: "bg-(--color-peligro-suave) text-(--color-peligro)",
};

function Bloque({ titulo, testId, badge, children }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className="rounded-[2rem] border-2 border-(--color-borde) bg-(--color-tarjeta) p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 id={id} className="text-lg font-extrabold text-(--color-texto)">
          {titulo}
        </h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

/**
 * El cartel que dice que este bloque no sigue al período.
 *
 * Sin esto, con el período en marzo alguien lee las unidades de stock como las
 * que tenía en marzo. El backend manda `stock.alcance: "actual"` justamente
 * para que se pueda rotular, y es la regla que el contrato marca como el riesgo
 * más grande de la pantalla.
 */
function BadgeDeAlcance() {
  return (
    <span
      data-testid="kpis-stock-alcance"
      className="rounded-full bg-(--color-atencion-suave) px-2.5 py-1 text-xs
                 font-bold text-(--color-atencion)"
    >
      Siempre el stock de hoy
    </span>
  );
}

/**
 * Un número grande con su etiqueta. `testId` es el ancla de los tests y del E2E.
 *
 * El número va además en un `aria-label` junto a su etiqueta: el `textContent`
 * de la tarjeta sale todo pegado ("4Productos activos"), así que un lector de
 * pantalla —y el E2E— necesitan el par ya armado. El `textContent` del
 * `<testId>-valor` NO cambia: sigue siendo solo el número, que es lo que lee el
 * page object de HU-22.
 */
function Indicador({ icono: Icono, tono, valor, titulo, detalle, testId }) {
  return (
    <div data-testid={testId} className="rounded-(--radius) bg-(--color-apagado) p-4">
      <span className={`grid size-9 place-items-center rounded-full ${TONOS[tono]}`}>
        <Icono aria-hidden="true" className="size-5" />
      </span>
      <p
        data-testid={`${testId}-valor`}
        aria-label={`${titulo}: ${formatear(valor)}`}
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
function Figura({ titulo, tipo, datos, columnas, testId, ...props }) {
  return (
    <figure data-testid={testId} className="mt-5" {...props}>
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
    <Bloque
      titulo="Estado del stock"
      testId="kpis-stock"
      badge={<BadgeDeAlcance />}
    >
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

/**
 * La cobertura de un producto, que mezcla dos momentos y hay que rotularla.
 *
 * `diasDeCobertura` cruza el stock de HOY con el ritmo de venta DEL PERÍODO. Si
 * el período termina hoy, "alcanza para 8 días" se entiende solo. Si no —marzo,
 * por ejemplo— lo que dice es "al ritmo que vendías en marzo, lo que tenés hoy
 * te dura 8 días", que es una proyección útil pero NO la cobertura que tenías en
 * marzo. Ahí cambia la redacción y el testid, para que no se lea como un dato
 * del período.
 *
 * `null` no es cero: significa que no se vendió nada, así que no hay ritmo con
 * el que calcular nada. Se dice con todas las letras en vez de no mostrar nada,
 * porque un hueco al final de la fila no explica por qué está vacío, y porque
 * "0" diría algo falso (que el stock no alcanza para nada).
 */
function Cobertura({ fila, periodo }) {
  if (fila.diasDeCobertura === null) {
    return (
      <span
        data-testid="kpis-cobertura-sin-ritmo"
        className="shrink-0 text-right text-sm text-(--color-texto-apagado)"
      >
        sin ventas en el período
      </span>
    );
  }

  const texto = textoDeCobertura(fila);
  if (!texto) return null;

  if (terminaHoy(periodo)) {
    return (
      <span
        data-testid="kpis-cobertura"
        className="shrink-0 text-right text-sm font-semibold text-(--color-texto)"
      >
        {texto}
      </span>
    );
  }

  return (
    <span
      data-testid="kpis-cobertura-proyectada"
      className="shrink-0 text-right text-sm font-semibold text-(--color-texto)"
    >
      al ritmo del período, el stock de hoy {texto}
    </span>
  );
}

function BloqueRotacion({ rotacion, periodo, pedido }) {
  // Con el tope de 366 días, una barra por día son 366 líneas de un píxel. Se
  // agrupan por semana o por mes de calendario, sin descartar ningún día, así
  // que la suma de las barras sigue siendo `unidadesVendidas`.
  const { granularidad, barras } = agruparSerie(rotacion.porDia);
  const unidad = UNIDAD_DE_SERIE[granularidad];

  return (
    <Bloque
      titulo={`Rotación · ${tituloDePeriodo(pedido, periodo)}`}
      testId="kpis-rotacion"
    >
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
          No hubo ventas en {fraseDePeriodo(pedido, periodo)}.
        </Vacio>
      ) : (
        <>
          <Figura
            testId="kpis-figura-ventas"
            data-granularidad={granularidad}
            titulo={`Unidades vendidas por ${unidad}`}
            tipo="ventasPorDia"
            datos={barras}
            columnas={[
              {
                titulo: granularidad === "dia" ? "Día" : "Período",
                valor: (fila) => fila.etiqueta,
              },
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
                <Cobertura fila={fila} periodo={periodo} />
              </li>
            ))}
          </ol>
        </>
      )}
    </Bloque>
  );
}

function BloqueCompras({ compras, periodo, pedido }) {
  const barras = barrasDeCompras(compras);

  return (
    <Bloque
      titulo={`Compras por proveedor · ${tituloDePeriodo(pedido, periodo)}`}
      testId="kpis-compras"
    >
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
          No registraste compras en {fraseDePeriodo(pedido, periodo)}.
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
