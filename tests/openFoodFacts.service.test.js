import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buscarSugerenciaExterna } from "../src/services/openFoodFacts";

describe("buscarSugerenciaExterna", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("devuelve una sugerencia normalizada cuando el producto existe en Open Food Facts", async () => {
    fetch.mockResolvedValueOnce({
      json: async () => ({
        status: 1,
        product: {
          product_name: "Coca-Cola 1.5L",
          brands: "Coca-Cola",
          categories: "Bebidas",
          image_front_url: "https://example.com/img.jpg",
        },
      }),
    });

    const resultado = await buscarSugerenciaExterna("7791234567890");

    expect(resultado).toEqual({
      nombre: "Coca-Cola 1.5L",
      marca: "Coca-Cola",
      categoria: "Bebidas",
      imagenUrl: "https://example.com/img.jpg",
    });
  });

  test("devuelve null cuando el codigo no existe en Open Food Facts", async () => {
    fetch.mockResolvedValueOnce({ json: async () => ({ status: 0 }) });

    const resultado = await buscarSugerenciaExterna("0000000000000");

    expect(resultado).toBeNull();
  });

  test("devuelve null (sin relanzar) ante un error de red o timeout", async () => {
    fetch.mockRejectedValueOnce(new Error("network error"));

    const resultado = await buscarSugerenciaExterna("7791234567890");

    expect(resultado).toBeNull();
  });
});
