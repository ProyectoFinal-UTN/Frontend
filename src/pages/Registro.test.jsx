import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Registro from "./Registro";
import { validarRegistro } from "./Registro.validacion";

// El service es la única puerta a la API, así que es lo único que se mockea.
vi.mock("../services/auth", () => ({
  registrar: vi.fn(),
}));

const { registrar } = await import("../services/auth");

const navegar = vi.fn();
vi.mock("react-router-dom", async (original) => ({
  ...(await original()),
  useNavigate: () => navegar,
}));

function renderizar() {
  return render(
    <MemoryRouter>
      <Registro />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validarRegistro", () => {
  const validos = {
    correo: "ana@kiosco.com",
    password: "unaClaveSegura",
    confirmacion: "unaClaveSegura",
  };

  test("no encuentra errores con datos válidos", () => {
    expect(validarRegistro(validos)).toEqual({});
  });

  test("pide los tres campos", () => {
    const errores = validarRegistro({
      correo: "",
      password: "",
      confirmacion: "",
    });

    expect(errores.correo).toBeTruthy();
    expect(errores.password).toBeTruthy();
    expect(errores.confirmacion).toBeTruthy();
  });

  test("rechaza un correo con formato inválido", () => {
    expect(validarRegistro({ ...validos, correo: "ana@" }).correo).toMatch(
      /no parece válido/i,
    );
  });

  test("exige el mínimo de caracteres de la contraseña", () => {
    const errores = validarRegistro({
      ...validos,
      password: "corta",
      confirmacion: "corta",
    });

    expect(errores.password).toMatch(/al menos 8/i);
  });

  test("rechaza contraseñas más largas de lo que bcrypt distingue", () => {
    const larga = "a".repeat(73);
    const errores = validarRegistro({
      ...validos,
      password: larga,
      confirmacion: larga,
    });

    expect(errores.password).toMatch(/72/);
  });

  test("detecta que la confirmación no coincide", () => {
    const errores = validarRegistro({ ...validos, confirmacion: "otra" });

    expect(errores.confirmacion).toMatch(/no coinciden/i);
  });
});

describe("Pantalla de registro", () => {
  test("muestra los tres campos que pide la historia", () => {
    renderizar();

    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByLabelText("Repetí la contraseña")).toBeInTheDocument();
  });

  test("no llama al backend si las contraseñas no coinciden", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText("Correo"), "ana@kiosco.com");
    await usuario.type(screen.getByLabelText("Contraseña"), "unaClaveSegura");
    await usuario.type(
      screen.getByLabelText("Repetí la contraseña"),
      "otraDistinta",
    );
    await usuario.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
  });

  test("registra y entra cuando los datos son válidos", async () => {
    registrar.mockResolvedValue({ ok: true, usuario: { name: "ana" } });

    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText("Correo"), "  ana@kiosco.com  ");
    await usuario.type(screen.getByLabelText("Contraseña"), "unaClaveSegura");
    await usuario.type(
      screen.getByLabelText("Repetí la contraseña"),
      "unaClaveSegura",
    );
    await usuario.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(registrar).toHaveBeenCalledWith({
      correo: "ana@kiosco.com", // recortado
      password: "unaClaveSegura",
    });
    expect(navegar).toHaveBeenCalledWith("/", { replace: true });
  });

  test("muestra el mensaje del backend si el correo ya existe", async () => {
    registrar.mockResolvedValue({
      ok: false,
      error: "Ese correo ya está registrado. Probá iniciar sesión.",
    });

    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText("Correo"), "ana@kiosco.com");
    await usuario.type(screen.getByLabelText("Contraseña"), "unaClaveSegura");
    await usuario.type(
      screen.getByLabelText("Repetí la contraseña"),
      "unaClaveSegura",
    );
    await usuario.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /ya está registrado/i,
    );
    expect(navegar).not.toHaveBeenCalled();
  });

  test("limpia el error del campo apenas se lo corrige", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /crear cuenta/i }));
    expect(await screen.findByText("Ingresá tu correo.")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Correo"), "a");
    expect(screen.queryByText("Ingresá tu correo.")).not.toBeInTheDocument();
  });
});
