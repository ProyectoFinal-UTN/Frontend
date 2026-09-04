import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EscanearProducto from "./EscanearProducto";
import { useEscanerCodigoBarras } from "../hooks/useEscanerCodigoBarras";
import { verificarCodigoBarras } from "../services/productos";

vi.mock("../hooks/useEscanerCodigoBarras");
vi.mock("../services/productos");

const mockNavegar = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavegar }));

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

  test("pide la cámara automáticamente al entrar, sin esperar un click", () => {
    const iniciar = vi.fn();
    mockHook({ iniciar });

    render(<EscanearProducto />);

    expect(iniciar).toHaveBeenCalled();
  });

  test("muestra el producto cuando el backend responde existe:true", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: true,
      producto: { nombre: "Gaseosa 1.5L", codigoBarras: "7791234567890" },
    });

    render(<EscanearProducto />);

    expect(await screen.findByText("Gaseosa 1.5L")).toBeInTheDocument();
    expect(
      screen.getByText("Este producto ya está en tu catálogo"),
    ).toBeInTheDocument();
  });

  test("muestra 'no encontrado' con opcion de cargar a mano cuando ni OFF lo tiene", async () => {
    mockHook({ estado: "detectado", codigo: "0000000000000" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: null,
    });

    render(<EscanearProducto />);

    expect(
      await screen.findByText(/No encontramos ningún producto/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tampoco lo encontramos en Open Food Facts/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cargar a mano" }),
    ).not.toBeDisabled();
  });

  test("'Cargar a mano' navega a /productos?nuevo=<codigo>, sin sugerencia (HU-9)", async () => {
    mockHook({ estado: "detectado", codigo: "0000000000000" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: null,
    });

    render(<EscanearProducto />);

    const boton = await screen.findByRole("button", { name: "Cargar a mano" });
    boton.click();

    expect(mockNavegar).toHaveBeenCalledWith("/productos?nuevo=0000000000000");
  });

  test("'Dar de alta' suma nombre y categoria cuando hay sugerencia de Open Food Facts", async () => {
    mockHook({ estado: "detectado", codigo: "7790580146115" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: { nombre: "puré arcor", categoria: "Tomate natural triturado" },
    });

    render(<EscanearProducto />);

    const boton = await screen.findByRole("button", { name: "Dar de alta" });
    boton.click();

    const url = new URL(mockNavegar.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/productos");
    expect(url.searchParams.get("nuevo")).toBe("7790580146115");
    // Open Food Facts devuelve todo en minúsculas — el nombre se capitaliza
    // palabra por palabra antes de mostrarlo/mandarlo, ver `capitalizarNombre()`.
    expect(url.searchParams.get("nombre")).toBe("Puré Arcor");
    expect(url.searchParams.get("categoria")).toBe("Tomate natural triturado");
  });

  test("capitaliza la sugerencia de Open Food Facts al mostrarla en pantalla", async () => {
    mockHook({ estado: "detectado", codigo: "7790580146115" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: { nombre: "puré arcor", categoria: "tomate natural triturado" },
    });

    render(<EscanearProducto />);

    expect(await screen.findByText("Puré Arcor")).toBeInTheDocument();
    expect(
      screen.getByText(/Categoría: Tomate natural triturado/),
    ).toBeInTheDocument();
  });

  test("muestra la tarjeta de Open Food Facts cuando el backend manda una sugerencia", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: { nombre: "Coca-Cola 1.5L", categoria: "Bebidas" },
    });

    render(<EscanearProducto />);

    expect(await screen.findByText("Coca-Cola 1.5L")).toBeInTheDocument();
    expect(
      screen.getByText("Encontramos esto en Open Food Facts:"),
    ).toBeInTheDocument();
  });

  test("no muestra la tarjeta externa cuando el backend no manda sugerencia", async () => {
    mockHook({ estado: "detectado", codigo: "0000000000000" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: null,
    });

    render(<EscanearProducto />);

    await screen.findByText(/No encontramos ningún producto/);
    expect(
      screen.queryByText("Encontramos esto en Open Food Facts:"),
    ).not.toBeInTheDocument();
  });

  test("muestra error generico cuando el service de productos rechaza", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    verificarCodigoBarras.mockRejectedValueOnce(new Error("backend caido"));

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

  test("'Cancelar' apaga la cámara y vuelve a la pantalla anterior", () => {
    const detener = vi.fn();
    mockHook({ estado: "escaneando", detener });

    render(<EscanearProducto />);

    screen.getByRole("button", { name: "Cancelar" }).click();

    expect(detener).toHaveBeenCalled();
    // navigate(-1): "atrás", como el botón del navegador — sin esto la
    // pantalla quedaba en "inactivo" sin ninguna salida, porque la cámara
    // solo se pide una vez al montar.
    expect(mockNavegar).toHaveBeenCalledWith(-1);
  });
});
