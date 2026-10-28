import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HistorialComprasProveedor from "./HistorialComprasProveedor";

vi.mock("../services/proveedores", async (original) => ({
  ...(await original()),
  obtenerHistorialDeCompras: vi.fn(),
  obtenerProveedores: vi.fn(),
}));

// `AvisoDeError` relee los permisos al ver un 403. Acá no interesa esa parte, y
// sin el mock saldría a buscar `/api/configuracion` de verdad.
vi.mock("../services/permisos", async (original) => ({
  ...(await original()),
  refrescarPermisos: vi.fn(),
}));

const { obtenerHistorialDeCompras, obtenerProveedores } = await import(
  "../services/proveedores"
);

/** Una sola compra: con fixtures de tres, un bug en la fila se esconde. */
function compra(overrides = {}) {
  return {
    id: "c1",
    fecha: "2026-10-12T14:03:00.000Z",
    cantidad: 24,
    motivo: null,
    producto: {
      id: "p1",
      nombre: "Yerba 1kg",
      codigoBarras: "7790001112223",
      unidadMedida: "unidad",
      activo: true,
    },
    ubicacion: { id: "u1", nombre: "Depósito" },
    ...overrides,
  };
}

function respuesta({ compras = [compra()], proveedor, resumen, paginacion } = {}) {
  return {
    proveedor: { id: "v1", nombre: "Distribuidora Sur", activo: true, ...proveedor },
    compras,
    resumen: {
      compras: 37,
      unidades: 912,
      primeraCompra: "2026-03-02T12:00:00.000Z",
      ultimaCompra: "2026-10-12T14:03:00.000Z",
      montos: null,
      ...resumen,
    },
    paginacion: {
      pagina: 1,
      limite: 50,
      total: compras.length,
      totalPaginas: compras.length ? 1 : 0,
      ...paginacion,
    },
  };
}

function fallo(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

/** Deja leer la URL actual, para verificar qué queda en el query string. */
function UbicacionActual() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}

function renderizar(url = "/proveedores/v1/compras") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/proveedores/:id/compras"
          element={
            <>
              <HistorialComprasProveedor />
              <UbicacionActual />
            </>
          }
        />
        <Route path="/proveedores" element={<p>Directorio</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const ultimosFiltros = () => obtenerHistorialDeCompras.mock.calls.at(-1)[1];
const url = () => screen.getByTestId("url").textContent;

/** Espera a que baje el "Cargando…" de la primera carga. */
async function esperarCarga() {
  await waitFor(() =>
    expect(screen.queryByTestId("historial-compras-cargando")).not.toBeInTheDocument(),
  );
}

beforeEach(() => {
  obtenerHistorialDeCompras.mockReset().mockResolvedValue(respuesta());
  obtenerProveedores.mockReset();
});

describe("Encabezado", () => {
  test("se titula con el proveedor de la respuesta, sin una segunda llamada", async () => {
    renderizar();
    await esperarCarga();

    expect(
      screen.getByRole("heading", { level: 1, name: /Distribuidora Sur/ }),
    ).toBeInTheDocument();

    // La clave de la pantalla: el nombre sale del bloque `proveedor` del
    // historial. Pedirlo al detalle del proveedor fallaría con 404 para uno
    // dado de baja, que es justo el caso que esta pantalla tiene que servir.
    expect(obtenerHistorialDeCompras).toHaveBeenCalledTimes(1);
    expect(obtenerProveedores).not.toHaveBeenCalled();
  });

  test("pasa el id de la URL al service", async () => {
    renderizar("/proveedores/v9/compras");
    await esperarCarga();

    expect(obtenerHistorialDeCompras.mock.calls.at(-1)[0]).toBe("v9");
  });

  test("un proveedor dado de baja muestra el badge y sus compras igual", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({ proveedor: { activo: false } }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("proveedor-dado-de-baja")).toHaveTextContent(
      "dado de baja",
    );
    expect(screen.getByTestId("historial-compras-lista")).toBeInTheDocument();
    expect(screen.getAllByTestId("compra-fila")).toHaveLength(1);
  });

  test("un proveedor activo no muestra el badge", async () => {
    renderizar();
    await esperarCarga();

    expect(
      screen.queryByTestId("proveedor-dado-de-baja"),
    ).not.toBeInTheDocument();
  });
});

