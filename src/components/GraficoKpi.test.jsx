import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import GraficoKpi from "./GraficoKpi";

/**
 * Los gráficos de Recharts (HU-22, HU-23) se montan sin romper.
 *
 * jsdom no tiene ResizeObserver ni tamaño de layout. El falso de abajo le
 * informa una medida al `ResponsiveContainer`, que es lo único que le falta a
 * Recharts para dibujar: sin eso el gráfico monta vacío y no se puede ver qué
 * dice el eje, que es justo lo que cambió en HU-23.
 */

const ANCHO = 600;
const ALTO = 300;

class ResizeObserverFalso {
  constructor(callback) {
    this.callback = callback;
  }

  observe(elemento) {
    this.callback(
      [{ target: elemento, contentRect: { width: ANCHO, height: ALTO } }],
      this,
    );
  }

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

  test("el eje de ventas muestra la etiqueta ya armada, no la fecha cruda", () => {
    // HU-23: con un rango largo la barra es una semana o un mes, y cómo se
    // llama cada grupo lo decide `agruparSerie`. Si el eje volviera a leer
    // `fecha`, el gráfico diría "2026-03-16" donde la tabla accesible dice
    // "16/03–22/03": dos cosas distintas para la misma barra.
    const { container } = render(
      <GraficoKpi
        tipo="ventasPorDia"
        datos={[
          { fecha: "2026-03-16", etiqueta: "16/03–22/03", ventas: 2, unidades: 5 },
        ]}
      />,
    );

    const textos = [
      ...container.querySelectorAll(".recharts-cartesian-axis-tick-value"),
    ].map((nodo) => nodo.textContent);

    expect(textos).toContain("16/03–22/03");
    expect(textos).not.toContain("2026-03-16");
  });

  test("un tipo desconocido no dibuja nada", () => {
    const { container } = render(<GraficoKpi tipo="otro" datos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
