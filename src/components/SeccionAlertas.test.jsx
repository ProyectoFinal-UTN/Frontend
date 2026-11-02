import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SeccionAlertas, { CADENCIA_DE_REFRESCO_MS } from "./SeccionAlertas";

vi.mock("../services/alertas", async (original) => ({
  ...(await original()),
  obtenerAlertas: vi.fn(),
}));

// `AvisoDeError` relee los permisos al ver un 403. Acá no interesa esa parte, y
// sin el mock saldría a buscar `/api/configuracion` de verdad.
vi.mock("../services/permisos", async (original) => ({
  ...(await original()),
  refrescarPermisos: vi.fn(),
}));

const { obtenerAlertas } = await import("../services/alertas");

function proveedor(overrides = {}) {
  return {
    id: "v1",
    nombre: "Distribuidora Sur",
    telefono: "11 5555-0000",
    correo: "ventas@distrisur.com",
    ...overrides,
  };
}

/** Una sola alerta: con fixtures de tres, un bug en la fila se esconde. */
function alerta(overrides = {}) {
  return {
    id: "a1",
    generadaEn: "2026-10-29T13:05:00.000Z",
    producto: {
      id: "p1",
      nombre: "Yerba 1 kg",
      codigoBarras: "7790000000000",
      categoria: "Almacén",
      unidadMedida: "unidad",
    },
    stockActual: 3,
    umbralMinimo: 10,
    faltanteHastaElUmbral: 7,
    stockAlGenerar: 3,
    umbralAlGenerar: 10,
    ubicaciones: [{ id: "u1", nombre: "Depósito", cantidad: 3 }],
    proveedorSugerido: proveedor(),
    proveedores: [proveedor()],
    ...overrides,
  };
}

/** Una alerta con nombre propio, para los tests que miran varias filas. */
function alertaDe(nombre, overrides = {}) {
  return alerta({
    id: `a-${nombre}`,
    producto: { ...alerta().producto, id: `p-${nombre}`, nombre },
    ...overrides,
  });
}

function respuesta({ alertas = [alerta()], paginacion } = {}) {
  return {
    alertas,
    paginacion: {
      pagina: 1,
      limite: 6,
      total: alertas.length,
      // El backend devuelve 0, no 1, cuando no hay nada.
      totalPaginas: alertas.length ? 1 : 0,
      ...paginacion,
    },
  };
}

