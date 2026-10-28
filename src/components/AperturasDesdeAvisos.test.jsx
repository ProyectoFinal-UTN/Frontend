import { describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import AperturasDesdeAvisos from "./AperturasDesdeAvisos";

vi.mock("../services/pushNavegador", () => ({
  escucharAperturas: vi.fn(() => vi.fn()),
}));

const { escucharAperturas } = await import("../services/pushNavegador");

function Ubicacion() {
  return <span data-testid="ruta">{useLocation().pathname}</span>;
}

describe("AperturasDesdeAvisos", () => {
  test("tocar un aviso con la app abierta lleva a la pantalla del producto", () => {
    render(
      <MemoryRouter initialEntries={["/movimientos"]}>
        <AperturasDesdeAvisos />
        <Ubicacion />
      </MemoryRouter>,
    );

    const alAbrir = escucharAperturas.mock.calls[0][0];
    act(() => alAbrir("/productos/123e4567-e89b-12d3-a456-426614174000"));

    expect(screen.getByTestId("ruta")).toHaveTextContent(
      "/productos/123e4567-e89b-12d3-a456-426614174000",
    );
  });

  test("deja de escuchar al desmontarse", () => {
    const dejar = vi.fn();
    escucharAperturas.mockReturnValueOnce(dejar);

    const { unmount } = render(
      <MemoryRouter>
        <AperturasDesdeAvisos />
      </MemoryRouter>,
    );
    unmount();

    expect(dejar).toHaveBeenCalled();
  });
});
