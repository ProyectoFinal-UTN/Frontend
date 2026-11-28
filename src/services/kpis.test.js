import { beforeEach, describe, expect, test, vi } from "vitest";
import { VENTANA_POR_DEFECTO, VENTANAS, obtenerKpis } from "./kpis";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import("./api");

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({});
});

describe("obtenerKpis (HU-22)", () => {
  test("pide la ruta de KPIs sin parámetros para la ventana por defecto", async () => {
    await obtenerKpis();
    expect(apiFetch).toHaveBeenLastCalledWith("/kpis");

    await obtenerKpis({ dias: VENTANA_POR_DEFECTO });
    expect(apiFetch).toHaveBeenLastCalledWith("/kpis");
  });

  test("manda `dias` cuando es otra ventana", async () => {
    await obtenerKpis({ dias: 7 });
    expect(apiFetch).toHaveBeenLastCalledWith("/kpis?dias=7");
  });

  test.each([0, -1, 2.5, Number.NaN, "7"])(
    "un %p que no es entero positivo no viaja, en vez de provocar un 400",
    async (dias) => {
      await obtenerKpis({ dias });
      expect(apiFetch).toHaveBeenLastCalledWith("/kpis");
    },
  );

  test("las ventanas del selector entran en lo que acepta el backend (1 a 90)", () => {
    expect(VENTANAS).toContain(VENTANA_POR_DEFECTO);
    for (const dias of VENTANAS) {
      expect(dias).toBeGreaterThanOrEqual(1);
      expect(dias).toBeLessThanOrEqual(90);
    }
  });

  test("devuelve lo que contesta la API", async () => {
    apiFetch.mockResolvedValueOnce({ stock: { productos: 3 } });
    await expect(obtenerKpis()).resolves.toEqual({ stock: { productos: 3 } });
  });
});

describe("obtenerKpis con un rango (HU-23)", () => {
  const DESDE = "2026-03-01T00:00:00.000-03:00";
  const HASTA = "2026-03-31T23:59:59.000-03:00";

  test("manda los dos extremos, encodeados", async () => {
    await obtenerKpis({ desde: DESDE, hasta: HASTA });

    // El `+` de un offset positivo y los `:` tienen que viajar encodeados: un
    // `+` crudo en la query string se lee como un espacio y la fecha deja de
    // ser ISO 8601 del otro lado.
    expect(apiFetch).toHaveBeenLastCalledWith(
      `/kpis?desde=${encodeURIComponent(DESDE)}&hasta=${encodeURIComponent(HASTA)}`,
    );
  });

  test("un offset positivo no se rompe al encodearse", async () => {
    await obtenerKpis({
      desde: "2026-03-01T00:00:00.000+09:00",
      hasta: "2026-03-31T23:59:59.000+09:00",
    });

    const url = apiFetch.mock.calls.at(-1)[0];
    expect(url).toContain("%2B09%3A00");
    expect(new URLSearchParams(url.split("?")[1]).get("desde")).toBe(
      "2026-03-01T00:00:00.000+09:00",
    );
  });

  test.each([
    ["solo `desde`", { desde: DESDE }],
    ["solo `hasta`", { hasta: HASTA }],
  ])("%s no viaja: van los dos o ninguno", async (_nombre, periodo) => {
    // Mandar uno solo es un 400 del backend ("el período necesita un rango de
    // fechas"), así que no se gasta el viaje.
    await obtenerKpis(periodo);
    expect(apiFetch).toHaveBeenLastCalledWith("/kpis");
  });

  test("NUNCA manda `dias` junto con el rango: mandar los dos es un 400", async () => {
    await obtenerKpis({ dias: 7, desde: DESDE, hasta: HASTA });

    const url = apiFetch.mock.calls.at(-1)[0];
    const parametros = new URLSearchParams(url.split("?")[1]);
    expect(parametros.has("dias")).not.toBe(parametros.has("desde"));
    expect(url).toBe("/kpis?dias=7");
  });

  test("el default de 30 días no bloquea un rango", async () => {
    // `dias: 30` no viaja (es el default), pero tampoco tiene que tapar el
    // rango: si lo hiciera, un período de calendario se pediría como 30 días.
    await obtenerKpis({ dias: 30, desde: DESDE, hasta: HASTA });

    expect(apiFetch).toHaveBeenLastCalledWith(
      `/kpis?desde=${encodeURIComponent(DESDE)}&hasta=${encodeURIComponent(HASTA)}`,
    );
  });

  test("un rango de un solo día viaja igual", async () => {
    await obtenerKpis({
      desde: "2026-11-27T00:00:00.000-03:00",
      hasta: "2026-11-27T23:59:59.000-03:00",
    });
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("desde=2026-11-27T00");
  });
});