function fallo(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

function renderizar() {
  return render(
    <MemoryRouter>
      <SeccionAlertas />
    </MemoryRouter>,
  );
}

/** Espera a que baje el "Buscando…" de la primera carga. */
async function esperarCarga() {
  await waitFor(() =>
    expect(screen.queryByTestId("alertas-cargando")).not.toBeInTheDocument(),
  );
}

const panel = () => screen.getByTestId("alertas");
const filas = () => screen.getAllByTestId("alerta-fila");
const nombresVisibles = () =>
  screen.getAllByTestId("alerta-fila").map((f) => f.getAttribute("data-producto-id"));

beforeEach(() => {
  obtenerAlertas.mockReset().mockResolvedValue(respuesta());
});

describe("Carga inicial", () => {
  test("pide la primera página al montarse", async () => {
    renderizar();
    await esperarCarga();

    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
    expect(obtenerAlertas).toHaveBeenCalledWith({ pagina: 1 });
  });

  test("mientras pide avisa que está buscando y se marca ocupado", async () => {
    let resolver;
    obtenerAlertas.mockReturnValue(
      new Promise((cumplir) => {
        resolver = cumplir;
      }),
    );

    renderizar();

    expect(screen.getByTestId("alertas-cargando")).toBeInTheDocument();
    expect(panel()).toHaveAttribute("aria-busy", "true");

    resolver(respuesta());
    await esperarCarga();

    expect(panel()).toHaveAttribute("aria-busy", "false");
  });
});

describe("La fila", () => {
  test("muestra el faltante que ya calculó el backend", async () => {
    // El 7 no se deduce de 10 − 3 acá: viene en `faltanteHastaElUmbral`. El
    // test lo fija mandando un faltante que NO es la resta, así que si alguien
    // pone la resta en el cliente, falla.
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [
          alerta({ stockActual: 3, umbralMinimo: 10, faltanteHastaElUmbral: 7 }),
        ],
      }),
    );

    renderizar();
    await esperarCarga();

    const fila = filas()[0];
    expect(
      within(fila).getByLabelText("Faltan 7 unidad para el mínimo"),
    ).toBeInTheDocument();
    expect(
      within(fila).getByLabelText("Te quedan 3 unidad, el mínimo es 10"),
    ).toBeInTheDocument();
  });

  test("un producto justo en el mínimo aparece igual y se dice distinto", async () => {
    // Alcanzar el umbral ya es estar en falta: el backend la manda con
    // faltante 0 y el panel NO la filtra.
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [
          alerta({ stockActual: 10, umbralMinimo: 10, faltanteHastaElUmbral: 0 }),
        ],
      }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alerta-fila")).toBeInTheDocument();
    expect(screen.getByTestId("alerta-faltante-cero")).toHaveTextContent(
      "Está justo en el mínimo",
    );
    expect(screen.queryByTestId("alerta-faltante")).not.toBeInTheDocument();
  });

  test("muestra todas las ubicaciones y no solo la primera", async () => {
    // El umbral es por producto y se compara contra el total del comercio: no
    // existe "la ubicación de la alerta". Aserción completa sobre el desglose,
    // no un match parcial, porque lo que se verifica es que no falte ninguna.
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [
          alerta({
            stockActual: 3,
            ubicaciones: [
              { id: "u1", nombre: "Depósito", cantidad: 2 },
              { id: "u2", nombre: "Salón", cantidad: 1 },
            ],
          }),
        ],
      }),
    );

    renderizar();
    await esperarCarga();

    const bloque = screen.getByTestId("alertas-ubicaciones");
    const etiquetas = within(bloque)
      .getAllByTestId("alerta-ubicacion")
      .map((u) => u.getAttribute("aria-label"));

    expect(etiquetas).toEqual(["Depósito: 2 unidad", "Salón: 1 unidad"]);
    expect(screen.queryByTestId("alerta-sin-ubicaciones")).not.toBeInTheDocument();
  });

  test("un producto sin existencias en ninguna ubicación lo dice", async () => {
    obtenerAlertas.mockResolvedValue(
      respuesta({ alertas: [alerta({ stockActual: 0, ubicaciones: [] })] }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alerta-sin-ubicaciones")).toBeInTheDocument();
    expect(screen.queryByTestId("alertas-ubicaciones")).not.toBeInTheDocument();
  });

  test("una alerta sin proveedor aparece igual", async () => {
    // `proveedorSugerido` es null cuando el producto no tiene proveedores
    // asociados, y el faltante existe aunque no se sepa a quién comprarle.
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [alerta({ proveedorSugerido: null, proveedores: [] })],
      }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alerta-fila")).toBeInTheDocument();
    expect(screen.getByTestId("alerta-sin-proveedor")).toBeInTheDocument();
    expect(
      screen.queryByTestId("alerta-proveedor-sugerido"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("alerta-otros-proveedores")).not.toBeInTheDocument();
  });

  test("el proveedor se presenta como sugerido y nunca como principal", async () => {
    // La relación producto↔proveedor es N:M y el modelo no guarda cuál es el
    // principal: decirlo sería inventar un dato que no existe.
    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alerta-proveedor-sugerido")).toHaveTextContent(
      "Sugerido: Distribuidora Sur",
    );
    expect(panel().textContent).not.toMatch(/principal/i);
  });

  test("con más de un proveedor nombra a los otros", async () => {
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [
          alerta({
            proveedorSugerido: proveedor(),
            proveedores: [
              proveedor(),
              proveedor({ id: "v2", nombre: "Mayorista Norte" }),
              proveedor({ id: "v3", nombre: "Central" }),
            ],
          }),
        ],
      }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alerta-otros-proveedores")).toHaveTextContent(
      "También se lo podés pedir a Mayorista Norte, Central",
    );
  });

  test("con un solo proveedor no dice que haya otros", async () => {
    renderizar();
    await esperarCarga();

    expect(screen.queryByTestId("alerta-otros-proveedores")).not.toBeInTheDocument();
  });

  test("avisa que el stock siguió bajando desde que saltó la alerta", async () => {
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [alerta({ stockActual: 1, stockAlGenerar: 3 })],
      }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alerta-bajo-desde-el-aviso")).toHaveTextContent(
      "Bajó de 3 a 1 desde el aviso",
    );
  });

  test("si el stock no bajó desde el aviso no agrega la línea", async () => {
    // Si no, sería una línea en todas las filas diciendo que nada cambió.
    renderizar();
    await esperarCarga();

    expect(
      screen.queryByTestId("alerta-bajo-desde-el-aviso"),
    ).not.toBeInTheDocument();
  });

  test("el link del detalle no choca por nombre con el de las sugerencias", async () => {
    // HU-27 usa «Ver stock de <producto>» y muestra los MISMOS productos en el
    // MISMO dashboard: dos links con el mismo nombre accesible romperían
    // cualquier búsqueda por nombre.
    renderizar();
    await esperarCarga();

    const link = screen.getByRole("link", { name: "Ver el detalle de Yerba 1 kg" });
    expect(link).toHaveAttribute("href", "/productos/p1");
    expect(
      screen.queryByRole("link", { name: /Ver stock de/ }),
    ).not.toBeInTheDocument();
  });

  test("respeta el orden del backend y no reordena por el faltante", async () => {
    // El orden del backend es por `stockActual - umbralMinimo`, que NO es lo
    // mismo que ordenar por el faltante. Si alguien ordena acá, este test cae.
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [
          alertaDe("Yerba", { faltanteHastaElUmbral: 2 }),
          alertaDe("Arroz", { faltanteHastaElUmbral: 9 }),
        ],
      }),
    );

    renderizar();
    await esperarCarga();

    expect(nombresVisibles()).toEqual(["p-Yerba", "p-Arroz"]);
  });
});

