import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import GraficoKpi from "./GraficoKpi";

/**
 * Los gráficos de Recharts (HU-22) se montan sin romper.
 *
 * jsdom no tiene ResizeObserver ni tamaño de layout, así que Recharts no llega
 * a dibujar barras: lo que se prueba es que cada tipo monta su contenedor, que
 * va oculto para lectores de pantalla (la tabla accesible la pone
 * `SeccionKpis`) y que un tipo desconocido no dibuja nada.
 */

class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("GraficoKpi", () => {
  test.each([
    ["ventasPorDia", [{ fecha: "2026-11-22", ventas: 2, unidades: 5 }]],
    ["comprasPorProveedor", [{ id: "v1", nombre: "Distribuidora X", unidades: 30, compras: 2 }]],
    ["stockPorUbicacion", [{ id: "u1", nombre: "Depósito", unidades: 20, productos: 1 }]],
  ])("monta el gráfico %s oculto para lectores de pantalla", (tipo, datos) => {
    render(<GraficoKpi tipo={tipo} datos={datos} />);

    expect(screen.getByTestId(`grafico-${tipo}`)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("las barras horizontales crecen con la cantidad de filas", () => {
    const filas = Array.from({ length: 8 }, (_, i) => ({
      id: `v${i}`,
      nombre: `Proveedor ${i}`,
      unidades: i,
      compras: 1,
    }));

    render(<GraficoKpi tipo="comprasPorProveedor" datos={filas} />);

    expect(screen.getByTestId("grafico-comprasPorProveedor").style.height).toBe(
      "360px",
    );
  });

  test("un tipo desconocido no dibuja nada", () => {
    const { container } = render(<GraficoKpi tipo="otro" datos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
