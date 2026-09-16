import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Recuperar from "./Recuperar";

vi.mock("../services/auth", () => ({ pedirRecuperacion: vi.fn() }));

const { pedirRecuperacion } = await import("../services/auth");

function montar() {
  return render(
    <MemoryRouter>
      <Recuperar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  pedirRecuperacion.mockResolvedValue({ ok: true });
});

describe("Pedir el link", () => {
  test("manda el correo al service", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(/correo/i), "ana@kiosco.com");
    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    expect(pedirRecuperacion).toHaveBeenCalledWith({ correo: "ana@kiosco.com" });
  });

  test("recorta los espacios de más", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(/correo/i), "  ana@kiosco.com  ");
    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    expect(pedirRecuperacion).toHaveBeenCalledWith({ correo: "ana@kiosco.com" });
  });

  test("un correo vacío no llega al backend", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    expect(pedirRecuperacion).not.toHaveBeenCalled();
    expect(screen.getByText(/ingresá tu correo/i)).toBeInTheDocument();
  });

  test("un correo mal escrito tampoco", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(/correo/i), "ana@sinpunto");
    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    expect(pedirRecuperacion).not.toHaveBeenCalled();
    expect(screen.getByText(/no parece válido/i)).toBeInTheDocument();
  });
});

describe("Después de pedirlo", () => {
  test("el mensaje no confirma que el correo exista", async () => {
    // Es el criterio de la HU: el backend responde igual exista o no la cuenta,
    // para que no se pueda averiguar quién está registrado probando de a uno.
    // Si la pantalla dijera "te lo mandamos", filtraría justo eso.
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(/correo/i), "ana@kiosco.com");
    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    const aviso = await screen.findByRole("status");

    expect(aviso).toHaveTextContent(/si hay una cuenta con ese correo/i);
    expect(aviso).not.toHaveTextContent(/ana@kiosco\.com/);
  });

  test("avisa que el link vence y se usa una sola vez", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(/correo/i), "ana@kiosco.com");
    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    const aviso = await screen.findByRole("status");

    expect(aviso).toHaveTextContent(/vence en una hora/i);
    expect(aviso).toHaveTextContent(/una sola vez/i);
  });

  test("ya no se puede volver a pedir sin recargar", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(/correo/i), "ana@kiosco.com");
    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    await screen.findByRole("status");

    expect(
      screen.queryByRole("button", { name: /enviarme el link/i }),
    ).not.toBeInTheDocument();
  });
});

describe("Cuando falla la comunicación", () => {
  test("muestra el error y deja reintentar", async () => {
    pedirRecuperacion.mockResolvedValue({
      ok: false,
      error: "No pudimos conectarnos con el servidor.",
    });

    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(/correo/i), "ana@kiosco.com");
    await usuario.click(screen.getByRole("button", { name: /enviarme el link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no pudimos conectarnos/i,
    );
    // El formulario sigue ahí: es un fallo de red, no un "listo".
    expect(
      screen.getByRole("button", { name: /enviarme el link/i }),
    ).toBeInTheDocument();
  });
});
