import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  NOMBRE_POR_DEFECTO,
  esLimiteSuperado,
  generarReporteMovimientos,
  guardarArchivo,
  parametrosDelReporte,
} from "./reportes";
import { apiDescargar } from "./api";

vi.mock("./api", () => ({ apiDescargar: vi.fn() }));

/** Lo que espera el backend: el día en hora local, pasado a ISO con zona. */
const INICIO_1_SEP = new Date(2026, 8, 1, 0, 0, 0, 0).toISOString();
const FIN_30_SEP = new Date(2026, 8, 30, 23, 59, 59, 999).toISOString();
const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** La query con la que se llamó a `apiDescargar`, ya parseada. */
function queryUsada() {
  const [endpoint] = apiDescargar.mock.calls[0];
  const [ruta, query] = endpoint.split("?");
  return { ruta, parametros: Object.fromEntries(new URLSearchParams(query)) };
}

beforeEach(() => {
  apiDescargar.mockReset();
  apiDescargar.mockResolvedValue({
    blob: new Blob(["%PDF"]),
    nombreArchivo: "reporte-movimientos-periodo-2026-09-01_2026-09-30.pdf",
  });
});

describe("parametros del reporte", () => {
  test("por período: tipo, rango de día completo en ISO y zona del navegador", async () => {
    await generarReporteMovimientos({
      tipo: "periodo",
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });

    const { ruta, parametros } = queryUsada();
    expect(ruta).toBe("/reportes/movimientos");
    expect(parametros).toEqual({
      tipo: "periodo",
      desde: INICIO_1_SEP,
      hasta: FIN_30_SEP,
      zonaHoraria: ZONA,
    });
  });

  test("con tipo=periodo no viaja productoId ni proveedorId aunque estén cargados", () => {
    const parametros = parametrosDelReporte({
      tipo: "periodo",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      productoId: "p1",
      proveedorId: "v1",
    });

    expect(parametros.has("productoId")).toBe(false);
    expect(parametros.has("proveedorId")).toBe(false);
  });

  test("por producto: viaja productoId y no proveedorId", () => {
    const parametros = parametrosDelReporte({
      tipo: "producto",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      productoId: "p1",
      proveedorId: "v1",
    });

    expect(parametros.get("productoId")).toBe("p1");
    expect(parametros.has("proveedorId")).toBe(false);
  });

  test("por proveedor: viaja proveedorId y no productoId", () => {
    const parametros = parametrosDelReporte({
      tipo: "proveedor",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      productoId: "p1",
      proveedorId: "v1",
    });

    expect(parametros.get("proveedorId")).toBe("v1");
    expect(parametros.has("productoId")).toBe(false);
  });
});

describe("generarReporteMovimientos", () => {
  test("devuelve el archivo con el nombre de Content-Disposition", async () => {
    const resultado = await generarReporteMovimientos({
      tipo: "periodo",
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });

    expect(resultado.nombreArchivo).toBe(
      "reporte-movimientos-periodo-2026-09-01_2026-09-30.pdf",
    );
  });

  test("si el backend no manda nombre, usa uno por defecto", async () => {
    apiDescargar.mockResolvedValue({ blob: new Blob(["%PDF"]), nombreArchivo: null });

    const resultado = await generarReporteMovimientos({
      tipo: "periodo",
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });

    expect(resultado.nombreArchivo).toBe(NOMBRE_POR_DEFECTO);
  });

  test("los errores del backend se propagan tal cual", async () => {
    const fallo = Object.assign(new Error("El producto no existe"), { status: 404 });
    apiDescargar.mockRejectedValue(fallo);

    await expect(
      generarReporteMovimientos({
        tipo: "producto",
        desde: "2026-09-01",
        hasta: "2026-09-30",
        productoId: "p1",
      }),
    ).rejects.toBe(fallo);
  });
});

describe("esLimiteSuperado", () => {
  test("reconoce el 400 del tope de movimientos", () => {
    const fallo = Object.assign(
      new Error(
        "El reporte supera los 5000 movimientos. Acotá el rango de fechas para generarlo",
      ),
      { status: 400 },
    );
    expect(esLimiteSuperado(fallo)).toBe(true);
  });

  test("otro 400 no es el tope", () => {
    const fallo = Object.assign(
      new Error('La fecha "desde" no puede ser posterior a la fecha "hasta"'),
      { status: 400 },
    );
    expect(esLimiteSuperado(fallo)).toBe(false);
  });
});

describe("guardarArchivo", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:reporte");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("descarga con un <a download> temporal y libera la URL", () => {
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function () {
        // En el momento del clic el enlace tiene que estar armado y en el DOM.
        expect(this.download).toBe("reporte.pdf");
        expect(this.href).toBe("blob:reporte");
        expect(document.body.contains(this)).toBe(true);
      });

    guardarArchivo(new Blob(["%PDF"]), "reporte.pdf");

    expect(clic).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:reporte");
    // Y no queda colgado en la página.
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
