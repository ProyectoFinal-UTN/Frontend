import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SeccionRecomendaciones from "./SeccionRecomendaciones";

/**
 * HU-20, criterio 2: la tarjeta de reposición sugiere a quién pedirle. Archivo
 * aparte del de HU-27 para no mezclar las reglas de las dos historias; mismos
 * mocks.
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

function reponer(proveedoresSugeridos) {
  return {
    tipo: "reponer",
    prioridad: "alta",
    producto: { id: "p-1", nombre: "Yerba Playadito" },
    texto: "No te queda nada de Yerba Playadito. Convendría hacer un pedido.",
    porQue: "No quedan existencias y el mínimo configurado es 10.",
    datos: { enStock: 0, umbralMinimo: 10, unidadMedida: "unidad" },
    ...(proveedoresSugeridos !== undefined && { proveedoresSugeridos }),
  };
}

function conRecomendaciones(recomendaciones) {
  obtenerRecomendaciones.mockResolvedValue({
    generadoEn: "2026-10-25T15:00:00.000Z",
    ventana: { dias: 30, desde: "2026-09-25T15:00:00.000Z" },
    modo: "ia",
    resumen: "Mirando tu negocio encontré 1 producto para reponer.",
    recomendaciones,
  });
}

function renderizar() {
  return render(
    <MemoryRouter>
      <SeccionRecomendaciones />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerConfiguracion.mockResolvedValue({});
});

describe("Proveedores sugeridos en la reposición (HU-20)", () => {
  test("muestra a quién pedirle, con el teléfono para llamar", async () => {
    conRecomendaciones([
      reponer([
        { id: "v1", nombre: "Distribuidora Sur", telefono: "11 5555-0000", correo: null },
        { id: "v2", nombre: "Mayorista Norte", telefono: null, correo: null },
      ]),
    ]);
    renderizar();

    const bloque = await screen.findByTestId("recomendacion-proveedores");
    expect(bloque).toHaveTextContent("Se lo podés pedir a:");
    expect(bloque).toHaveTextContent("Distribuidora Sur · 11 5555-0000");
    expect(bloque).toHaveTextContent("Mayorista Norte");
    expect(within(bloque).getByRole("link", { name: "11 5555-0000" })).toHaveAttribute(
      "href",
      "tel:1155550000",
    );
  });

  test("sin proveedores asociados no dibuja nada", async () => {
    conRecomendaciones([reponer([])]);
    renderizar();

    await screen.findByTestId("recomendacion-reponer");
    expect(screen.queryByTestId("recomendacion-proveedores")).not.toBeInTheDocument();
  });

  test("un backend anterior a HU-20, sin el campo, tampoco rompe", async () => {
    conRecomendaciones([reponer(undefined)]);
    renderizar();

    await screen.findByTestId("recomendacion-reponer");
    expect(screen.queryByTestId("recomendacion-proveedores")).not.toBeInTheDocument();
  });

  test("los proveedores no se suman como tarjetas: siguen siendo una por recomendación", async () => {
    conRecomendaciones([
      reponer([{ id: "v1", nombre: "Distribuidora Sur", telefono: null, correo: null }]),
    ]);
    renderizar();

    await screen.findByTestId("recomendacion-proveedores");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
