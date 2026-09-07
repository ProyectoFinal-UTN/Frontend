import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SeccionUsuarios from "./SeccionUsuarios";

vi.mock("../services/miembros", async (original) => ({
  ...(await original()),
  obtenerEquipo: vi.fn(),
  invitar: vi.fn(),
  cancelarInvitacion: vi.fn(),
  cambiarRol: vi.fn(),
  quitarMiembro: vi.fn(),
}));

const {
  obtenerEquipo,
  invitar,
  cancelarInvitacion,
  cambiarRol,
  quitarMiembro,
} = await import("../services/miembros");

const EQUIPO = {
  miembros: [
    {
      id: "m1",
      userId: "u1",
      nombre: "Ana",
      correo: "ana@kiosco.com",
      rol: "propietario",
    },
    {
      id: "m2",
      userId: "u2",
      nombre: "Beto",
      correo: "beto@kiosco.com",
      rol: "empleado",
    },
  ],
  invitaciones: [],
  roles: [],
};

function renderizar({ rol = "propietario", usuarioId = "u1", equipo } = {}) {
  obtenerEquipo.mockResolvedValue(equipo ?? EQUIPO);
  return render(<SeccionUsuarios rol={rol} usuarioId={usuarioId} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  invitar.mockResolvedValue({ id: "inv-1", correo: "nuevo@kiosco.com" });
  cambiarRol.mockResolvedValue({});
  quitarMiembro.mockResolvedValue(null);
  cancelarInvitacion.mockResolvedValue(null);
});

describe("Listado del equipo", () => {
  test("muestra a cada persona con su correo", async () => {
    renderizar();

    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("beto@kiosco.com")).toBeInTheDocument();
  });

  test("marca cuál sos vos", async () => {
    renderizar();

    expect(await screen.findByText("(vos)")).toBeInTheDocument();
  });
});

describe("Como propietario", () => {
  test("puede cambiar el rol de otro", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.selectOptions(
      await screen.findByLabelText(/rol de beto/i),
      "gerente",
    );

    expect(cambiarRol).toHaveBeenCalledWith("m2", "gerente");
  });

  test("no puede cambiarse el rol a sí mismo", async () => {
    // Un propietario que se baja por error se deja afuera sin vuelta atrás.
    renderizar();

    await screen.findByText("Ana");

    expect(screen.queryByLabelText(/rol de ana/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sacar a ana/i }),
    ).not.toBeInTheDocument();
  });

  test("sacar a alguien pide confirmación", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      await screen.findByRole("button", { name: /sacar a beto/i }),
    );

    expect(screen.getByText(/¿sacar a beto del comercio\?/i)).toBeInTheDocument();
    expect(quitarMiembro).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole("button", { name: /sí, sacarlo/i }));
    expect(quitarMiembro).toHaveBeenCalledWith("m2");
  });

  test("invita eligiendo el rol y muestra el link para compartir", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(
      await screen.findByLabelText(/correo de la persona/i),
      "nuevo@kiosco.com",
    );
    await usuario.selectOptions(
      screen.getByLabelText(/rol que va a tener/i),
      "gerente",
    );
    await usuario.click(screen.getByRole("button", { name: "Invitar" }));

    expect(invitar).toHaveBeenCalledWith({
      correo: "nuevo@kiosco.com",
      rol: "gerente",
    });

    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent(/nuevo@kiosco.com/);
    expect(aviso).toHaveTextContent(/\/invitacion\/inv-1/);
  });

  test("no invita con el correo vacío", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      await screen.findByRole("button", { name: "Invitar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/ingresá el correo/i);
    expect(invitar).not.toHaveBeenCalled();
  });

  test("muestra el mensaje del backend si la invitación falla", async () => {
    invitar.mockRejectedValue(
      new Error("Esa persona ya es parte del comercio"),
    );

    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(
      await screen.findByLabelText(/correo de la persona/i),
      "ana@kiosco.com",
    );
    await usuario.click(screen.getByRole("button", { name: "Invitar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya es parte/i);
  });

  test("puede cancelar una invitación pendiente", async () => {
    const usuario = userEvent.setup();
    renderizar({
      equipo: {
        ...EQUIPO,
        invitaciones: [
          {
            id: "inv-9",
            correo: "pendiente@kiosco.com",
            rol: "empleado",
            venceEl: "2099-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    await usuario.click(
      await screen.findByRole("button", {
        name: /cancelar la invitación a pendiente@kiosco.com/i,
      }),
    );

    expect(cancelarInvitacion).toHaveBeenCalledWith("inv-9");
  });
});

describe("Como gerente", () => {
  test("ve el equipo pero no puede modificarlo", async () => {
    renderizar({ rol: "gerente", usuarioId: "u2" });

    expect(await screen.findByText("Ana")).toBeInTheDocument();

    expect(screen.queryByLabelText(/rol de ana/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invitar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/solo el propietario puede cambiar roles/i),
    ).toBeInTheDocument();
  });
});

describe("Cuando el backend rechaza la lectura", () => {
  test("muestra el error, que es lo que le pasa a un empleado", async () => {
    obtenerEquipo.mockRejectedValue(
      new Error("El rol no tiene acceso a este recurso"),
    );

    render(<SeccionUsuarios rol="empleado" usuarioId="u3" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no tiene acceso/i);
  });
});
