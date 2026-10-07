import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SeccionRecomendaciones from "./SeccionRecomendaciones";

/**
 * Recomendaciones proactivas del asistente (HU-27).
 *
 * `obtenerRecomendaciones` está mockeado, pero `hayResumenDegradado` NO: es la
 * regla de la historia y se prueba a través del componente, igual que se va a
 * ejecutar en producción. Si se mockeara, el test pasaría con cualquier regla.
 *
 * Ningún test llama al modelo de lenguaje: el crédito del proveedor es uno solo
 * para los tres integrantes.
 */

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

vi.mock("../services/asistente", async (original) => ({
  ...(await original()),
  obtenerRecomendaciones: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");
const { obtenerRecomendaciones } = await import("../services/asistente");

const GENERADO_EN = "2026-10-07T19:51:02.100Z";

/**
 * Fixtures de UNO por tipo, con los textos EXACTOS que arma el backend.
 *
 * `enStock: 0` / `umbralMinimo: 1` y `unidadMedida: "unidad"` a propósito: es el
 * caso donde una redacción propia del cliente escribiría "1 unidades" o
 * "quedan 1 unidad". Las aserciones son de string completo, no parciales: un
 * `toHaveTextContent` parcial deja pasar justamente el error que importa.
 */
const REPONER = {
  tipo: "reponer",
  prioridad: "alta",
  producto: { id: "p-1", nombre: "Yerba Playadito" },
  texto:
    "No te queda nada de Yerba Playadito. El mínimo que fijaste es 1 unidad, así que convendría hacer un pedido.",
  porQue: "No quedan existencias y el mínimo configurado es 1.",
  datos: {
    enStock: 0,
    umbralMinimo: 1,
    unidadMedida: "unidad",
    faltanteHastaElUmbral: 1,
  },
};

const BAJA_ROTACION = {
  tipo: "baja_rotacion",
  prioridad: "media",
  producto: { id: "p-2", nombre: "Lavandina" },
  texto:
    "Hace 30 días que no vendés Lavandina y te queda 1 unidad. Podés probar con una promoción o no reponer por ahora.",
  porQue:
    "No tuvo ninguna venta entre el 07/09 y el 07/10, y quedan 1 unidad en stock.",
  datos: {
    enStock: 1,
    ventasEnVentana: 0,
    diasSinVenta: 30,
    unidadMedida: "unidad",
    categoria: "Limpieza",
  },
};

/** `producto` en `null`: habla del comercio entero, no de un producto. */
const SIN_HISTORIAL = {
  tipo: "sin_historial",
  prioridad: "baja",
  producto: null,
  texto:
    "Todavía no tengo suficientes ventas registradas para decirte qué productos no se mueven. Registrá tus ventas desde Registrar movimiento y en unos días te lo puedo contar.",
  porQue:
    "En los últimos 30 días se registraron 1 venta, y necesito al menos 3 para poder comparar.",
  datos: { ventasEnVentana: 1, ventasMinimas: 3, dias: 30 },
};

/**
 * El `resumen` de plantilla que el backend manda cuando no hay nada que
 * recomendar (`RESUMEN_SIN_RECOMENDACIONES`).
 *
 * Está acá porque el `resumen` por defecto de los fixtures tiene que depender
 * de si la lista está vacía, como pasa de verdad. Cuando no dependía, un
 * fixture emparejaba lista vacía con "encontré 1 producto para reponer" —una
 * combinación que el backend NUNCA emite— y eso escondió que el estado vacío
 * repetía el resumen casi palabra por palabra.
 */
const RESUMEN_SIN_RECOMENDACIONES =
  "Por ahora no tengo sugerencias para hacerte: no hay productos por debajo del mínimo y los que tenés se están moviendo.";

const RESUMEN_CON_RECOMENDACIONES =
  "Mirando tu negocio encontré 1 producto para reponer. Abajo te digo qué haría con cada uno.";

function respuesta({ modo, recomendaciones, resumen, generadoEn } = {}) {
  const lista = recomendaciones ?? [];

  return {
    generadoEn: generadoEn ?? GENERADO_EN,
    ventana: { dias: 30, desde: "2026-09-07T19:51:02.100Z" },
    modo: modo ?? "ia",
    resumen:
      resumen ??
      (lista.length === 0
        ? RESUMEN_SIN_RECOMENDACIONES
        : RESUMEN_CON_RECOMENDACIONES),
    recomendaciones: lista,
  };
}

/** Un fallo como los que tira `apiFetch`. */
function falloHttp(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

/** La hora como la formatea el componente, sin atarse al huso del que corra. */
function horaEsperada(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderizar() {
  return render(
    <MemoryRouter>
      <SeccionRecomendaciones />
    </MemoryRouter>,
  );
}

const aviso = () => screen.queryByTestId("recomendaciones-resumen-limitado");

beforeEach(() => {
  vi.clearAllMocks();
  obtenerConfiguracion.mockResolvedValue({});
  obtenerRecomendaciones.mockResolvedValue(
    respuesta({ recomendaciones: [REPONER] }),
  );
});

describe("Carga", () => {
  test("pide las recomendaciones al montarse, una sola vez", async () => {
    renderizar();

    await waitFor(() => expect(obtenerRecomendaciones).toHaveBeenCalledTimes(1));
    // Sin `dias`: la ventana por defecto la decide el backend.
    expect(obtenerRecomendaciones).toHaveBeenCalledWith();
  });

  test("mientras busca lo dice, y no muestra una sección a medio armar", () => {
    obtenerRecomendaciones.mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.getByText("Buscando sugerencias…")).toBeInTheDocument();
    expect(screen.queryByTestId("recomendaciones-resumen")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recomendaciones-vacio")).not.toBeInTheDocument();
  });

  test("en la primera carga no se ofrece «Actualizar»", () => {
    // No hay nada que actualizar todavía, y el botón decía "Actualizando…"
    // —porque `cargando` arranca en `true`— arriba del "Buscando sugerencias…":
    // dos indicadores del mismo estado, uno con la palabra equivocada.
    obtenerRecomendaciones.mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.queryByTestId("recomendaciones-actualizar")).not.toBeInTheDocument();
    expect(screen.queryByText("Actualizando…")).not.toBeInTheDocument();
  });

  test("una vez que llegaron los datos, el botón aparece como «Actualizar»", async () => {
    renderizar();

    const boton = await screen.findByTestId("recomendaciones-actualizar");
    expect(boton).toHaveTextContent("Actualizar");
    expect(boton).not.toBeDisabled();
  });
});

describe("El aviso de degradación depende de `modo`", () => {
  test("`limitado` avisa Y deja las recomendaciones a la vista", async () => {
    // Las dos aserciones importan. Sin la segunda, una implementación que
    // esconda la lista cuando el proveedor falló pasaría el test, y esconderla
    // es justo lo que no hay que hacer: con `limitado` la lista llega completa
    // y lo único que se degrada es el párrafo de arriba.
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ modo: "limitado", recomendaciones: [REPONER] }),
    );

    renderizar();

    expect(await screen.findByTestId("recomendaciones-resumen-limitado")).toBeInTheDocument();
    expect(screen.getByTestId("recomendacion-reponer")).toBeInTheDocument();
    expect(screen.getByText(REPONER.texto)).toBeInTheDocument();
  });

  test("`sin_novedades` NO avisa: es un comercio ordenado, no una caída", async () => {
    // El valor que el backend separó de `limitado` para que la pantalla no
    // muestre una alarma donde no hay ninguna.
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ modo: "sin_novedades", recomendaciones: [] }),
    );

    renderizar();

    await screen.findByTestId("recomendaciones-vacio");
    expect(aviso()).not.toBeInTheDocument();
  });

  test("`ia` no avisa", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ modo: "ia", recomendaciones: [REPONER] }),
    );

    renderizar();

    await screen.findByTestId("recomendacion-reponer");
    expect(aviso()).not.toBeInTheDocument();
  });

  test("un modo que todavía no existe tampoco lo dispara", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ modo: "algo_nuevo", recomendaciones: [REPONER] }),
    );

    renderizar();

    await screen.findByTestId("recomendacion-reponer");
    expect(aviso()).not.toBeInTheDocument();
  });
});

