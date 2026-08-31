import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EscanearProducto from "../src/pages/EscanearProducto";
import { useEscanerCodigoBarras } from "../src/hooks/useEscanerCodigoBarras";
import { buscarProductoPorCodigoBarras } from "../src/services/productos";
import { buscarSugerenciaExterna } from "../src/services/openFoodFacts";

vi.mock("../src/hooks/useEscanerCodigoBarras");
vi.mock("../src/services/productos");
vi.mock("../src/services/openFoodFacts");

function mockHook(overrides) {
  useEscanerCodigoBarras.mockReturnValue({
    videoRef: { current: null },
    iniciar: vi.fn(),
    detener: vi.fn(),
    estado: "inactivo",
    error: null,
    codigo: null,
    ...overrides,
  });
}

describe("EscanearProducto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("muestra el producto cuando el service lo encuentra", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    buscarProductoPorCodigoBarras.mockResolvedValueOnce({
      nombre: "Gaseosa 1.5L",
      codigoBarras: "7791234567890",
    });

    render(<EscanearProducto />);

    expect(await screen.findByText("Gaseosa 1.5L")).toBeInTheDocument();
  });

  test("muestra 'no encontrado' con opcion de alta deshabilitada cuando el service devuelve null", async () => {
    mockHook({ estado: "detectado", codigo: "0000000000000" });
    buscarProductoPorCodigoBarras.mockResolvedValueOnce(null);
    buscarSugerenciaExterna.mockResolvedValueOnce(null);

    render(<EscanearProducto />);

    expect(
      await screen.findByText(/No encontramos ningún producto/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de alta" })).toBeDisabled();
  });

  test("muestra la tarjeta de Open Food Facts cuando hay sugerencia externa", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    buscarProductoPorCodigoBarras.mockResolvedValueOnce(null);
    buscarSugerenciaExterna.mockResolvedValueOnce({
      nombre: "Coca-Cola 1.5L",
      marca: "Coca-Cola",
      categoria: "Bebidas",
      imagenUrl: null,
    });

    render(<EscanearProducto />);

    expect(await screen.findByText("Coca-Cola 1.5L")).toBeInTheDocument();
    expect(
      screen.getByText("Encontramos esto en Open Food Facts:"),
    ).toBeInTheDocument();
  });

  test("no muestra la tarjeta externa cuando Open Food Facts no tiene el codigo", async () => {
    mockHook({ estado: "detectado", codigo: "0000000000000" });
    buscarProductoPorCodigoBarras.mockResolvedValueOnce(null);
    buscarSugerenciaExterna.mockResolvedValueOnce(null);

    render(<EscanearProducto />);

    await screen.findByText(/No encontramos ningún producto/);
    expect(
      screen.queryByText("Encontramos esto en Open Food Facts:"),
    ).not.toBeInTheDocument();
  });

  test("muestra error generico cuando el service de productos rechaza", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    buscarProductoPorCodigoBarras.mockRejectedValueOnce(
      new Error("backend caido"),
    );

    render(<EscanearProducto />);

    expect(
      await screen.findByText(/No pudimos conectar con el servidor/),
    ).toBeInTheDocument();
  });

  test("muestra el mensaje especifico cuando el hook reporta permiso denegado", () => {
    mockHook({ estado: "error", error: "permiso-denegado" });

    render(<EscanearProducto />);

    expect(
      screen.getByText(/No diste permiso para usar la cámara/),
    ).toBeInTheDocument();
  });

  test("muestra el mensaje de contexto inseguro cuando falta HTTPS", () => {
    mockHook({ estado: "error", error: "contexto-inseguro" });

    render(<EscanearProducto />);

    expect(
      screen.getByText(/requiere una conexión segura/),
    ).toBeInTheDocument();
  });
});
