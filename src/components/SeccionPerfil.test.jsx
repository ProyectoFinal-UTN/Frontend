import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SeccionPerfil from "./SeccionPerfil";
import { validarPerfil } from "./SeccionPerfil.validacion";

vi.mock("../services/comercio", () => ({
  guardarPerfil: vi.fn(),
}));

const { guardarPerfil } = await import("../services/comercio");

const alGuardar = vi.fn();

const PERFIL_VACIO = {
  nombre: "Mi comercio",
  rubro: null,
  direccion: null,
  telefono: null,
  correoContacto: null,
};

function renderizar(perfil = PERFIL_VACIO) {
  return render(<SeccionPerfil perfil={perfil} alGuardar={alGuardar} />);
}

async function completarObligatorios(usuario) {
  await usuario.clear(screen.getByLabelText(/nombre del negocio/i));
  await usuario.type(
    screen.getByLabelText(/nombre del negocio/i),
    "Kiosco Don Pepe",
  );
  await usuario.type(screen.getByLabelText("Rubro"), "Kiosco");
}

beforeEach(() => {
  vi.clearAllMocks();
  guardarPerfil.mockResolvedValue({});
});

describe("validarPerfil", () => {
  const validos = { nombre: "Kiosco", rubro: "Kiosco" };

  test("no encuentra errores con los obligatorios completos", () => {
    expect(validarPerfil(validos)).toEqual({});
  });

  test("exige nombre y rubro", () => {
    const errores = validarPerfil({ nombre: "  ", rubro: "" });

    expect(errores.nombre).toBeTruthy();
    expect(errores.rubro).toBeTruthy();
  });

  test("no exige los datos de contacto", () => {
    const errores = validarPerfil(validos);

    expect(errores.direccion).toBeUndefined();
    expect(errores.telefono).toBeUndefined();
    expect(errores.correoContacto).toBeUndefined();
  });

  test("valida el correo solo si se carga", () => {
    expect(
      validarPerfil({ ...validos, correoContacto: "" }).correoContacto,
    ).toBeUndefined();
    expect(
      validarPerfil({ ...validos, correoContacto: "no-es@" }).correoContacto,
    ).toMatch(/no parece válido/i);
  });

  test("respeta los largos máximos de la base", () => {
    expect(
      validarPerfil({ ...validos, nombre: "x".repeat(151) }).nombre,
    ).toMatch(/150/);
  });
});

describe("Formulario de perfil", () => {
  test("muestra los datos que ya tiene el comercio", () => {
    renderizar({
      nombre: "Kiosco Don Pepe",
      rubro: "Kiosco",
      direccion: "Av. Siempreviva 742",
      telefono: null,
      correoContacto: null,
    });

    expect(screen.getByLabelText(/nombre del negocio/i)).toHaveValue(
      "Kiosco Don Pepe",
    );
    expect(screen.getByLabelText(/dirección/i)).toHaveValue(
      "Av. Siempreviva 742",
    );
    // Los nulos del backend no deben llegar al input como "null".
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue("");
  });

  test("guarda los datos recortando espacios", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.clear(screen.getByLabelText(/nombre del negocio/i));
    await usuario.type(
      screen.getByLabelText(/nombre del negocio/i),
      "  Kiosco Don Pepe  ",
    );
    await usuario.type(screen.getByLabelText("Rubro"), "  Kiosco  ");
    await usuario.click(
      screen.getByRole("button", { name: /guardar cambios/i }),
    );

    expect(guardarPerfil).toHaveBeenCalledWith({
      nombre: "Kiosco Don Pepe",
      rubro: "Kiosco",
      direccion: "",
      telefono: "",
      correoContacto: "",
    });
    expect(alGuardar).toHaveBeenCalled();
  });

  test("avisa cuando se guardó", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await completarObligatorios(usuario);
    await usuario.click(
      screen.getByRole("button", { name: /guardar cambios/i }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /datos guardados/i,
    );
  });

  test("no llama al backend si falta un obligatorio", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.clear(screen.getByLabelText(/nombre del negocio/i));
    await usuario.click(
      screen.getByRole("button", { name: /guardar cambios/i }),
    );

    expect(await screen.findByText(/ingresá el nombre/i)).toBeInTheDocument();
    expect(screen.getByText(/ingresá el rubro/i)).toBeInTheDocument();
    expect(guardarPerfil).not.toHaveBeenCalled();
  });

  test("muestra el mensaje del backend si rechaza el guardado", async () => {
    guardarPerfil.mockRejectedValue(
      new Error("El rol no tiene permiso para esta acción"),
    );

    const usuario = userEvent.setup();
    renderizar();

    await completarObligatorios(usuario);
    await usuario.click(
      screen.getByRole("button", { name: /guardar cambios/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/no tiene permiso/i);
  });

  test("limpia el error del campo apenas se lo corrige", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.clear(screen.getByLabelText(/nombre del negocio/i));
    await usuario.click(
      screen.getByRole("button", { name: /guardar cambios/i }),
    );
    expect(await screen.findByText(/ingresá el nombre/i)).toBeInTheDocument();

    await usuario.type(screen.getByLabelText(/nombre del negocio/i), "K");
    expect(screen.queryByText(/ingresá el nombre/i)).not.toBeInTheDocument();
  });
});
