import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  crearProducto,
  editarProducto,
  eliminarProducto,
  obtenerProductos,
  verificarCodigoBarras,
} from "./productos";
import { apiFetch } from "./api";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

/** Un alta válida, con los números ya convertidos como los espera el backend. */
const ALTA = {
  codigoBarras: "7790895000782",
  nombre: "Coca-Cola 500ml",
  categoria: "Bebidas",
  unidadMedida: "unidad",
  umbralMinimo: 5,
  stockActual: 20,
};

describe("obtenerProductos", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  test("pide GET /productos sin mandar el comercio", async () => {
    const productos = [{ id: "p1", nombre: "Yerba 1kg" }];
    apiFetch.mockResolvedValueOnce(productos);

    const resultado = await obtenerProductos();

    expect(resultado).toEqual(productos);
    expect(apiFetch).toHaveBeenCalledWith("/productos");
  });
});

describe("crearProducto", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  test("postea el producto a /productos", async () => {
    apiFetch.mockResolvedValueOnce({ id: "p1", ...ALTA });

    await crearProducto(ALTA);

    expect(apiFetch).toHaveBeenCalledWith("/productos", {
      method: "POST",
      body: JSON.stringify(ALTA),
    });
  });

  test("manda umbralMinimo y stockActual como numeros, no como texto", async () => {
    apiFetch.mockResolvedValueOnce({});

    await crearProducto(ALTA);

    // El backend chequea `typeof valor === "number"`: si el service dejara
    // pasar el string del <input type="number">, la request vuelve con un 400.
    const enviado = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(enviado.umbralMinimo).toBe(5);
    expect(enviado.stockActual).toBe(20);
  });

  test("relanza el 409 con su status para que el formulario lo ubique", async () => {
    const error = new Error(
      'Ya existe un producto con el código de barras "7790895000782"',
    );
    error.status = 409;
    apiFetch.mockRejectedValueOnce(error);

    await expect(crearProducto(ALTA)).rejects.toMatchObject({ status: 409 });
  });
});

describe("editarProducto", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  test("pone los datos en PUT /productos/:id", async () => {
    const datos = { ...ALTA };
    delete datos.stockActual;
    apiFetch.mockResolvedValueOnce({ id: "p1", ...datos });

    await editarProducto("p1", datos);

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1", {
      method: "PUT",
      body: JSON.stringify(datos),
    });
  });

  test("relanza el 404 con su status cuando el producto ya no esta", async () => {
    const error = new Error("El producto no existe");
    error.status = 404;
    apiFetch.mockRejectedValueOnce(error);

    await expect(editarProducto("p1", {})).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("eliminarProducto", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  test("pide DELETE /productos/:id", async () => {
    // El backend responde 204 sin cuerpo y apiFetch devuelve null.
    apiFetch.mockResolvedValueOnce(null);

    await eliminarProducto("p1");

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1", {
      method: "DELETE",
    });
  });
});

describe("verificarCodigoBarras", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  test("pide GET /productos/codigo/:codigo y devuelve la respuesta tal cual", async () => {
    const respuesta = {
      existe: true,
      producto: { id: "p1", nombre: "Gaseosa 1.5L" },
    };
    apiFetch.mockResolvedValueOnce(respuesta);

    const resultado = await verificarCodigoBarras("7791234567890");

    expect(resultado).toEqual(respuesta);
    expect(apiFetch).toHaveBeenCalledWith("/productos/codigo/7791234567890");
  });

  test("devuelve existe:false con la sugerencia cuando el codigo es nuevo", async () => {
    const respuesta = {
      existe: false,
      sugerencia: { nombre: "Coca-Cola 1.5L", categoria: "Bebidas" },
    };
    apiFetch.mockResolvedValueOnce(respuesta);

    const resultado = await verificarCodigoBarras("0000000000000");

    expect(resultado).toEqual(respuesta);
  });

  test("relanza el error si la request falla (ej. 400 o backend caido)", async () => {
    const error = new Error("Error en la petición: 400");
    error.status = 400;
    apiFetch.mockRejectedValueOnce(error);

    await expect(verificarCodigoBarras("abc")).rejects.toThrow();
  });
});
