import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  asociarProveedor,
  crearProveedor,
  desasociarProveedor,
  editarProveedor,
  eliminarProveedor,
  obtenerProductosDeProveedor,
  obtenerProveedores,
  obtenerProveedoresDeProducto,
} from "./proveedores";
import { apiFetch } from "./api";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

beforeEach(() => {
  apiFetch.mockReset();
});

describe("proveedores", () => {
  test("obtenerProveedores pide GET /proveedores sin mandar el comercio", async () => {
    const lista = [{ id: "v1", nombre: "Distribuidora Sur" }];
    apiFetch.mockResolvedValueOnce(lista);

    expect(await obtenerProveedores()).toEqual(lista);
    expect(apiFetch).toHaveBeenCalledWith("/proveedores");
  });

  test("crearProveedor hace POST con los datos en JSON", async () => {
    apiFetch.mockResolvedValueOnce({ id: "v1" });

    await crearProveedor({ nombre: "Distribuidora Sur" });

    expect(apiFetch).toHaveBeenCalledWith("/proveedores", {
      method: "POST",
      body: JSON.stringify({ nombre: "Distribuidora Sur" }),
    });
  });

  test("editarProveedor hace PUT sobre el id", async () => {
    apiFetch.mockResolvedValueOnce({ id: "v1" });

    await editarProveedor("v1", { rubro: "Bebidas" });

    expect(apiFetch).toHaveBeenCalledWith("/proveedores/v1", {
      method: "PUT",
      body: JSON.stringify({ rubro: "Bebidas" }),
    });
  });

  test("eliminarProveedor hace DELETE sobre el id", async () => {
    apiFetch.mockResolvedValueOnce(null);

    await eliminarProveedor("v1");

    expect(apiFetch).toHaveBeenCalledWith("/proveedores/v1", { method: "DELETE" });
  });

  test("obtenerProveedoresDeProducto pide GET /productos/:id/proveedores", async () => {
    apiFetch.mockResolvedValueOnce([]);

    await obtenerProveedoresDeProducto("p1");

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1/proveedores");
  });

  test("obtenerProductosDeProveedor pide GET /proveedores/:id/productos", async () => {
    apiFetch.mockResolvedValueOnce([]);

    await obtenerProductosDeProveedor("v1");

    expect(apiFetch).toHaveBeenCalledWith("/proveedores/v1/productos");
  });

  test("asociarProveedor hace POST sobre el producto con el proveedor en el cuerpo", async () => {
    apiFetch.mockResolvedValueOnce({});

    await asociarProveedor("p1", "v1");

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1/proveedores", {
      method: "POST",
      body: JSON.stringify({ proveedorId: "v1" }),
    });
  });

  test("desasociarProveedor hace DELETE sobre el vínculo", async () => {
    apiFetch.mockResolvedValueOnce(null);

    await desasociarProveedor("p1", "v1");

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1/proveedores/v1", {
      method: "DELETE",
    });
  });

  test("los errores del backend llegan a quien llama, con su status", async () => {
    const fallo = Object.assign(new Error("Ya existe"), { status: 409 });
    apiFetch.mockRejectedValueOnce(fallo);

    await expect(crearProveedor({ nombre: "X" })).rejects.toBe(fallo);
  });
});
