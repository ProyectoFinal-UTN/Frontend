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
