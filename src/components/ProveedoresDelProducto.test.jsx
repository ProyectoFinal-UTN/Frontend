import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProveedoresDelProducto from "./ProveedoresDelProducto";

/**
 * Proveedores de un producto (HU-20). Ejercita también `EditorDeVinculos`, que
 * es donde vive el ciclo de cargar, asociar, quitar y recargar.
 */

vi.mock("../services/proveedores", () => ({
  obtenerProveedores: vi.fn(),
  obtenerProveedoresDeProducto: vi.fn(),
  asociarProveedor: vi.fn(),
  desasociarProveedor: vi.fn(),
}));

const {
  obtenerProveedores,
  obtenerProveedoresDeProducto,
  asociarProveedor,
  desasociarProveedor,
} = await import("../services/proveedores");

const SUR = { id: "v1", nombre: "Distribuidora Sur", telefono: "11 5555-0000", correo: null };
const NORTE = { id: "v2", nombre: "Mayorista Norte", telefono: null, correo: "pedidos@norte.com" };
const OESTE = { id: "v3", nombre: "Bebidas del Oeste", telefono: null, correo: null };

function renderizar(props = {}) {
  return render(
    <MemoryRouter>
      <ProveedoresDelProducto productoId="p1" puedeEditar {...props} />
    </MemoryRouter>,
  );
}

const lista = () => screen.getByRole("list");
const selector = () => screen.getByLabelText("Agregar proveedor");

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProveedores.mockResolvedValue([SUR, NORTE, OESTE]);
  obtenerProveedoresDeProducto.mockResolvedValue([SUR]);
  asociarProveedor.mockResolvedValue({});
  desasociarProveedor.mockResolvedValue(null);
});

describe("Listado", () => {
  test("muestra los proveedores del producto, con teléfono y correo para contactarlos", async () => {
    obtenerProveedoresDeProducto.mockResolvedValue([SUR, NORTE]);
    renderizar();

    expect(await screen.findByText("Distribuidora Sur")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "11 5555-0000" })).toHaveAttribute(
      "href",
      "tel:1155550000",
    );
    expect(screen.getByRole("link", { name: "pedidos@norte.com" })).toHaveAttribute(
      "href",
      "mailto:pedidos@norte.com",
    );
    expect(obtenerProveedoresDeProducto).toHaveBeenCalledWith("p1");
  });

  test("sin proveedores lo dice, y sin dibujar una lista vacía", async () => {
    obtenerProveedoresDeProducto.mockResolvedValue([]);
    renderizar();

    expect(
      await screen.findByText("Este producto todavía no tiene proveedores asociados."),
    ).toBeInTheDocument();
    // Las filas de stock del detalle se cuentan por `listitem` en los E2E.
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  test("si la carga falla, avisa y deja reintentar", async () => {
    obtenerProveedoresDeProducto.mockRejectedValueOnce(
      Object.assign(new Error("Error interno del servidor"), { status: 500 }),
    );
    renderizar();

    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Distribuidora Sur")).toBeInTheDocument();
  });
});

describe("Asociar", () => {
  test("el desplegable ofrece solo los que todavía no están asociados", async () => {
    renderizar();
    await screen.findByText("Distribuidora Sur");

    const opciones = within(selector()).getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual(["Elegí uno…", "Mayorista Norte", "Bebidas del Oeste"]);
  });

  test("asocia el elegido, recarga y limpia el desplegable", async () => {
    renderizar();
    await screen.findByText("Distribuidora Sur");
    obtenerProveedoresDeProducto.mockResolvedValue([SUR, NORTE]);

    await userEvent.selectOptions(selector(), "v2");
    await userEvent.click(screen.getByRole("button", { name: "Asociar" }));

    expect(asociarProveedor).toHaveBeenCalledWith("p1", "v2");
    expect(await within(lista()).findByText("Mayorista Norte")).toBeInTheDocument();
    expect(selector()).toHaveValue("");
  });

  test("sin elegir, «Asociar» está deshabilitado", async () => {
    renderizar();
    await screen.findByText("Distribuidora Sur");

    expect(screen.getByRole("button", { name: "Asociar" })).toBeDisabled();
  });

  test("si ya estaba asociado (409), avisa y recarga la lista", async () => {
    asociarProveedor.mockRejectedValue(
      Object.assign(new Error("Ese proveedor ya está asociado a este producto"), {
        status: 409,
      }),
    );
    renderizar();
    await screen.findByText("Distribuidora Sur");

    await userEvent.selectOptions(selector(), "v3");
    await userEvent.click(screen.getByRole("button", { name: "Asociar" }));

    expect(await screen.findByText(/ya está asociado/i)).toBeInTheDocument();
    await waitFor(() => expect(obtenerProveedoresDeProducto).toHaveBeenCalledTimes(2));
  });

  test("con todos asociados no ofrece el desplegable", async () => {
    obtenerProveedoresDeProducto.mockResolvedValue([SUR, NORTE, OESTE]);
    renderizar();
    await screen.findByText("Bebidas del Oeste");

    expect(screen.queryByLabelText("Agregar proveedor")).not.toBeInTheDocument();
  });

  test("si el comercio no tiene proveedores, lleva a cargarlos", async () => {
    obtenerProveedores.mockResolvedValue([]);
    obtenerProveedoresDeProducto.mockResolvedValue([]);
    renderizar();

    expect(await screen.findByRole("link", { name: "Cargar proveedores" })).toHaveAttribute(
      "href",
      "/proveedores",
    );
  });
});

describe("Quitar", () => {
  test("quita el vínculo y recarga", async () => {
    renderizar();
    await screen.findByText("Distribuidora Sur");
    obtenerProveedoresDeProducto.mockResolvedValue([]);

    await userEvent.click(screen.getByRole("button", { name: "Quitar Distribuidora Sur" }));

    expect(desasociarProveedor).toHaveBeenCalledWith("p1", "v1");
    expect(
      await screen.findByText("Este producto todavía no tiene proveedores asociados."),
    ).toBeInTheDocument();
  });

  test("mientras quita, no se puede volver a tocar (sin doble clic)", async () => {
    desasociarProveedor.mockReturnValue(new Promise(() => {}));
    obtenerProveedoresDeProducto.mockResolvedValue([SUR, NORTE]);
    renderizar();
    await screen.findByText("Distribuidora Sur");

    await userEvent.click(screen.getByRole("button", { name: "Quitar Distribuidora Sur" }));

    expect(screen.getByRole("button", { name: "Quitar Mayorista Norte" })).toBeDisabled();
    expect(desasociarProveedor).toHaveBeenCalledTimes(1);
  });
});

describe("Sin permiso para modificar", () => {
  test("ve la lista, pero sin quitar ni asociar, y sin pedir las opciones", async () => {
    renderizar({ puedeEditar: false });

    expect(await screen.findByText("Distribuidora Sur")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /quitar/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Agregar proveedor")).not.toBeInTheDocument();
    expect(obtenerProveedores).not.toHaveBeenCalled();
  });
});