describe("Resumen del período", () => {
  test("muestra las cuatro métricas que el contrato sí puede dar", async () => {
    renderizar();
    await esperarCarga();

    const resumen = screen.getByTestId("historial-compras-resumen");
    expect(within(resumen).getByTestId("resumen-compras")).toHaveTextContent("37");
    expect(within(resumen).getByTestId("resumen-unidades")).toHaveTextContent("912");
    expect(within(resumen).getByTestId("resumen-primera")).toHaveTextContent(
      /\d{2}\/\d{2}\/2026/,
    );
    expect(within(resumen).getByTestId("resumen-ultima")).toHaveTextContent(
      /\d{2}\/\d{2}\/2026/,
    );
  });

  test("no inventa importes: ni montos, ni total gastado, ni moneda", async () => {
    renderizar();
    await esperarCarga();

    const pantalla = screen.getByTestId("historial-compras");

    // Ningún símbolo de moneda en ningún lado.
    expect(pantalla.textContent).not.toMatch(/\$/);

    // Y ninguna etiqueta de dato que prometa un importe. Se miran los <dt> y no
    // el texto entero porque la pantalla sí menciona la palabra: aclara que
    // registra volumen y no importes, que es lo contrario de inventarlos.
    const etiquetas = [...pantalla.querySelectorAll("dt")].map(
      (dt) => dt.textContent,
    );
    expect(etiquetas).toEqual([
      "Compras",
      "Unidades",
      "Primera",
      "Última",
      "Ubicación",
      "Código",
    ]);
  });

  test("sin compras en el período, las fechas son «—» y no «Invalid Date»", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [],
        resumen: {
          compras: 0,
          unidades: 0,
          primeraCompra: null,
          ultimaCompra: null,
        },
        paginacion: { total: 0, totalPaginas: 0 },
      }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("resumen-primera")).toHaveTextContent("—");
    expect(screen.getByTestId("resumen-ultima")).toHaveTextContent("—");
    expect(screen.getByTestId("historial-compras").textContent).not.toMatch(
      /Invalid Date/,
    );
  });

  test("es del período y no de la página: no cambia al paginar", async () => {
    const RESUMEN = {
      compras: 37,
      unidades: 912,
      primeraCompra: "2026-03-02T12:00:00.000Z",
      ultimaCompra: "2026-10-12T14:03:00.000Z",
      montos: null,
    };

    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        resumen: RESUMEN,
        paginacion: { pagina: 1, limite: 50, total: 60, totalPaginas: 2 },
      }),
    );

    renderizar();
    await esperarCarga();

    const antes = {
      compras: screen.getByTestId("resumen-compras").textContent,
      unidades: screen.getByTestId("resumen-unidades").textContent,
      primera: screen.getByTestId("resumen-primera").textContent,
      ultima: screen.getByTestId("resumen-ultima").textContent,
    };
    expect(antes.compras).toBe("37");
    expect(antes.unidades).toBe("912");

    // La página 2 trae otra cantidad: si algún número del encabezado saliera de
    // un reduce sobre `compras`, acá se movería.
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [compra({ id: "c2", cantidad: 5 })],
        resumen: RESUMEN,
        paginacion: { pagina: 2, limite: 50, total: 60, totalPaginas: 2 },
      }),
    );

    await userEvent.click(screen.getByTestId("pagina-siguiente"));
    await waitFor(() =>
      expect(screen.getByTestId("pagina-actual")).toHaveTextContent("Página 2 de 2"),
    );

    expect({
      compras: screen.getByTestId("resumen-compras").textContent,
      unidades: screen.getByTestId("resumen-unidades").textContent,
      primera: screen.getByTestId("resumen-primera").textContent,
      ultima: screen.getByTestId("resumen-ultima").textContent,
    }).toEqual(antes);
  });
});

