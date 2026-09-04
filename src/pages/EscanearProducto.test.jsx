import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EscanearProducto from "./EscanearProducto";
import { useEscanerCodigoBarras } from "../hooks/useEscanerCodigoBarras";
import { verificarCodigoBarras } from "../services/productos";

vi.mock("../hooks/useEscanerCodigoBarras");
vi.mock("../services/productos");

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

function renderizar() {
  return render(
    <MemoryRouter initialEntries={["/productos/escanear"]}>
      <Routes>
        <Route path="/productos/escanear" element={<EscanearProducto />} />
        <Route path="/productos/:id" element={<p>Detalle del producto</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EscanearProducto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("muestra el producto cuando el backend responde existe:true", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: true,
      producto: { nombre: "Gaseosa 1.5L", codigoBarras: "7791234567890" },
    });

    renderizar();

    expect(await screen.findByText("Gaseosa 1.5L")).toBeInTheDocument();
  });

  test("'Ver detalle' navega a /productos/:id", async () => {
    const usuario = userEvent.setup();
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: true,
      producto: {
        id: "p1",
        nombre: "Gaseosa 1.5L",
        codigoBarras: "7791234567890",
      },
    });

    renderizar();

    const boton = await screen.findByRole("button", { name: "Ver detalle" });
    await usuario.click(boton);

    expect(await screen.findByText("Detalle del producto")).toBeInTheDocument();
  });

  test("muestra 'no encontrado' con opcion de alta deshabilitada cuando existe:false", async () => {
    mockHook({ estado: "detectado", codigo: "0000000000000" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: null,
    });

    renderizar();

    expect(
      await screen.findByText(/No encontramos ningún producto/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de alta" })).toBeDisabled();
  });

  test("muestra la tarjeta de Open Food Facts cuando el backend manda una sugerencia", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    verificarCodigoBarras.mockResolvedValueOnce({
      existe: false,
      sugerencia: { nombre: "Coca-Cola 1.5L", categoria: "Bebidas" },
    });

    renderizar();

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

    renderizar();

    await screen.findByText(/No encontramos ningún producto/);
    expect(
      screen.queryByText("Encontramos esto en Open Food Facts:"),
    ).not.toBeInTheDocument();
  });

  test("muestra error generico cuando el service de productos rechaza", async () => {
    mockHook({ estado: "detectado", codigo: "7791234567890" });
    verificarCodigoBarras.mockRejectedValueOnce(new Error("backend caido"));

    renderizar();

    expect(
      await screen.findByText(/No pudimos conectar con el servidor/),
    ).toBeInTheDocument();
  });

  test("muestra el mensaje especifico cuando el hook reporta permiso denegado", () => {
    mockHook({ estado: "error", error: "permiso-denegado" });

    renderizar();

    expect(
      screen.getByText(/No diste permiso para usar la cámara/),
    ).toBeInTheDocument();
  });

  test("muestra el mensaje de contexto inseguro cuando falta HTTPS", () => {
    mockHook({ estado: "error", error: "contexto-inseguro" });

    renderizar();

    expect(
      screen.getByText(/requiere una conexión segura/),
    ).toBeInTheDocument();
  });
});
