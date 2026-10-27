import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useSincronizarPush } from "./useSincronizarPush";
import { PERMISOS, configuracionDe } from "../tests/permisos";

vi.mock("./useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

vi.mock("../services/pushNavegador", () => ({
  sincronizar: vi.fn(),
  desuscribirAlSalir: vi.fn(),
}));

const { useAuth } = await import("./useAuth");
const { obtenerConfiguracion } = await import("../services/configuracion");
const { sincronizar, desuscribirAlSalir } = await import(
  "../services/pushNavegador"
);

function Sonda() {
  useSincronizarPush();
  return null;
}

function conUsuario(id) {
  useAuth.mockReturnValue({
    usuario: id ? { id } : null,
    autenticado: Boolean(id),
    cargando: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  conUsuario("u1");
  obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
  sincronizar.mockResolvedValue(true);
});

describe("useSincronizarPush", () => {
  test("al entrar con alerta:read reenvía la suscripción, una sola vez", async () => {
    const { rerender } = render(<Sonda />);

    await waitFor(() => expect(sincronizar).toHaveBeenCalledTimes(1));

    rerender(<Sonda />);
    rerender(<Sonda />);
    expect(sincronizar).toHaveBeenCalledTimes(1);
    expect(desuscribirAlSalir).not.toHaveBeenCalled();
  });

  test("si entra otra persona en la misma pestaña, la reenvía a su nombre", async () => {
    const { rerender } = render(<Sonda />);
    await waitFor(() => expect(sincronizar).toHaveBeenCalledTimes(1));

    conUsuario("u2");
    rerender(<Sonda />);

    await waitFor(() => expect(sincronizar).toHaveBeenCalledTimes(2));
  });

  test("mientras no llegan los permisos no hace nada", () => {
    obtenerConfiguracion.mockReturnValue(new Promise(() => {}));

    render(<Sonda />);

    expect(sincronizar).not.toHaveBeenCalled();
    expect(desuscribirAlSalir).not.toHaveBeenCalled();
  });

  test("si averiguar los permisos falla, no suelta la suscripción", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    render(<Sonda />);

    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalled());
    expect(desuscribirAlSalir).not.toHaveBeenCalled();
    expect(sincronizar).not.toHaveBeenCalled();
  });

  test("un rol sin alerta:read suelta la suscripción que quedó en el navegador", async () => {
    const sinAlertas = Object.fromEntries(
      Object.entries(PERMISOS.empleado).filter(([recurso]) => recurso !== "alerta"),
    );
    obtenerConfiguracion.mockResolvedValue(
      configuracionDe("empleado", { permisos: sinAlertas }),
    );

    render(<Sonda />);

    await waitFor(() => expect(desuscribirAlSalir).toHaveBeenCalledTimes(1));
    expect(sincronizar).not.toHaveBeenCalled();
  });

  test("si reenviarla falla, no rompe nada", async () => {
    sincronizar.mockRejectedValue(new Error("sin red"));

    render(<Sonda />);

    await waitFor(() => expect(sincronizar).toHaveBeenCalled());
  });
});
