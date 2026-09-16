import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import SeccionMiCuenta from "./SeccionMiCuenta";

const navegar = vi.fn();

vi.mock("react-router-dom", async (original) => ({
  ...(await original()),
  useNavigate: () => navegar,
}));

vi.mock("../services/datosPersonales", () => ({
  obtenerMisDatos: vi.fn(),
  darDeBajaCuenta: vi.fn(),
  descargarMisDatos: vi.fn(),
}));

vi.mock("../services/auth", () => ({ refrescarSesion: vi.fn() }));

const { obtenerMisDatos, darDeBajaCuenta, descargarMisDatos } = await import(
  "../services/datosPersonales"
);
const { refrescarSesion } = await import("../services/auth");

const MIS_DATOS = {
  cuenta: { correo: "ana@kiosco.com", nombre: "ana" },
  comercios: [{ comercio: "Kiosco Don Pepe", rol: "propietario" }],
  sesionesActivas: [],
  actividadRegistrada: [],
};

function montar() {
  return render(
    <MemoryRouter>
      <SeccionMiCuenta />
    </MemoryRouter>,
  );
}

/** Abre la confirmación y escribe la palabra que la habilita. */
async function confirmarBaja(usuario, palabra = "BAJA") {
  await usuario.click(screen.getByRole("button", { name: /quiero darme de baja/i }));
  await usuario.type(screen.getByLabelText(/escribí baja/i), palabra);
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerMisDatos.mockResolvedValue(MIS_DATOS);
  darDeBajaCuenta.mockResolvedValue(null);
});

describe("Derecho de acceso", () => {
  test("descarga los datos que devuelve el backend", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(
      screen.getByRole("button", { name: /descargar mis datos/i }),
    );

    expect(obtenerMisDatos).toHaveBeenCalledTimes(1);
    expect(descargarMisDatos).toHaveBeenCalledWith(MIS_DATOS);
  });

  test("si falla, lo dice y no descarga nada", async () => {
    obtenerMisDatos.mockRejectedValue(new Error("No hay sesión activa"));

    const usuario = userEvent.setup();
    montar();

    await usuario.click(
      screen.getByRole("button", { name: /descargar mis datos/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hay sesión activa",
    );
    expect(descargarMisDatos).not.toHaveBeenCalled();
  });
});

describe("Derecho de supresión", () => {
  test("no se puede dar de baja de un solo click", async () => {
    const usuario = userEvent.setup();
    montar();

    // El primer botón solo abre la confirmación: todavía no llama al backend.
    await usuario.click(
      screen.getByRole("button", { name: /quiero darme de baja/i }),
    );

    expect(darDeBajaCuenta).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/escribí baja/i)).toBeInTheDocument();
  });

  test("el botón sigue bloqueado hasta escribir la palabra", async () => {
    const usuario = userEvent.setup();
    montar();

    await confirmarBaja(usuario, "cualquier cosa");

    expect(
      screen.getByRole("button", { name: /^dar de baja mi cuenta$/i }),
    ).toBeDisabled();
  });

  test("con la palabra escrita, da de baja y manda al login", async () => {
    const usuario = userEvent.setup();
    montar();

    await confirmarBaja(usuario);
    await usuario.click(
      screen.getByRole("button", { name: /^dar de baja mi cuenta$/i }),
    );

    expect(darDeBajaCuenta).toHaveBeenCalledTimes(1);
    // Sin refrescar la sesión, el store de Better Auth seguiría creyendo que
    // hay usuario y la pantalla siguiente entraría con una cuenta borrada.
    expect(refrescarSesion).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith("/login", { replace: true });
  });

  test("muestra el motivo cuando el backend la rechaza, y no navega", async () => {
    darDeBajaCuenta.mockRejectedValue(
      new Error("Sos el único propietario de un comercio."),
    );

    const usuario = userEvent.setup();
    montar();

    await confirmarBaja(usuario);
    await usuario.click(
      screen.getByRole("button", { name: /^dar de baja mi cuenta$/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sos el único propietario",
    );
    expect(navegar).not.toHaveBeenCalled();
  });

  test("cancelar cierra la confirmación sin llamar al backend", async () => {
    const usuario = userEvent.setup();
    montar();

    await confirmarBaja(usuario);
    await usuario.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(darDeBajaCuenta).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/escribí baja/i)).not.toBeInTheDocument();
  });

  test("avisa que los movimientos quedan en el libro del comercio", async () => {
    // Es lo que diferencia esta baja de un borrado: si no se dice, la persona
    // cree que se lleva también el historial del negocio.
    montar();

    expect(
      screen.getByText(/movimientos de stock.*quedan en el libro/is),
    ).toBeInTheDocument();
  });
});
