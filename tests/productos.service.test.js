import { beforeEach, describe, expect, test, vi } from "vitest";
import { buscarProductoPorCodigoBarras } from "../src/services/productos";
import { apiFetch } from "../src/services/api";

vi.mock("../src/services/api", () => ({ apiFetch: vi.fn() }));

describe("buscarProductoPorCodigoBarras", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  test("devuelve el producto cuando la api responde", async () => {
    const producto = { id: "p1", nombre: "Gaseosa 1.5L" };
    apiFetch.mockResolvedValueOnce({ producto });

    const resultado = await buscarProductoPorCodigoBarras("7791234567890");

    expect(resultado).toEqual(producto);
    expect(apiFetch).toHaveBeenCalledWith(
      "/productos/codigo-barras/7791234567890",
    );
  });

  test("devuelve null cuando el error tiene status 404 (codigo nuevo)", async () => {
    const error = new Error("Error en la petición: 404");
    error.status = 404;
    apiFetch.mockRejectedValueOnce(error);

    const resultado = await buscarProductoPorCodigoBarras("0000000000000");

    expect(resultado).toBeNull();
  });

  test("relanza otros errores (ej. 500 o backend caido)", async () => {
    const error = new Error("Error en la petición: 500");
    error.status = 500;
    apiFetch.mockRejectedValueOnce(error);

    await expect(
      buscarProductoPorCodigoBarras("7791234567890"),
    ).rejects.toThrow();
  });
});