describe("Listado", () => {
  test("muestra la compra con todos sus datos", async () => {
    renderizar();
    await esperarCarga();

    const fila = screen.getByTestId("compra-fila");
    expect(fila).toHaveAttribute("data-compra-id", "c1");
    expect(fila).toHaveTextContent("Yerba 1kg");
    expect(fila).toHaveTextContent("24");
    expect(fila).toHaveTextContent("unidad");
    expect(fila).toHaveTextContent("Depósito");
    expect(fila).toHaveTextContent("7790001112223");
  });

  test("la cantidad va sin signo: son todas entradas", async () => {
    renderizar();
    await esperarCarga();

    const fila = screen.getByTestId("compra-fila");
    expect(fila).toHaveTextContent("24");
    // El formateo con signo es el del historial de HU-14, donde la cantidad
    // viene negativa para las salidas. Acá un "+24" sugeriría que existe un
    // "−24", y no existe.
    expect(fila.textContent).not.toMatch(/\+24/);
    expect(fila.textContent).not.toMatch(/−24|-24/);
  });

  test("no promete datos que el endpoint no trae", async () => {
    renderizar();
    await esperarCarga();

    const fila = screen.getByTestId("compra-fila");
    // No hay usuario en este endpoint: no va la columna "Registró" de HU-14.
    expect(fila.textContent).not.toMatch(/Registró/i);
  });

  test("un producto dado de baja se muestra igual, con el aviso", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [
          compra({
            producto: {
              id: "p1",
              nombre: "Yerba 1kg",
              codigoBarras: "7790001112223",
              unidadMedida: "unidad",
              activo: false,
            },
          }),
        ],
      }),
    );

    renderizar();
    await esperarCarga();

    // Esconder la fila haría que las unidades del resumen no cerraran con lo
    // que se ve en la lista.
    const fila = screen.getByTestId("compra-fila");
    expect(fila).toHaveTextContent("Yerba 1kg");
    expect(within(fila).getByTestId("producto-dado-de-baja")).toHaveTextContent(
      "dado de baja",
    );
  });

  test("muestra el motivo solo cuando lo hay", async () => {
    renderizar();
    await esperarCarga();
    expect(screen.getByTestId("compra-fila").textContent).not.toMatch(/Motivo/);

    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({ compras: [compra({ motivo: "Reposición de temporada" })] }),
    );
    renderizar();

    await waitFor(() =>
      expect(screen.getAllByTestId("compra-fila").at(-1)).toHaveTextContent(
        "Reposición de temporada",
      ),
    );
  });
});

describe("Estado vacío", () => {
  test("sin compras en el período: total 0, totalPaginas 0, y nada de «de 0»", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [],
        resumen: { compras: 0, unidades: 0, primeraCompra: null, ultimaCompra: null },
        paginacion: { total: 0, totalPaginas: 0 },
      }),
    );

    renderizar("/proveedores/v1/compras?desde=2026-01-01&hasta=2026-01-31");
    await esperarCarga();

    expect(screen.getByTestId("historial-compras-vacio")).toHaveTextContent(
      "No le registraste compras en este período.",
    );
    // La trampa: `totalPaginas` es 0 y no 1. Un "Página 1 de 0" sería absurdo.
    expect(screen.queryByTestId("historial-compras-paginacion")).not.toBeInTheDocument();
    expect(screen.getByTestId("historial-compras").textContent).not.toMatch(/de 0/);
  });

  test("sin período, el texto dice que nunca se le compró", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [],
        resumen: { compras: 0, unidades: 0, primeraCompra: null, ultimaCompra: null },
        paginacion: { total: 0, totalPaginas: 0 },
      }),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("historial-compras-vacio")).toHaveTextContent(
      "Todavía no le registraste ninguna compra a este proveedor.",
    );
  });

  test("el vacío conserva el encabezado y el resumen", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [],
        resumen: { compras: 0, unidades: 0, primeraCompra: null, ultimaCompra: null },
        paginacion: { total: 0, totalPaginas: 0 },
      }),
    );

    renderizar();
    await esperarCarga();

    expect(
      screen.getByRole("heading", { level: 1, name: /Distribuidora Sur/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("historial-compras-resumen")).toBeInTheDocument();
  });
});