describe("El estado vacío depende de la lista, no de `modo`", () => {
  // Hoy el backend hace equivalentes "lista vacía" y `sin_novedades`, pero el
  // vacío se decide por la lista. Es lo que impide la implementación tentadora
  // `if (modo === "sin_novedades")`, que funcionaría por casualidad y se
  // rompería en silencio si el backend devolviera lista vacía con otro modo.
  for (const modo of ["sin_novedades", "ia", "limitado"]) {
    test(`con lista vacía y modo \`${modo}\` muestra el estado vacío`, async () => {
      obtenerRecomendaciones.mockResolvedValue(
        respuesta({ modo, recomendaciones: [] }),
      );

      renderizar();

      expect(await screen.findByTestId("recomendaciones-vacio")).toHaveTextContent(
        "Te aviso acá cuando algo baje del mínimo o deje de moverse.",
      );
      expect(screen.queryByRole("list", { name: "Sugerencias" })).not.toBeInTheDocument();
    });
  }

  test("el estado vacío no repite lo que ya dijo el resumen", async () => {
    // Los dos textos se leen uno abajo del otro. El resumen ya dice que no hay
    // nada; esta línea solo agrega que la sección se va a poblar sola. Antes
    // los dos arrancaban con "Por ahora no…" y se leía como un error de
    // armado.
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ modo: "sin_novedades", recomendaciones: [] }),
    );

    renderizar();

    const vacio = await screen.findByTestId("recomendaciones-vacio");
    const resumen = screen.getByTestId("recomendaciones-resumen");

    expect(resumen).toHaveTextContent(RESUMEN_SIN_RECOMENDACIONES);
    expect(vacio.textContent.trim()).toBe(
      "Te aviso acá cuando algo baje del mínimo o deje de moverse.",
    );
    expect(vacio.textContent).not.toContain("no hay nada");
    expect(vacio.textContent).not.toContain("Por ahora");
  });
});

