import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Restablecer from "./Restablecer";

const navegar = vi.fn();

vi.mock("react-router-dom", async (original) => ({
  ...(await original()),
  useNavigate: () => navegar,
}));

vi.mock("../services/auth", () => ({ restablecerPassword: vi.fn() }));

const { restablecerPassword } = await import("../services/auth");

function montar(ruta = "/restablecer?token=t-123") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Restablecer />
    </MemoryRouter>,
  );
}

/** Completa las dos contraseñas y envía. */
async function completar(usuario, password, confirmacion = password) {
  await usuario.type(screen.getByLabelText(/contraseña nueva/i), password);
  await usuario.type(screen.getByLabelText(/repetí la contraseña/i), confirmacion);
  await usuario.click(screen.getByRole("button", { name: /guardar/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  restablecerPassword.mockResolvedValue({ ok: true });
});

describe("Sin token en la URL", () => {
  test("no muestra el formulario y ofrece pedir otro link", () => {
    // Pasa si alguien entra a mano, o si el cliente de correo cortó el link.
    montar("/restablecer");

    expect(
      screen.queryByLabelText(/contraseña nueva/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/no tiene el código/i);
    expect(
      screen.getByRole("link", { name: /pedir un link nuevo/i }),
    ).toBeInTheDocument();
  });
});

describe("Elegir la contraseña nueva", () => {
  test("manda el token de la URL junto con la contraseña", async () => {
    const usuario = userEvent.setup();
    montar();

    await completar(usuario, "unaClaveSegura123");

    expect(restablecerPassword).toHaveBeenCalledWith({
      token: "t-123",
      password: "unaClaveSegura123",
    });
  });

  test("al terminar manda al login, sin dejar volver atrás", async () => {
    // `replace` a propósito: el link del correo ya no sirve, y volver con la
    // flecha del navegador a una pantalla muerta confunde.
    const usuario = userEvent.setup();
    montar();

    await completar(usuario, "unaClaveSegura123");

    expect(navegar).toHaveBeenCalledWith("/login", { replace: true });
  });

  test("avisa que hay que volver a entrar en todos lados", () => {
    // El backend cierra todas las sesiones abiertas. Si no se avisa, parece un
    // bug cuando la app se cierra sola en el celular.
    montar();

    expect(
      screen.getByText(/iniciar sesión otra vez.*dispositivos/is),
    ).toBeInTheDocument();
  });
});

describe("Validaciones antes de llamar al backend", () => {
  test("una contraseña corta no llega al servidor", async () => {
    const usuario = userEvent.setup();
    montar();

    await completar(usuario, "corta");

    expect(restablecerPassword).not.toHaveBeenCalled();
    expect(screen.getByText(/al menos 8 caracteres/i)).toBeInTheDocument();
  });

  test("si no coinciden, tampoco", async () => {
    const usuario = userEvent.setup();
    montar();

    await completar(usuario, "unaClaveSegura123", "otraClaveSegura123");

    expect(restablecerPassword).not.toHaveBeenCalled();
    expect(screen.getByText(/no coinciden/i)).toBeInTheDocument();
  });
});

describe("Cuando el token ya no sirve", () => {
  test("muestra el motivo y no navega", async () => {
    restablecerPassword.mockResolvedValue({
      ok: false,
      error: "Ese link ya no sirve: vence a la hora y se usa una sola vez.",
    });

    const usuario = userEvent.setup();
    montar();

    await completar(usuario, "unaClaveSegura123");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /ya no sirve/i,
    );
    expect(navegar).not.toHaveBeenCalled();
  });
});