describe("Paginación", () => {
  test("una página más allá del total no es un error", async () => {
    // 200 con `compras: []` y total > 0. El backend NO devuelve 404 acá.
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [],
        paginacion: { pagina: 99, limite: 50, total: 37, totalPaginas: 1 },
      }),
    );

    renderizar("/proveedores/v1/compras?pagina=99");
    await esperarCarga();

    expect(screen.getByTestId("historial-compras-pagina-vacia")).toHaveTextContent(
      "Esa página ya no tiene compras.",
    );
    // Lo que no tiene que pasar: verse como una falla.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("historial-compras-error")).not.toBeInTheDocument();
    // Ni confundirse con "no hay compras en el período": el total es 37.
    expect(screen.queryByTestId("historial-compras-vacio")).not.toBeInTheDocument();
    // Ni dibujar "Página 99 de 1".
    expect(screen.queryByTestId("pagina-actual")).not.toBeInTheDocument();
  });

  test("«Volver a la primera» saca la página de la URL", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [],
        paginacion: { pagina: 99, limite: 50, total: 37, totalPaginas: 1 },
      }),
    );

    renderizar("/proveedores/v1/compras?pagina=99");
    await esperarCarga();

    obtenerHistorialDeCompras.mockResolvedValue(respuesta());
    await userEvent.click(screen.getByRole("button", { name: "Volver a la primera" }));

    await waitFor(() => expect(url()).not.toMatch(/pagina/));
  });

  test("el contador de filas usa el límite de la respuesta, no el pedido", async () => {
    // El backend recorta en silencio cualquier límite mayor a 200: si la
    // pantalla contara con lo que pidió, el "Mostrando…" mentiría.
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({
        compras: [compra()],
        paginacion: { pagina: 3, limite: 200, total: 500, totalPaginas: 3 },
      }),
    );

    renderizar("/proveedores/v1/compras?pagina=3");
    await esperarCarga();

    expect(screen.getByTestId("historial-compras-paginacion")).toHaveTextContent(
      "Mostrando 401–401 de 500",
    );
  });

  test("con una sola página no se dibuja la navegación", async () => {
    renderizar();
    await esperarCarga();

    expect(
      screen.queryByTestId("historial-compras-paginacion"),
    ).not.toBeInTheDocument();
  });

  test("paginar conserva el período", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({ paginacion: { pagina: 1, limite: 50, total: 60, totalPaginas: 2 } }),
    );

    renderizar("/proveedores/v1/compras?desde=2026-01-01&hasta=2026-12-31");
    await esperarCarga();

    await userEvent.click(screen.getByTestId("pagina-siguiente"));

    await waitFor(() => expect(url()).toMatch(/pagina=2/));
    expect(url()).toMatch(/desde=2026-01-01/);
    expect(url()).toMatch(/hasta=2026-12-31/);
    expect(ultimosFiltros()).toEqual({
      desde: "2026-01-01",
      hasta: "2026-12-31",
      pagina: 2,
    });
  });
});