describe("El resumen", () => {
  test("se muestra tal cual llega, con la hora de generación", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ resumen: "Un resumen cualquiera del backend." }),
    );

    renderizar();

    expect(await screen.findByTestId("recomendaciones-resumen")).toHaveTextContent(
      "Un resumen cualquiera del backend.",
    );
    expect(screen.getByTestId("recomendaciones-generado-en")).toHaveTextContent(
      `Actualizado a las ${horaEsperada(GENERADO_EN)}`,
    );
  });

  test("un `generadoEn` ilegible no tira la sección abajo", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ generadoEn: "no es una fecha", recomendaciones: [REPONER] }),
    );

    renderizar();

    await screen.findByTestId("recomendacion-reponer");
    expect(screen.queryByTestId("recomendaciones-generado-en")).not.toBeInTheDocument();
  });
});

describe("Las tarjetas", () => {
  test("`reponer` muestra texto y porQue tal cual, y lleva al producto", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ recomendaciones: [REPONER] }),
    );

    renderizar();

    const tarjeta = await screen.findByTestId("recomendacion-reponer");
    // Strings completos: es el caso "1 unidad", donde una redacción propia del
    // cliente escribiría "1 unidades".
    expect(screen.getByText(REPONER.texto)).toBeInTheDocument();
    expect(screen.getByText(REPONER.porQue)).toBeInTheDocument();
    expect(tarjeta).toHaveTextContent("Yerba Playadito");

    const link = screen.getByRole("link", { name: "Ver stock de Yerba Playadito" });
    expect(link).toHaveAttribute("href", "/productos/p-1");
  });

  test("`baja_rotacion` igual, y muestra la categoría", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ recomendaciones: [BAJA_ROTACION] }),
    );

    renderizar();

    await screen.findByTestId("recomendacion-baja_rotacion");
    expect(screen.getByText(BAJA_ROTACION.texto)).toBeInTheDocument();
    expect(screen.getByText(BAJA_ROTACION.porQue)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver stock de Lavandina" }),
    ).toHaveAttribute("href", "/productos/p-2");
    expect(screen.getByText("Categoría: Limpieza")).toBeInTheDocument();
  });

  test("`sin_historial` viene con `producto` en null: no rompe y NO lleva link", async () => {
    // El caso que más aparece en desarrollo, con pocos datos de prueba. Si la
    // tarjeta asumiera `producto.nombre`, acá reventaría la pantalla entera.
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ modo: "limitado", recomendaciones: [SIN_HISTORIAL] }),
    );

    renderizar();

    const tarjeta = await screen.findByTestId("recomendacion-sin_historial");
    expect(screen.getByText(SIN_HISTORIAL.texto)).toBeInTheDocument();
    expect(screen.getByText(SIN_HISTORIAL.porQue)).toBeInTheDocument();
    // No hay ninguna ficha de producto a la que ir.
    expect(tarjeta.querySelector("a")).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  test("cada prioridad tiene su badge, con la palabra y no solo el color", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({
        recomendaciones: [REPONER, BAJA_ROTACION, SIN_HISTORIAL],
      }),
    );

    renderizar();

    const reponer = await screen.findByTestId("recomendacion-reponer");
    expect(reponer).toHaveAttribute("data-prioridad", "alta");
    expect(reponer).toHaveTextContent("Alta");

    const baja = screen.getByTestId("recomendacion-baja_rotacion");
    expect(baja).toHaveAttribute("data-prioridad", "media");
    expect(baja).toHaveTextContent("Media");

    const sinHistorial = screen.getByTestId("recomendacion-sin_historial");
    expect(sinHistorial).toHaveAttribute("data-prioridad", "baja");
    expect(sinHistorial).toHaveTextContent("Baja");
  });

  test("una prioridad desconocida no deja el badge sin estilo", async () => {
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({
        recomendaciones: [{ ...REPONER, prioridad: "altisima" }],
      }),
    );

    renderizar();

    const tarjeta = await screen.findByTestId("recomendacion-reponer");
    expect(tarjeta).toHaveAttribute("data-prioridad", "altisima");
    // Cae en la más baja, que es la que menos grita.
    expect(tarjeta).toHaveTextContent("Baja");
  });

  test("se renderizan en el orden en que llegan, sin reordenar", async () => {
    // El backend ordena por urgencia (reposición primero). La lista llega acá
    // con `baja_rotacion` arriba a propósito: si el componente ordenara por su
    // cuenta, los pondría al revés y este test lo vería.
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ recomendaciones: [BAJA_ROTACION, SIN_HISTORIAL, REPONER] }),
    );

    renderizar();

    await screen.findByTestId("recomendacion-reponer");
    const tipos = screen
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("data-testid"));

    expect(tipos).toEqual([
      "recomendacion-baja_rotacion",
      "recomendacion-sin_historial",
      "recomendacion-reponer",
    ]);
  });
});

