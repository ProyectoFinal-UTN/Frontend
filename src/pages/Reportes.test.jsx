import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Reportes from "./Reportes";
import { configuracionDe } from "../tests/permisos";

/**
 * Página provisoria de «Reportes y KPIs» (HU-25): por ahora solo monta la
 * tarjeta de reporte PDF. El detalle de la tarjeta se prueba en
 * `components/TarjetaReportePdf.test.jsx`.
 */

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");

beforeEach(() => {
  vi.clearAllMocks();
  obtenerConfiguracion.mockResolvedValue(configuracionDe("gerente"));
});

test("muestra el título de la pantalla y la tarjeta de reporte PDF", async () => {
  render(
    <MemoryRouter>
      <Reportes />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole("heading", { level: 1, name: "Reportes y KPIs" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Generar reporte PDF" }),
  ).toBeInTheDocument();
});