describe("Período", () => {
  test("el día elegido llega al service tal cual, para que lo convierta", async () => {
    renderizar();
    await esperarCarga();

    await userEvent.type(screen.getByTestId("filtro-desde"), "2026-03-02");

    await waitFor(() =>
      expect(ultimosFiltros()).toEqual({
        desde: "2026-03-02",
        hasta: "",
        pagina: 1,
      }),
    );
  });

  test("cambiar el período vuelve a la página 1", async () => {
    obtenerHistorialDeCompras.mockResolvedValue(
      respuesta({ paginacion: { pagina: 4, limite: 50, total: 200, totalPaginas: 4 } }),
    );

    renderizar("/proveedores/v1/compras?pagina=4");
    await esperarCarga();
    expect(url()).toMatch(/pagina=4/);

    await userEvent.type(screen.getByTestId("filtro-desde"), "2026-03-02");

    // La página 4 del período viejo puede no existir en el nuevo: conservarla
    // mostraría un vacío que parece decir que no hay compras.
    await waitFor(() => expect(url()).not.toMatch(/pagina/));
    expect(url()).toMatch(/desde=2026-03-02/);
  });

  test("un rango al revés avisa al lado de las fechas y no consulta", async () => {
    renderizar("/proveedores/v1/compras?desde=2026-05-10&hasta=2026-05-01");

    await waitFor(() =>
      expect(
        screen.getByText("La fecha «Desde» no puede ser posterior a «Hasta»."),
      ).toBeInTheDocument(),
    );

    expect(obtenerHistorialDeCompras).not.toHaveBeenCalled();
    // Y no se queda colgada en "Cargando…" para siempre, ni anunciándose como
    // ocupada: no hay nada en vuelo que esperar.
    expect(
      screen.queryByTestId("historial-compras-cargando"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("historial-compras")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  test("«Limpiar período» borra las fechas de la URL", async () => {
    renderizar("/proveedores/v1/compras?desde=2026-01-01&hasta=2026-12-31");
    await esperarCarga();

    await userEvent.click(screen.getByTestId("historial-compras-limpiar"));

    await waitFor(() => expect(url()).toBe(""));
  });

  test("sin período no se ofrece limpiarlo", async () => {
    renderizar();
    await esperarCarga();

    expect(
      screen.queryByTestId("historial-compras-limpiar"),
    ).not.toBeInTheDocument();
  });
});

describe("Errores", () => {
  test("un 400 de filtro muestra el mensaje del backend, tal cual", async () => {
    obtenerHistorialDeCompras.mockRejectedValue(
      fallo(400, "El parámetro «desde» tiene que incluir la zona horaria."),
    );

    renderizar("/proveedores/v1/compras?desde=2026-01-01");
    await esperarCarga();

    // El texto es el del backend, no uno que invente la pantalla: es el que
    // sabe qué regla se rompió.
    expect(screen.getByTestId("historial-compras-error")).toHaveTextContent(
      "El parámetro «desde» tiene que incluir la zona horaria.",
    );
  });

  test("un filtro inválido gana sobre un proveedor inexistente", async () => {
    // El backend valida el filtro ANTES de buscar el proveedor: un id que no
    // existe con una fecha rota responde 400, no 404. Decir "no existe" acá
    // mandaría a arreglar lo que no está roto.
    obtenerHistorialDeCompras.mockRejectedValue(
      fallo(400, "La fecha «desde» no es válida."),
    );

    renderizar("/proveedores/fantasma/compras?desde=nada");
    await esperarCarga();

    expect(screen.getByTestId("historial-compras-error")).toHaveTextContent(
      "La fecha «desde» no es válida.",
    );
    expect(
      screen.queryByTestId("historial-compras-sin-proveedor"),
    ).not.toBeInTheDocument();
  });

  test("un 404 dice que el proveedor no existe, sin ofrecer reintentar", async () => {
    obtenerHistorialDeCompras.mockRejectedValue(
      fallo(404, "El proveedor no existe"),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("historial-compras-sin-proveedor")).toHaveTextContent(
      "El proveedor no existe",
    );
    // Reintentar no lo va a hacer existir.
    expect(
      screen.queryByRole("button", { name: "Reintentar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver tus proveedores" }),
    ).toBeInTheDocument();
    // Tampoco tiene sentido seguir ofreciendo filtros de un historial que no hay.
    expect(screen.queryByTestId("filtro-desde")).not.toBeInTheDocument();
  });

  test("un 401 ofrece volver a entrar", async () => {
    obtenerHistorialDeCompras.mockRejectedValue(fallo(401, "No hay sesion activa"));

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("aviso-sesion")).toBeInTheDocument();
  });

  test("un 403 de rol no cierra la sesión", async () => {
    obtenerHistorialDeCompras.mockRejectedValue(
      fallo(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("aviso-permiso")).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-sesion")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Volver a entrar" }),
    ).not.toBeInTheDocument();
  });

  test("un fallo de red se puede reintentar, y el reintento vuelve a pedir", async () => {
    obtenerHistorialDeCompras.mockRejectedValue(new Error("Failed to fetch"));

    renderizar();
    await esperarCarga();

    expect(screen.getByTestId("historial-compras-error")).toHaveTextContent(
      "Failed to fetch",
    );

    obtenerHistorialDeCompras.mockResolvedValue(respuesta());
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() =>
      expect(screen.getByTestId("historial-compras-lista")).toBeInTheDocument(),
    );
    expect(obtenerHistorialDeCompras).toHaveBeenCalledTimes(2);
  });

  test("con un error no quedan a la vista datos del intento anterior", async () => {
    renderizar();
    await esperarCarga();
    expect(screen.getByTestId("historial-compras-lista")).toBeInTheDocument();

    obtenerHistorialDeCompras.mockRejectedValue(fallo(400, "Rango inválido."));
    await userEvent.type(screen.getByTestId("filtro-desde"), "2026-03-02");

    await waitFor(() =>
      expect(screen.getByTestId("historial-compras-error")).toBeInTheDocument(),
    );
    // El resumen era del período viejo: dejarlo al lado del error mentiría.
    expect(
      screen.queryByTestId("historial-compras-resumen"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("historial-compras-lista")).not.toBeInTheDocument();
  });
});

describe("Feedback mientras carga", () => {
  test("la primera carga avisa que está cargando", async () => {
    let resolver;
    obtenerHistorialDeCompras.mockReturnValue(
      new Promise((cumplir) => {
        resolver = cumplir;
      }),
    );

    renderizar();

    expect(screen.getByTestId("historial-compras-cargando")).toBeInTheDocument();
    expect(screen.getByTestId("historial-compras")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    resolver(respuesta());
    await esperarCarga();

    expect(screen.getByTestId("historial-compras")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  test("al refiltrar, la lista anterior sigue a la vista", async () => {
    renderizar();
    await esperarCarga();

    let resolver;
    obtenerHistorialDeCompras.mockReturnValue(
      new Promise((cumplir) => {
        resolver = cumplir;
      }),
    );

    await userEvent.type(screen.getByTestId("filtro-desde"), "2026-03-02");

    await waitFor(() =>
      expect(screen.getByTestId("historial-compras")).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
    // No parpadea a blanco: con conexión lenta, vaciar la tabla y volver a
    // llenarla se lee como que el filtro borró todo.
    expect(screen.getByTestId("historial-compras-lista")).toBeInTheDocument();
    expect(screen.getByText("Actualizando…")).toBeInTheDocument();

    resolver(respuesta());
    await waitFor(() =>
      expect(screen.queryByText("Actualizando…")).not.toBeInTheDocument(),
    );
  });
});
