import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TarjetaReportePdf from "./TarjetaReportePdf";
import { valoresIniciales } from "./TarjetaReportePdf.validacion";
import { configuracionDe } from "../tests/permisos";

/**
 * Tarjeta «Generar reporte PDF» (HU-25, SCRUM-151).
 *
 * Se mockean los services de permisos, productos y proveedores, pero NO el de
 * reportes: para el PDF se mockea `fetch`, así el test recorre la cadena entera
 * —tarjeta → `services/reportes` → `api.js`— y prueba de verdad la query que
 * sale y el nombre que se lee de `Content-Disposition`.
 */

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));
vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  obtenerProductos: vi.fn(),
}));
vi.mock("../services/proveedores", async (original) => ({
  ...(await original()),
  obtenerProveedores: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");
const { obtenerProductos } = await import("../services/productos");
const { obtenerProveedores } = await import("../services/proveedores");
const { leer } = await import("../services/permisos");

const PRODUCTOS = [
  { id: "p1", nombre: "Yerba Ñandú 1kg", codigoBarras: "7790001" },
  { id: "p2", nombre: "Azúcar 1kg", codigoBarras: "7790002" },
];
const PROVEEDORES = [
  { id: "v1", nombre: "Distribuidora Norte" },
  { id: "v2", nombre: "Mayorista Sur" },
];

const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;

function respuestaPdf(nombre) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(
      nombre ? { "Content-Disposition": `attachment; filename="${nombre}"` } : {},
    ),
    blob: () => Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" })),
  };
}

function respuestaError(status, error) {
  return { ok: false, status, json: () => Promise.resolve({ error }) };
}

/** El endpoint y la query del último pedido del PDF. */
function pedidoDelPdf() {
  const [url] = fetch.mock.calls.at(-1);
  const [ruta, query] = url.split("?");
  return { ruta, parametros: Object.fromEntries(new URLSearchParams(query)) };
}

/** El `download` del `<a>` en el momento del clic, para ver con qué nombre se guardó. */
let descargas;

function renderizar() {
  return render(
    <MemoryRouter>
      <TarjetaReportePdf />
    </MemoryRouter>,
  );
}

/** Renderiza como gerente y espera a que la tarjeta aparezca. */
async function abrir() {
  const user = userEvent.setup();
  renderizar();
  await screen.findByRole("heading", { name: "Generar reporte PDF" });
  return user;
}

function botonGenerar() {
  return screen.getByRole("button", { name: /generar y descargar|generando/i });
}

function cambiarFecha(etiqueta, valor) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerConfiguracion.mockResolvedValue(configuracionDe("gerente"));
  obtenerProductos.mockResolvedValue(PRODUCTOS);
  obtenerProveedores.mockResolvedValue(PROVEEDORES);

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaPdf("reporte.pdf")));
  URL.createObjectURL = vi.fn(() => "blob:reporte");
  URL.revokeObjectURL = vi.fn();

  descargas = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    descargas.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Permisos", () => {
  test("el gerente ve la tarjeta", async () => {
    renderizar();

    expect(await screen.findByTestId("tarjeta-reporte-pdf")).toBeInTheDocument();
  });

  test("sin reporte:generar (empleado) no se renderiza nada", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    const { container } = renderizar();

    // Se espera a que los permisos lleguen, para no afirmar "no está" antes de
    // tiempo (mientras cargan tampoco se muestra).
    await waitFor(() => expect(leer().configuracion).not.toBeNull());

    expect(screen.queryByTestId("tarjeta-reporte-pdf")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  test("mientras los permisos cargan no se muestra", () => {
    obtenerConfiguracion.mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.queryByTestId("tarjeta-reporte-pdf")).not.toBeInTheDocument();
  });
});