describe("Estado vacío", () => {
  test("sin alertas activas lo dice y no muestra lista ni paginación", async () => {
    obtenerAlertas.mockResolvedValue(respuesta({ alertas: [] }));

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alertas-vacio")).toBeInTheDocument();
    expect(screen.queryByTestId("alertas-lista")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alertas-paginacion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alertas-contador")).not.toBeInTheDocument();
    // No es un error: no hay nada que reponer es una buena noticia.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("una página más allá del total no es un error", async () => {
    // 200 con la lista vacía y total > 0. Se ve parecido al vacío de arriba y
    // significa lo contrario, así que cada uno tiene su propio testid.
    obtenerAlertas.mockResolvedValue(
      respuesta({ alertas: [], paginacion: { total: 3, totalPaginas: 1 } }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alertas-pagina-vacia")).toBeInTheDocument();
    expect(screen.queryByTestId("alertas-vacio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alertas-error")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("«Volver a la primera» vuelve a pedir la página 1", async () => {
    const usuario = userEvent.setup();
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [],
        paginacion: { pagina: 4, total: 3, totalPaginas: 1 },
      }),
    );

    renderizar();
    await esperarCarga();
    await usuario.click(screen.getByRole("button", { name: "Volver a la primera" }));

    expect(obtenerAlertas).toHaveBeenLastCalledWith({ pagina: 1 });
  });
});

describe("Paginación", () => {
  const tresPaginas = (pagina, alertas) =>
    respuesta({ alertas, paginacion: { pagina, total: 3, totalPaginas: 3 } });

  test("con una sola página no dibuja los controles", async () => {
    renderizar();
    await esperarCarga();

    expect(screen.queryByTestId("alertas-paginacion")).not.toBeInTheDocument();
    expect(screen.getByTestId("alertas-contador")).toHaveTextContent(
      "1 producto para reponer",
    );
  });

  test("«Siguiente» pide la página siguiente y mantiene la lista mientras llega", async () => {
    const usuario = userEvent.setup();
    obtenerAlertas.mockResolvedValueOnce(tresPaginas(1, [alertaDe("Yerba")]));

    renderizar();
    await esperarCarga();

    let resolver;
    obtenerAlertas.mockReturnValueOnce(
      new Promise((cumplir) => {
        resolver = cumplir;
      }),
    );

    await usuario.click(screen.getByTestId("pagina-siguiente"));

    expect(obtenerAlertas).toHaveBeenLastCalledWith({ pagina: 2 });
    // La lista anterior se mantiene en vez de desaparecer: un salto a blanco y
    // vuelta se lee como que ya no hay nada que reponer.
    expect(nombresVisibles()).toEqual(["p-Yerba"]);
    expect(screen.getByTestId("alertas-contador")).toHaveTextContent("Actualizando…");
    expect(panel()).toHaveAttribute("aria-busy", "true");

    resolver(tresPaginas(2, [alertaDe("Arroz")]));
    await waitFor(() => expect(nombresVisibles()).toEqual(["p-Arroz"]));
    expect(panel()).toHaveAttribute("aria-busy", "false");
  });

  test("en la última página «Siguiente» queda deshabilitado", async () => {
    const usuario = userEvent.setup();
    obtenerAlertas.mockResolvedValue(tresPaginas(3, [alertaDe("Arroz")]));

    renderizar();
    await esperarCarga();
    await usuario.click(screen.getByTestId("pagina-siguiente"));
    await usuario.click(screen.getByTestId("pagina-siguiente"));

    // Dos clics y el botón se apaga en el segundo: los controles se mueven con
    // la página PEDIDA, no con la que devolvió la respuesta anterior.
    expect(screen.getByTestId("pagina-siguiente")).toBeDisabled();
    expect(screen.getByTestId("pagina-actual")).toHaveTextContent("Página 3 de 3");
  });

  test("el contador usa el límite de la respuesta, no el que se pidió", async () => {
    // El backend recorta en silencio cualquier límite por encima de 200, así
    // que un contador armado con lo pedido mentiría.
    obtenerAlertas.mockResolvedValue(
      respuesta({
        alertas: [alertaDe("Yerba"), alertaDe("Arroz")],
        paginacion: { pagina: 2, limite: 200, total: 500, totalPaginas: 3 },
      }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("alertas-contador")).toHaveTextContent(
      "201 a 202 de 500",
    );
  });
});

describe("Errores", () => {
  test("un fallo de red avisa y deja reintentar", async () => {
    const usuario = userEvent.setup();
    // `fetch` rechaza con un TypeError sin `status`: cae en el aviso general.
    obtenerAlertas.mockRejectedValueOnce(new Error("Failed to fetch"));

    renderizar();

    expect(await screen.findByTestId("alertas-error")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-general")).toBeInTheDocument();
    expect(screen.queryByTestId("alertas-cargando")).not.toBeInTheDocument();

    obtenerAlertas.mockResolvedValueOnce(respuesta());
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("alerta-fila")).toBeInTheDocument();
    expect(screen.queryByTestId("alertas-error")).not.toBeInTheDocument();
  });

  test("un 401 ofrece volver a entrar", async () => {
    obtenerAlertas.mockRejectedValueOnce(fallo(401, "No hay sesion activa"));

    renderizar();

    expect(await screen.findByTestId("aviso-sesion")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a entrar" })).toBeInTheDocument();
  });

  test("un 403 no ofrece volver a entrar ni muestra la lista", async () => {
    // Si la UI desloguea por un 403, el login funciona, la acción vuelve a
    // fallar y la persona queda en un loop del que no puede salir.
    obtenerAlertas.mockRejectedValueOnce(
      fallo(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();

    expect(await screen.findByTestId("aviso-permiso")).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-sesion")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Volver a entrar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  test("un 400 de paginación muestra el mensaje del backend", async () => {
    obtenerAlertas.mockRejectedValueOnce(
      fallo(400, 'El parámetro "pagina" debe ser un número entero mayor a 0'),
    );

    renderizar();

    expect(await screen.findByTestId("alertas-error")).toHaveTextContent(
      'El parámetro "pagina" debe ser un número entero mayor a 0',
    );
  });

  test("un fallo al cambiar de página avisa arriba y no borra la lista", async () => {
    const usuario = userEvent.setup();
    obtenerAlertas.mockResolvedValueOnce(
      respuesta({
        alertas: [alertaDe("Yerba")],
        paginacion: { total: 3, totalPaginas: 3 },
      }),
    );

    renderizar();
    await esperarCarga();

    obtenerAlertas.mockRejectedValueOnce(new Error("Failed to fetch"));
    await usuario.click(screen.getByTestId("pagina-siguiente"));

    // Lo que estaba en pantalla seguía siendo válido un segundo antes: tirarlo
    // abajo es perder información buena por un problema de red.
    expect(await screen.findByTestId("alertas-error")).toBeInTheDocument();
    expect(nombresVisibles()).toEqual(["p-Yerba"]);
  });

  test.each([
    ["sin cuerpo", null],
    ["sin paginacion", { alertas: [] }],
    ["sin alertas", { paginacion: { pagina: 1, limite: 6, total: 0, totalPaginas: 0 } }],
    ["con alertas que no es un array", { alertas: null, paginacion: {} }],
  ])(
    "una respuesta %s se trata como un fallo y no rompe el dashboard",
    async (_caso, cuerpo) => {
      // El render lee `paginacion.totalPaginas` derecho. Un 2xx que parsea
      // pero viene incompleto tiraría un TypeError y, sin error boundary,
      // React desmontaría Inicio entero: el comerciante vería una pantalla en
      // blanco en vez de un aviso con "Reintentar".
      obtenerAlertas.mockResolvedValueOnce(cuerpo);

      renderizar();

      expect(await screen.findByTestId("aviso-general")).toBeInTheDocument();
      expect(screen.queryByTestId("alertas-cargando")).not.toBeInTheDocument();
      // Lo que importa: el panel sigue montado y con su título.
      expect(panel()).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Hay que reponer/ })).toBeInTheDocument();
    },
  );

  test("una respuesta sin cuerpo se trata como un fallo y no como carga eterna", async () => {
    // `apiFetch` devuelve null ante un 2xx con un JSON que no se pudo parsear.
    // Guardarlo dejaba el panel en "Buscando…" para siempre.
    obtenerAlertas.mockResolvedValueOnce(null);

    renderizar();

    expect(await screen.findByTestId("aviso-general")).toBeInTheDocument();
    expect(screen.queryByTestId("alertas-cargando")).not.toBeInTheDocument();
  });
});

describe("Carrera entre respuestas", () => {
  test("una respuesta vieja que llega tarde no pisa a la nueva", async () => {
    const usuario = userEvent.setup();
    obtenerAlertas.mockResolvedValueOnce(
      respuesta({
        alertas: [alertaDe("Yerba")],
        paginacion: { total: 3, totalPaginas: 3 },
      }),
    );

    renderizar();
    await esperarCarga();

    let resolverSegunda;
    let resolverTercera;
    obtenerAlertas
      .mockReturnValueOnce(
        new Promise((cumplir) => {
          resolverSegunda = cumplir;
        }),
      )
      .mockReturnValueOnce(
        new Promise((cumplir) => {
          resolverTercera = cumplir;
        }),
      );

    await usuario.click(screen.getByTestId("pagina-siguiente"));
    await usuario.click(screen.getByTestId("pagina-siguiente"));

    expect(obtenerAlertas).toHaveBeenLastCalledWith({ pagina: 3 });

    // La tercera vuelve primero y se muestra.
    resolverTercera(
      respuesta({
        alertas: [alertaDe("Arroz")],
        paginacion: { pagina: 3, total: 3, totalPaginas: 3 },
      }),
    );
    await waitFor(() => expect(nombresVisibles()).toEqual(["p-Arroz"]));

    // Y la segunda, que llega tarde, no escribe nada.
    resolverSegunda(
      respuesta({
        alertas: [alertaDe("Azucar")],
        paginacion: { pagina: 2, total: 3, totalPaginas: 3 },
      }),
    );
    await act(async () => {});

    expect(nombresVisibles()).toEqual(["p-Arroz"]);
    expect(panel()).toHaveAttribute("aria-busy", "false");
  });
});

describe("Refresco automático", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // El getter se definió como propiedad propia del documento; borrarlo
    // devuelve el del prototipo.
    delete document.visibilityState;
  });

  function conPestana(estado) {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => estado,
    });
  }

  /**
   * Mueve el reloj dentro de `act`.
   *
   * Con timers falsos no se puede usar el `waitFor` de testing-library: espera
   * contra un reloj que no avanza solo y se queda colgado.
   */
  async function avanzar(ms) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  test("se refresca solo pasada la cadencia, sin verse como una carga", async () => {
    renderizar();
    await avanzar(0);

    expect(screen.getByTestId("alerta-fila")).toBeInTheDocument();
    expect(obtenerAlertas).toHaveBeenCalledTimes(1);

    await avanzar(CADENCIA_DE_REFRESCO_MS);

    expect(obtenerAlertas).toHaveBeenCalledTimes(2);
    // Lo importante: el refresco de fondo NO mueve `aria-busy` ni muestra
    // "Actualizando…". Si lo moviera, el `toHaveAttribute("aria-busy","false")`
    // con el que los E2E esperan la carga se volvería intermitente.
    expect(panel()).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByTestId("alertas-cargando")).not.toBeInTheDocument();
    expect(screen.getByTestId("alertas-contador")).not.toHaveTextContent(
      "Actualizando…",
    );
  });

  test("antes de la cadencia no pide nada", async () => {
    renderizar();
    await avanzar(0);

    await avanzar(CADENCIA_DE_REFRESCO_MS - 1);

    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
  });

  test("con la pestaña en segundo plano no gasta una request", async () => {
    renderizar();
    await avanzar(0);

    conPestana("hidden");
    await avanzar(CADENCIA_DE_REFRESCO_MS * 3);

    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
  });

  test("al volver a la pestaña se refresca en el acto, sin esperar el tick", async () => {
    renderizar();
    await avanzar(0);

    conPestana("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(obtenerAlertas).toHaveBeenCalledTimes(1);

    conPestana("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(obtenerAlertas).toHaveBeenCalledTimes(2);
  });

  test("al recuperar el foco de la ventana se refresca", async () => {
    renderizar();
    await avanzar(0);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(obtenerAlertas).toHaveBeenCalledTimes(2);
  });

  test("un refresco de fondo no se encima de un pedido que ya está en vuelo", async () => {
    obtenerAlertas.mockReturnValue(new Promise(() => {}));

    renderizar();
    await avanzar(0);

    await avanzar(CADENCIA_DE_REFRESCO_MS * 2);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
  });

  test("con un 403 deja de insistir: no se pregunta cada minuto para siempre", async () => {
    // Este panel se monta aunque la consulta de permisos falle
    // (`puedeSalvoQueFalle`), así que un rol sin `alerta.read` puede terminar
    // acá. Sin cortar el refresco, serían 1440 rechazos por día en el log del
    // backend, uno por minuto, que no arreglan nada: el 403 no se cura solo.
    obtenerAlertas.mockRejectedValue(
      Object.assign(new Error("El rol no tiene permiso para esta accion"), {
        status: 403,
      }),
    );

    renderizar();
    await avanzar(0);

    expect(screen.getByTestId("aviso-permiso")).toBeInTheDocument();

    await avanzar(CADENCIA_DE_REFRESCO_MS * 5);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
  });

  test("con un 401 tampoco insiste", async () => {
    obtenerAlertas.mockRejectedValue(
      Object.assign(new Error("No hay sesion activa"), { status: 401 }),
    );

    renderizar();
    await avanzar(0);

    expect(screen.getByTestId("aviso-sesion")).toBeInTheDocument();

    await avanzar(CADENCIA_DE_REFRESCO_MS * 5);

    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
  });

  test("con un fallo de red SÍ insiste, que es lo que lo cura", async () => {
    // La diferencia con los dos de arriba: la red vuelve sola, y el refresco
    // es justamente lo que hace que el panel se recupere sin que nadie toque
    // nada. Cortar acá dejaría el aviso puesto hasta la próxima recarga.
    obtenerAlertas.mockRejectedValueOnce(new Error("Failed to fetch"));

    renderizar();
    await avanzar(0);

    expect(screen.getByTestId("aviso-general")).toBeInTheDocument();

    obtenerAlertas.mockResolvedValue(respuesta());
    await avanzar(CADENCIA_DE_REFRESCO_MS);

    expect(obtenerAlertas).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("alerta-fila")).toBeInTheDocument();
    expect(screen.queryByTestId("alertas-error")).not.toBeInTheDocument();
  });

  test("al desmontarse deja de refrescar", async () => {
    const { unmount } = renderizar();
    await avanzar(0);

    unmount();
    await avanzar(CADENCIA_DE_REFRESCO_MS * 3);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
  });
});
