import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";
import { validarLogin } from "./Login.validacion";

vi.mock("../services/auth", () => ({
  iniciarSesion: vi.fn(),
}));

const { iniciarSesion } = await import("../services/auth");

const navegar = vi.fn();
let estadoDeRuta = null;

vi.mock("react-router-dom", async (original) => ({
  ...(await original()),
  useNavigate: () => navegar,
  useLocation: () => ({ pathname: "/login", search: "", state: estadoDeRuta }),
}));

function renderizar() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

async function completarYEnviar(usuario, correo, password) {
  await usuario.type(screen.getByLabelText("Correo"), correo);
  await usuario.type(screen.getByLabelText("Contraseña"), password);
  await usuario.click(screen.getByRole("button", { name: "Entrar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  estadoDeRuta = null;
});

describe("validarLogin", () => {
  test("no encuentra errores con los dos campos completos", () => {
    expect(validarLogin({ correo: "ana@kiosco.com", password: "x" })).toEqual(
      {},
    );
  });

  test("pide los dos campos", () => {
    const errores = validarLogin({ correo: "", password: "" });

    expect(errores.correo).toBeTruthy();
    expect(errores.password).toBeTruthy();
  });

  test("no exige largo minimo de contrasena", () => {
    // Quien ya tiene cuenta puede haberla creado con otras reglas; rechazarle
    // la clave antes de probarla seria mentirle sobre por que no entra.
    expect(
      validarLogin({ correo: "ana@kiosco.com", password: "abc" }).password,
    ).toBeUndefined();
  });
});

describe("Pantalla de login", () => {
  test("muestra los dos campos", () => {
    renderizar();

    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  test("no llama al backend si falta un campo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Ingresá tu correo.")).toBeInTheDocument();
    expect(iniciarSesion).not.toHaveBeenCalled();
  });

  test("entra y va al inicio cuando las credenciales son correctas", async () => {
    iniciarSesion.mockResolvedValue({ ok: true, usuario: { name: "ana" } });

    const usuario = userEvent.setup();
    renderizar();

    await completarYEnviar(usuario, "  ana@kiosco.com  ", "unaClaveSegura");

    expect(iniciarSesion).toHaveBeenCalledWith({
      correo: "ana@kiosco.com", // recortado
      password: "unaClaveSegura",
    });
    expect(navegar).toHaveBeenCalledWith("/", { replace: true });
  });

  test("vuelve a la pantalla que se intentó abrir antes de entrar", async () => {
    // `RutaProtegida` deja la ruta original en el state al redirigir.
    estadoDeRuta = { desde: "/configuracion?seccion=ubicaciones" };
    iniciarSesion.mockResolvedValue({ ok: true, usuario: {} });

    const usuario = userEvent.setup();
    renderizar();

    await completarYEnviar(usuario, "ana@kiosco.com", "unaClaveSegura");

    expect(navegar).toHaveBeenCalledWith("/configuracion?seccion=ubicaciones", {
      replace: true,
    });
  });

  test("muestra el mensaje del backend si las credenciales no sirven", async () => {
    iniciarSesion.mockResolvedValue({
      ok: false,
      error: "El correo o la contraseña no son correctos.",
    });

    const usuario = userEvent.setup();
    renderizar();

    await completarYEnviar(usuario, "ana@kiosco.com", "claveEquivocada");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no son correctos/i,
    );
    expect(navegar).not.toHaveBeenCalled();
  });

  test("limpia el error del campo apenas se lo corrige", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Ingresá tu correo.")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Correo"), "a");
    expect(screen.queryByText("Ingresá tu correo.")).not.toBeInTheDocument();
  });
});
