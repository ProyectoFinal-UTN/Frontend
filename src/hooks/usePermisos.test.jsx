import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PERMISOS, configuracionDe } from "../tests/permisos";

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");
const { usePermisos } = await import("./usePermisos");

/** Expone el resultado de una pregunta en el DOM, para poder afirmarlo. */
function Sonda({ recurso, accion, modo = "puede" }) {
  const permisos = usePermisos();
  const responder = permisos[modo === "puede" ? "puede" : "puedeSalvoQueFalle"];

  return (
    <>
      <p data-testid="respuesta">{String(responder(recurso, accion))}</p>
      <p data-testid="rol">{permisos.rol ?? "sin rol"}</p>
      <p data-testid="se-sabe">{String(permisos.seSabe)}</p>
    </>
  );
}

function renderizar(props) {
  return render(<Sonda {...props} />);
}

const respuesta = () => screen.getByTestId("respuesta").textContent;

beforeEach(async () => {
  vi.clearAllMocks();
  const { olvidarPermisos } = await import("../services/permisos");
  olvidarPermisos();
  obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
});

describe("puede", () => {
  test("responde que sí a una acción que el rol tiene", async () => {
    renderizar({ recurso: "movimiento", accion: "create" });

    await waitFor(() => expect(respuesta()).toBe("true"));
  });

  test("responde que no a una acción que el rol no tiene", async () => {
    renderizar({ recurso: "producto", accion: "create" });

    await waitFor(() => expect(screen.getByTestId("rol").textContent).toBe("empleado"));
    expect(respuesta()).toBe("false");
  });

  // El empleado no recibe `member`, `invitation` ni `auditoria`: el backend
  // omite los recursos sin ninguna acción.
  test("responde que no a un recurso que no vino en la respuesta", async () => {
    renderizar({ recurso: "auditoria", accion: "read" });

    await waitFor(() => expect(screen.getByTestId("se-sabe").textContent).toBe("true"));
    expect(respuesta()).toBe("false");
  });

  // Mientras no se sabe, no se ofrece: es el default correcto para esconder.
  test("responde que no mientras los permisos no llegaron", () => {
    obtenerConfiguracion.mockReturnValue(new Promise(() => {}));

    renderizar({ recurso: "movimiento", accion: "create" });

    expect(respuesta()).toBe("false");
    expect(screen.getByTestId("se-sabe").textContent).toBe("false");
  });

  test("responde que no si la consulta falló", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar({ recurso: "movimiento", accion: "create" });

    await waitFor(() =>
      expect(screen.getByTestId("se-sabe").textContent).toBe("false"),
    );
    expect(respuesta()).toBe("false");
  });
});

describe("puedeSalvoQueFalle", () => {
  test("cuando sí se sabe, responde igual que puede", async () => {
    renderizar({ recurso: "producto", accion: "create", modo: "duda" });

    await waitFor(() => expect(screen.getByTestId("se-sabe").textContent).toBe("true"));
    expect(respuesta()).toBe("false");
  });

  // Esconderle media pantalla a un propietario porque se cayó una request
  // secundaria es peor que ofrecerle algo que el backend después rechaza.
  test("ante un fallo responde que sí, para no esconder de más", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar({ recurso: "producto", accion: "create", modo: "duda" });

    await waitFor(() => expect(respuesta()).toBe("true"));
  });
});

describe("el store", () => {
  test("una sola request aunque haya varios componentes preguntando", async () => {
    render(
      <>
        <Sonda recurso="producto" accion="read" />
        <Sonda recurso="movimiento" accion="create" />
        <Sonda recurso="alerta" accion="read" />
      </>,
    );

    await waitFor(() =>
      expect(screen.getAllByTestId("rol")[0].textContent).toBe("empleado"),
    );
    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1);
  });

  test("no muta los permisos que devolvió el backend", async () => {
    const original = structuredClone(PERMISOS.empleado);

    renderizar({ recurso: "producto", accion: "create" });
    await waitFor(() => expect(screen.getByTestId("se-sabe").textContent).toBe("true"));

    expect(PERMISOS.empleado).toEqual(original);
  });
});