describe("Actualizar", () => {
  test("vuelve a pedir, y el mismo resumen de vuelta no es un error", async () => {
    // El resumen está cacheado 10 minutos del lado del servidor: dos llamadas
    // seguidas devuelven el mismo párrafo mientras no cambien las
    // recomendaciones. No es un bug y no se muestra como tal. Lo único que
    // confirma que el refresco ocurrió es la hora.
    const mismoResumen = "Mirando tu negocio encontré 1 producto para reponer.";
    const masTarde = "2026-10-07T20:10:02.100Z";

    obtenerRecomendaciones
      .mockResolvedValueOnce(
        respuesta({ resumen: mismoResumen, recomendaciones: [REPONER] }),
      )
      .mockResolvedValueOnce(
        respuesta({
          resumen: mismoResumen,
          recomendaciones: [REPONER],
          generadoEn: masTarde,
        }),
      );

    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId("recomendacion-reponer");
    expect(screen.getByTestId("recomendaciones-generado-en")).toHaveTextContent(
      `Actualizado a las ${horaEsperada(GENERADO_EN)}`,
    );

    await usuario.click(screen.getByTestId("recomendaciones-actualizar"));

    await waitFor(() =>
      expect(screen.getByTestId("recomendaciones-generado-en")).toHaveTextContent(
        `Actualizado a las ${horaEsperada(masTarde)}`,
      ),
    );
    // La hora es la señal; el resumen sigue siendo el mismo y está bien.
    expect(screen.getByTestId("recomendaciones-resumen")).toHaveTextContent(
      mismoResumen,
    );
    // Ni error, ni "sin cambios", ni ningún aviso.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(aviso()).not.toBeInTheDocument();
    expect(horaEsperada(masTarde)).not.toBe(horaEsperada(GENERADO_EN));
  });

  test("mientras actualiza no se puede volver a pedir", async () => {
    // Cada llamada puede gastar crédito del proveedor, que es compartido por
    // todo el equipo.
    let resolver;
    obtenerRecomendaciones
      .mockResolvedValueOnce(respuesta({ recomendaciones: [REPONER] }))
      .mockReturnValueOnce(new Promise((cumplir) => (resolver = cumplir)));

    renderizar();
    await screen.findByTestId("recomendacion-reponer");

    const boton = screen.getByTestId("recomendaciones-actualizar");
    fireEvent.click(boton);

    await waitFor(() => expect(boton).toBeDisabled());
    expect(boton).toHaveTextContent("Actualizando…");

    fireEvent.click(boton);
    fireEvent.click(boton);

    expect(obtenerRecomendaciones).toHaveBeenCalledTimes(2);

    resolver(respuesta({ recomendaciones: [REPONER] }));
    await waitFor(() => expect(boton).not.toBeDisabled());
  });

  test("durante el refresco no se vacía lo que ya se estaba viendo", async () => {
    obtenerRecomendaciones
      .mockResolvedValueOnce(respuesta({ recomendaciones: [REPONER] }))
      .mockReturnValueOnce(new Promise(() => {}));

    renderizar();
    await screen.findByTestId("recomendacion-reponer");

    fireEvent.click(screen.getByTestId("recomendaciones-actualizar"));

    // Un parpadeo a vacío se lee como que no hay nada.
    await waitFor(() =>
      expect(screen.getByTestId("recomendaciones-actualizar")).toBeDisabled(),
    );
    expect(screen.getByTestId("recomendacion-reponer")).toBeInTheDocument();
    expect(screen.queryByTestId("recomendaciones-vacio")).not.toBeInTheDocument();
  });
});