describe("Valores por defecto", () => {
  test("por período, del primer día del mes a hoy, sin selector", async () => {
    await abrir();
    const { desde, hasta } = valoresIniciales();

    expect(screen.getByRole("radio", { name: "Por período" })).toBeChecked();
    expect(screen.getByLabelText("Desde")).toHaveValue(desde);
    expect(screen.getByLabelText("Hasta")).toHaveValue(hasta);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("El reporte incluye cantidades, no montos.")).toBeInTheDocument();
  });

  test("no pide productos ni proveedores si no hacen falta", async () => {
    await abrir();

    expect(obtenerProductos).not.toHaveBeenCalled();
    expect(obtenerProveedores).not.toHaveBeenCalled();
  });
});

describe("Cambiar de tipo", () => {
  test("«Por producto» muestra el selector de productos y los pide recién ahí", async () => {
    const user = await abrir();

    await user.click(screen.getByRole("radio", { name: "Por producto" }));

    const selector = await screen.findByRole("combobox", { name: "Producto" });
    expect(await screen.findByRole("option", { name: "Yerba Ñandú 1kg" })).toBeInTheDocument();
    expect(selector).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Proveedor" })).not.toBeInTheDocument();
    expect(obtenerProductos).toHaveBeenCalledOnce();
    expect(obtenerProveedores).not.toHaveBeenCalled();
  });

  test("«Por proveedor» muestra el de proveedores y oculta el de productos", async () => {
    const user = await abrir();

    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    await screen.findByRole("option", { name: "Azúcar 1kg" });
    await user.click(screen.getByRole("radio", { name: "Por proveedor" }));

    expect(await screen.findByRole("option", { name: "Mayorista Sur" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Proveedor" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Producto" })).not.toBeInTheDocument();
  });

  test("al cambiar de tipo se limpia lo elegido en el otro", async () => {
    const user = await abrir();

    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    await screen.findByRole("option", { name: "Azúcar 1kg" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Producto" }), "p2");
    expect(screen.getByRole("combobox", { name: "Producto" })).toHaveValue("p2");

    await user.click(screen.getByRole("radio", { name: "Por proveedor" }));
    await screen.findByRole("option", { name: "Mayorista Sur" });
    expect(screen.getByRole("combobox", { name: "Proveedor" })).toHaveValue("");
    await user.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "v1");

    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    expect(screen.getByRole("combobox", { name: "Producto" })).toHaveValue("");
    // La lista ya estaba: no se vuelve a pedir.
    expect(obtenerProductos).toHaveBeenCalledOnce();
  });

  test("con muchos productos aparece un buscador que filtra sin importar tildes", async () => {
    obtenerProductos.mockResolvedValue([
      ...PRODUCTOS,
      ...Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, nombre: `Galletitas ${i}` })),
    ]);
    const user = await abrir();

    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    const buscador = await screen.findByRole("searchbox", { name: "Buscar producto" });
    await user.type(buscador, "nandu");

    const opciones = screen
      .getAllByRole("option")
      .map((o) => o.textContent)
      .filter((t) => !t.startsWith("Elegí"));
    expect(opciones).toEqual(["Yerba Ñandú 1kg"]);
  });

  test("con pocos productos no hay buscador", async () => {
    const user = await abrir();

    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    await screen.findByRole("option", { name: "Azúcar 1kg" });

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  test("si la lista no carga, se puede reintentar", async () => {
    obtenerProductos.mockRejectedValueOnce(
      Object.assign(new Error("No se pudo conectar"), { status: 500 }),
    );
    const user = await abrir();

    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    expect(await screen.findByText("No se pudo conectar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("option", { name: "Azúcar 1kg" })).toBeInTheDocument();
    expect(obtenerProductos).toHaveBeenCalledTimes(2);
  });
});

describe("Validaciones", () => {
  test("fechas vacías: avisa y no llama al backend", async () => {
    const user = await abrir();
    cambiarFecha("Desde", "");
    cambiarFecha("Hasta", "");

    await user.click(botonGenerar());

    expect(screen.getByText("Elegí desde qué día querés el reporte.")).toBeInTheDocument();
    expect(screen.getByText("Elegí hasta qué día querés el reporte.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("desde posterior a hasta: avisa y no llama al backend", async () => {
    const user = await abrir();
    cambiarFecha("Desde", "2026-10-15");
    cambiarFecha("Hasta", "2026-10-01");

    await user.click(botonGenerar());

    expect(
      screen.getByText("La fecha «Desde» no puede ser posterior a «Hasta»."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Desde")).toHaveAttribute("aria-invalid", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("por producto sin elegir producto: avisa y no llama al backend", async () => {
    const user = await abrir();
    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    await screen.findByRole("option", { name: "Azúcar 1kg" });

    await user.click(botonGenerar());

    expect(screen.getByText("Elegí de qué producto querés el reporte.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("por proveedor sin elegir proveedor: avisa y no llama al backend", async () => {
    const user = await abrir();
    await user.click(screen.getByRole("radio", { name: "Por proveedor" }));
    await screen.findByRole("option", { name: "Mayorista Sur" });

    await user.click(botonGenerar());

    expect(screen.getByText("Elegí de qué proveedor querés el reporte.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("al corregir el campo, el aviso se va", async () => {
    const user = await abrir();
    cambiarFecha("Desde", "");
    await user.click(botonGenerar());
    expect(screen.getByText("Elegí desde qué día querés el reporte.")).toBeInTheDocument();

    cambiarFecha("Desde", "2026-09-01");

    expect(
      screen.queryByText("Elegí desde qué día querés el reporte."),
    ).not.toBeInTheDocument();
  });
});

describe("La llamada al backend", () => {
  test("por período: desde/hasta en ISO de inicio y fin de día, zona del navegador", async () => {
    const user = await abrir();
    cambiarFecha("Desde", "2026-09-01");
    cambiarFecha("Hasta", "2026-09-30");

    await user.click(botonGenerar());

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const { ruta, parametros } = pedidoDelPdf();
    expect(ruta).toBe("/api/reportes/movimientos");
    expect(parametros).toEqual({
      tipo: "periodo",
      desde: new Date(2026, 8, 1, 0, 0, 0, 0).toISOString(),
      hasta: new Date(2026, 8, 30, 23, 59, 59, 999).toISOString(),
      zonaHoraria: ZONA,
    });
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  test("por período no manda productoId aunque antes se haya elegido uno", async () => {
    const user = await abrir();
    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    await screen.findByRole("option", { name: "Azúcar 1kg" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Producto" }), "p1");
    await user.click(screen.getByRole("radio", { name: "Por período" }));

    await user.click(botonGenerar());

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const { parametros } = pedidoDelPdf();
    expect(parametros.tipo).toBe("periodo");
    expect(parametros).not.toHaveProperty("productoId");
    expect(parametros).not.toHaveProperty("proveedorId");
  });

  test("por producto manda productoId y no proveedorId", async () => {
    const user = await abrir();
    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    await screen.findByRole("option", { name: "Azúcar 1kg" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Producto" }), "p1");

    await user.click(botonGenerar());

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const { parametros } = pedidoDelPdf();
    expect(parametros).toMatchObject({ tipo: "producto", productoId: "p1" });
    expect(parametros).not.toHaveProperty("proveedorId");
  });

  test("por proveedor manda proveedorId y no productoId", async () => {
    const user = await abrir();
    await user.click(screen.getByRole("radio", { name: "Por proveedor" }));
    await screen.findByRole("option", { name: "Mayorista Sur" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "v2");

    await user.click(botonGenerar());

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const { parametros } = pedidoDelPdf();
    expect(parametros).toMatchObject({ tipo: "proveedor", proveedorId: "v2" });
    expect(parametros).not.toHaveProperty("productoId");
  });
});

describe("La descarga", () => {
  test("guarda el archivo con el nombre de Content-Disposition y libera la URL", async () => {
    fetch.mockResolvedValue(
      respuestaPdf("reporte-movimientos-periodo-2026-09-01_2026-09-30.pdf"),
    );
    const user = await abrir();

    await user.click(botonGenerar());

    expect(await screen.findByTestId("reporte-descargado")).toHaveTextContent(
      "Reporte descargado: reporte-movimientos-periodo-2026-09-01_2026-09-30.pdf",
    );
    expect(descargas).toEqual(["reporte-movimientos-periodo-2026-09-01_2026-09-30.pdf"]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:reporte");
  });

  test("sin Content-Disposition usa el nombre por defecto", async () => {
    fetch.mockResolvedValue(respuestaPdf(null));
    const user = await abrir();

    await user.click(botonGenerar());

    await screen.findByTestId("reporte-descargado");
    expect(descargas).toEqual(["reporte-movimientos.pdf"]);
  });

  test("mientras genera, el botón queda deshabilitado y un doble clic no pide dos veces", async () => {
    let responder;
    fetch.mockReturnValue(new Promise((resolver) => (responder = resolver)));
    const user = await abrir();

    await user.dblClick(botonGenerar());

    expect(botonGenerar()).toBeDisabled();
    expect(botonGenerar()).toHaveTextContent("Generando…");
    expect(fetch).toHaveBeenCalledOnce();

    responder(respuestaPdf("reporte.pdf"));

    await waitFor(() => expect(botonGenerar()).toBeEnabled());
    expect(botonGenerar()).toHaveTextContent("Generar y descargar");
    expect(descargas).toHaveLength(1);
  });
});

describe("Errores del backend", () => {
  test("un 400 muestra el mensaje del backend", async () => {
    fetch.mockResolvedValue(
      respuestaError(400, 'La fecha "desde" no puede ser posterior a la fecha "hasta"'),
    );
    const user = await abrir();

    await user.click(botonGenerar());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'La fecha "desde" no puede ser posterior a la fecha "hasta"',
    );
    expect(descargas).toHaveLength(0);
    expect(screen.queryByTestId("sugerencia-acotar-rango")).not.toBeInTheDocument();
  });

  test("el 400 de más de 5000 movimientos sugiere acotar el rango", async () => {
    fetch.mockResolvedValue(
      respuestaError(
        400,
        "El reporte supera los 5000 movimientos. Acotá el rango de fechas para generarlo",
      ),
    );
    const user = await abrir();

    await user.click(botonGenerar());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El reporte supera los 5000 movimientos",
    );
    expect(screen.getByTestId("sugerencia-acotar-rango")).toHaveTextContent(
      "Probá con un rango más corto",
    );
  });

  test("un 403 muestra el mensaje del backend, en gris y sin mandar al login", async () => {
    fetch.mockResolvedValue(respuestaError(403, "El rol no tiene permiso para esta accion"));
    const user = await abrir();

    await user.click(botonGenerar());

    const aviso = await screen.findByTestId("aviso-permiso");
    expect(aviso).toHaveTextContent("El rol no tiene permiso para esta accion");
    expect(screen.queryByRole("link", { name: "Volver a entrar" })).not.toBeInTheDocument();
  });

  test("un 404 de producto inexistente muestra el mensaje del backend", async () => {
    fetch.mockResolvedValue(respuestaError(404, "El producto no existe"));
    const user = await abrir();
    await user.click(screen.getByRole("radio", { name: "Por producto" }));
    await screen.findByRole("option", { name: "Azúcar 1kg" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Producto" }), "p1");

    await user.click(botonGenerar());

    expect(await screen.findByRole("alert")).toHaveTextContent("El producto no existe");
  });

  test("al cambiar algo después del error, el aviso se va", async () => {
    fetch.mockResolvedValue(respuestaError(400, "Algo salió mal"));
    const user = await abrir();
    await user.click(botonGenerar());
    await screen.findByRole("alert");

    cambiarFecha("Desde", "2026-09-02");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
