import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SeccionAuditoria from "./SeccionAuditoria";
import { describirEvento } from "../services/auditoria";

vi.mock("../services/auditoria", async (original) => ({
  ...(await original()),
  obtenerAuditoria: vi.fn(),
}));

const { obtenerAuditoria } = await import("../services/auditoria");

const REGISTRO = {
  eventos: [
    {
      id: "e1",
      usuarioCorreo: "ana@kiosco.com",
      accion: "inicio_sesion",
      recurso: "sesion",
      recursoId: null,
      fecha: "2026-09-04T14:30:00.000Z",
    },
    {
      id: "e2",
      usuarioCorreo: "beto@kiosco.com",
      accion: "eliminar",
      recurso: "producto",
      recursoId: "p-1",
      fecha: "2026-09-04T12:00:00.000Z",
    },
  ],
  filtros: {
    acciones: ["inicio_sesion", "eliminar"],
    recursos: ["sesion", "producto"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerAuditoria.mockResolvedValue(REGISTRO);
});

describe("describirEvento", () => {
  test("traduce los códigos a algo legible", () => {
    expect(
      describirEvento({ accion: "eliminar", recurso: "producto" }),
    ).toBe("Eliminó un producto");
  });

  test("un acceso se lee solo, sin repetir el recurso", () => {
    // "Inició sesión una sesión" sería absurdo.
    expect(
      describirEvento({ accion: "inicio_sesion", recurso: "sesion" }),
    ).toBe("Inició sesión");
  });

  test("un código desconocido se muestra tal cual en vez de romper", () => {
    expect(describirEvento({ accion: "raro", recurso: "cosa" })).toBe(
      "raro cosa",
    );
  });
});

describe("Listado", () => {
  test("muestra qué pasó, quién lo hizo y cuándo", async () => {
    render(<SeccionAuditoria />);

    // `selector: "p"` porque las etiquetas de los filtros repiten los mismos
    // textos dentro de sus `<option>`.
    expect(
      await screen.findByText("Eliminó un producto", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByText("beto@kiosco.com")).toBeInTheDocument();
    expect(
      screen.getByText("Inició sesión", { selector: "p" }),
    ).toBeInTheDocument();
  });

  test("avisa cuando no hay actividad", async () => {
    obtenerAuditoria.mockResolvedValue({
      eventos: [],
      filtros: { acciones: [], recursos: [] },
    });

    render(<SeccionAuditoria />);

    expect(
      await screen.findByText(/todavía no hay actividad/i),
    ).toBeInTheDocument();
  });

  test("si el usuario fue dado de baja, el evento igual se entiende", async () => {
    // El correo se guarda como copia justamente para esto.
    obtenerAuditoria.mockResolvedValue({
      ...REGISTRO,
      eventos: [{ ...REGISTRO.eventos[0], usuarioCorreo: null }],
    });

    render(<SeccionAuditoria />);

    expect(await screen.findByText(/usuario dado de baja/i)).toBeInTheDocument();
  });
});

describe("Filtros", () => {
  test("ofrece solo las opciones que existen", async () => {
    render(<SeccionAuditoria />);

    const filtroAccion = await screen.findByLabelText("Acción");

    expect(
      [...filtroAccion.options].map((o) => o.textContent),
    ).toEqual(["Todas", "Inició sesión", "Eliminó"]);
  });

  test("filtrar vuelve a pedir los datos", async () => {
    const usuario = userEvent.setup();
    render(<SeccionAuditoria />);

    await usuario.selectOptions(
      await screen.findByLabelText("Acción"),
      "eliminar",
    );

    expect(obtenerAuditoria).toHaveBeenCalledWith({
      accion: "eliminar",
      recurso: "",
    });
  });

  test("con un filtro puesto y sin resultados lo aclara", async () => {
    const usuario = userEvent.setup();
    render(<SeccionAuditoria />);

    await screen.findByText("Inició sesión", { selector: "p" });

    obtenerAuditoria.mockResolvedValue({
      eventos: [],
      filtros: REGISTRO.filtros,
    });

    await usuario.selectOptions(screen.getByLabelText("Acción"), "eliminar");

    expect(
      await screen.findByText(/no hay nada que coincida/i),
    ).toBeInTheDocument();
  });
});

describe("Cuando el backend rechaza", () => {
  test("muestra el error, que es lo que le pasa a un gerente o empleado", async () => {
    obtenerAuditoria.mockRejectedValue(
      new Error("El rol no tiene acceso a este recurso"),
    );

    render(<SeccionAuditoria />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no tiene acceso/i,
    );
  });
});