describe("Cuando la API dice que no", () => {
  test("un 403 muestra el aviso de permiso, en gris y sin salida al login", async () => {
    obtenerRecomendaciones.mockRejectedValue(
      falloHttp(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();

    expect(await screen.findByTestId("aviso-permiso")).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-sesion")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Volver a entrar" })).not.toBeInTheDocument();
  });

  test("tras un 403 no se ofrece reintentar ni actualizar", async () => {
    // Que al rol no le toque no se arregla insistiendo. Y el aviso queda
    // latcheado: `AvisoDeError` relee los permisos ante un 403, y ese refresco
    // no tiene que hacer desaparecer la explicación que la persona está leyendo.
    obtenerRecomendaciones.mockRejectedValue(
      falloHttp(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();

    await screen.findByTestId("aviso-permiso");
    expect(screen.queryByTestId("recomendaciones-actualizar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.getByTestId("aviso-permiso")).toBeInTheDocument();
  });

  test("un refresco que se cae NO se lleva puesto lo que ya se estaba viendo", async () => {
    // Lo que había en pantalla seguía siendo válido un segundo antes. Tirarlo
    // abajo es perder información buena por un problema de red, y contradice
    // la misma razón por la que la lista no se vacía mientras se refresca.
    obtenerRecomendaciones
      .mockResolvedValueOnce(respuesta({ recomendaciones: [REPONER] }))
      .mockRejectedValueOnce(new Error("sin red"));

    const usuario = userEvent.setup();
    renderizar();
    await screen.findByTestId("recomendacion-reponer");

    await usuario.click(screen.getByTestId("recomendaciones-actualizar"));

    expect(await screen.findByTestId("aviso-general")).toBeInTheDocument();
    // El aviso avisa; las recomendaciones siguen ahí.
    expect(screen.getByTestId("recomendacion-reponer")).toBeInTheDocument();
    expect(screen.getByText(REPONER.texto)).toBeInTheDocument();
  });

  test("pero un 403 al refrescar sí esconde los datos", async () => {
    // Acá no es un problema de red: al rol dejó de corresponderle esta lectura
    // —le cambiaron el rol con la app abierta— así que lo que había en pantalla
    // no se sigue mostrando.
    obtenerRecomendaciones
      .mockResolvedValueOnce(respuesta({ recomendaciones: [REPONER] }))
      .mockRejectedValueOnce(
        falloHttp(403, "El rol no tiene permiso para esta accion"),
      );

    const usuario = userEvent.setup();
    renderizar();
    await screen.findByTestId("recomendacion-reponer");

    await usuario.click(screen.getByTestId("recomendaciones-actualizar"));

    expect(await screen.findByTestId("aviso-permiso")).toBeInTheDocument();
    expect(screen.queryByTestId("recomendacion-reponer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recomendaciones-resumen")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recomendaciones-actualizar")).not.toBeInTheDocument();
  });

  test("un 2xx con el cuerpo ilegible es un fallo, no un «buscando» eterno", async () => {
    // `apiFetch` devuelve `null` ante un 2xx sin cuerpo o con un JSON que no
    // se pudo parsear. Guardarlo dejaba un estado de carga que mentía: no
    // había nada en vuelo y la pantalla seguía diciendo "Buscando sugerencias…".
    obtenerRecomendaciones.mockResolvedValueOnce(null);

    renderizar();

    expect(await screen.findByTestId("aviso-general")).toBeInTheDocument();
    expect(screen.queryByText("Buscando sugerencias…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  test("un fallo de red se puede reintentar, y al volver muestra los datos", async () => {
    obtenerRecomendaciones
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValueOnce(respuesta({ recomendaciones: [REPONER] }));

    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId("aviso-general");

    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("recomendacion-reponer")).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-general")).not.toBeInTheDocument();
  });
});

describe("Contrato con los E2E (SCRUM-106)", () => {
  test("la sección y la lista tienen nombre accesible, sin pisar al asistente", async () => {
    // El título NO puede contener "asistente": el page object de HU-26 busca el
    // panel del chat con `getByRole("region", { name: "Asistente" })` sin
    // `exact`, y Playwright matchea por substring. Una región "… asistente"
    // acá haría que ese locator encontrara dos elementos en Inicio.
    obtenerRecomendaciones.mockResolvedValue(
      respuesta({ recomendaciones: [REPONER] }),
    );

    renderizar();

    await screen.findByTestId("recomendacion-reponer");

    const titulo = screen.getByRole("heading", {
      level: 2,
      name: "Sugerencias para tu negocio",
    });
    expect(titulo).toBeInTheDocument();
    expect(titulo.textContent.toLowerCase()).not.toContain("asistente");

    const seccion = screen.getByTestId("recomendaciones");
    expect(seccion).toHaveAttribute("aria-labelledby", titulo.id);
    expect(screen.getByRole("list", { name: "Sugerencias" })).toBeInTheDocument();
  });
});
