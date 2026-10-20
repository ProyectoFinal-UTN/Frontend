import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  crearProveedor,
  editarProveedor,
  eliminarProveedor,
  obtenerProveedores,
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

  test("los errores del backend llegan a quien llama, con su status", async () => {
    const fallo = Object.assign(new Error("Ya existe"), { status: 409 });
    apiFetch.mockRejectedValueOnce(fallo);

    await expect(crearProveedor({ nombre: "X" })).rejects.toBe(fallo);
  });
});
