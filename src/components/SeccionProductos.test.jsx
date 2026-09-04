import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SeccionProductos from "./SeccionProductos";

// El service es la única puerta a la API, así que es lo único que se mockea.
// El `original()` preserva UNIDADES_MEDIDA, que alimenta al <select> y a la
// validación.
vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  crearProducto: vi.fn(),
  editarProducto: vi.fn(),
  eliminarProducto: vi.fn(),
}));

const { crearProducto, editarProducto, eliminarProducto } = await import(
  "../services/productos"
);

const alRecargar = vi.fn();

const PRODUCTOS = [
  {
    id: "p1",
    nombre: "Coca-Cola 500ml",
    codigoBarras: "7790895000782",
    categoria: "Bebidas",
    unidadMedida: "unidad",
    umbralMinimo: 5,
  },
  {
    id: "p2",
    nombre: "Yerba 1kg",
    codigoBarras: "7790387000123",
    categoria: "Almacén",
    unidadMedida: "kg",
    umbralMinimo: 2,
  },
];

function renderizar(props = {}) {
  return render(
    <MemoryRouter>
      <SeccionProductos
        productos={PRODUCTOS}
        alRecargar={alRecargar}
        {...props}
      />
    </MemoryRouter>,
  );
}

/** Completa el formulario abierto con datos válidos. */
async function completarFormulario(usuario, valores = {}) {
  const datos = {
    codigoBarras: "7791234567890",
    nombre: "Fideos 500g",
    categoria: "Almacén",
    umbralMinimo: "3",
    stockActual: "10",
    ...valores,
  };

  for (const [campo, valor] of Object.entries(datos)) {
    const input = screen.queryByLabelText(ETIQUETAS[campo]);
    if (!input) continue;
    await usuario.clear(input);
    await usuario.type(input, valor);
  }
}

const ETIQUETAS = {
  codigoBarras: /código de barras/i,
  nombre: /^nombre$/i,
  categoria: /categoría/i,
  umbralMinimo: /umbral mínimo/i,
  stockActual: /stock inicial/i,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Listado", () => {
  test("muestra los productos del comercio con sus datos", () => {
    renderizar();

    expect(screen.getByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(screen.getByText(/Bebidas · 7790895000782/)).toBeInTheDocument();
    expect(screen.getByText("Yerba 1kg")).toBeInTheDocument();
  });

  test("avisa cuando todavía no hay ninguno", () => {
    renderizar({ productos: [] });

    expect(screen.getByText(/todavía no cargaste/i)).toBeInTheDocument();
  });

  test("el formulario aparece recién al pedirlo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));

    expect(screen.getByLabelText(/código de barras/i)).toBeInTheDocument();
  });

  test("cada producto linkea a su detalle de stock (HU-11)", () => {
    renderizar();

    expect(
      screen.getByRole("link", { name: "Ver stock de Coca-Cola 500ml" }),
    ).toHaveAttribute("href", "/productos/p1");
  });
});

describe("Alta", () => {
  test("crea el producto y recarga la lista", async () => {
    crearProducto.mockResolvedValue({ id: "p3" });

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await completarFormulario(usuario);
    await usuario.selectOptions(screen.getByLabelText(/unidad de medida/i), "kg");
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(crearProducto).toHaveBeenCalledWith({
      codigoBarras: "7791234567890",
      nombre: "Fideos 500g",
      categoria: "Almacén",
      unidadMedida: "kg",
      umbralMinimo: 3,
      stockActual: 10,
    });
    expect(alRecargar).toHaveBeenCalled();
  });

  test("manda los números como números, no como texto", async () => {
    crearProducto.mockResolvedValue({});

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await completarFormulario(usuario);
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    // El backend chequea `typeof valor === "number"` y devuelve 400 ante un
    // string, que es lo que entrega un <input type="number">.
    const enviado = crearProducto.mock.calls[0][0];
    expect(enviado.umbralMinimo).toBe(3);
    expect(enviado.stockActual).toBe(10);
  });

  test("no llama al backend si el código de barras es inválido", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await completarFormulario(usuario, { codigoBarras: "abc" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(crearProducto).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/código de barras/i)).toHaveAccessibleDescription(
      /6 a 64 dígitos/,
    );
  });

  test("cierra el formulario cuando el alta sale bien", async () => {
    crearProducto.mockResolvedValue({});

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await completarFormulario(usuario);
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();
  });

  test("arranca abierto con el código puesto si vino del escáner", () => {
    renderizar({ codigoInicial: "7790895000782" });

    expect(screen.getByLabelText(/código de barras/i)).toHaveValue(
      "7790895000782",
    );
  });
});

describe("Código de barras duplicado (409)", () => {
  const conflicto = () => {
    const error = new Error(
      'Ya existe un producto con el código de barras "7790895000782"',
    );
    error.status = 409;
    return error;
  };

  test("muestra el mensaje del backend debajo del campo, no como error suelto", async () => {
    crearProducto.mockRejectedValue(conflicto());

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await completarFormulario(usuario, { codigoBarras: "7790895000782" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    const campo = await screen.findByLabelText(/código de barras/i);
    expect(campo).toHaveAccessibleDescription(/ya existe un producto/i);
    expect(campo).toHaveAttribute("aria-invalid", "true");
  });

  test("deja el formulario abierto con lo que ya se había tipeado", async () => {
    crearProducto.mockRejectedValue(conflicto());

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await completarFormulario(usuario, { codigoBarras: "7790895000782" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByLabelText(/^nombre$/i)).toHaveValue("Fideos 500g");
  });

  test("el error se borra apenas corrigen el código", async () => {
    crearProducto.mockRejectedValue(conflicto());

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await completarFormulario(usuario, { codigoBarras: "7790895000782" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    const campo = await screen.findByLabelText(/código de barras/i);
    await usuario.type(campo, "9");

    expect(campo).toHaveAttribute("aria-invalid", "false");
  });
});

describe("Edición", () => {
  test("abre el formulario con los datos del producto", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Editar Coca-Cola 500ml" }),
    );

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Coca-Cola 500ml");
    expect(screen.getByLabelText(/umbral mínimo/i)).toHaveValue(5);
    expect(screen.getByLabelText(/unidad de medida/i)).toHaveValue("unidad");
  });

  test("no ofrece stock inicial: cambiar cantidades es HU-13", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Editar Coca-Cola 500ml" }),
    );

    expect(screen.queryByLabelText(/stock inicial/i)).not.toBeInTheDocument();
  });

  test("guarda los cambios sin mandar stockActual", async () => {
    editarProducto.mockResolvedValue({});

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Editar Coca-Cola 500ml" }),
    );

    const nombre = screen.getByLabelText(/^nombre$/i);
    await usuario.clear(nombre);
    await usuario.type(nombre, "Coca-Cola 600ml");
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(editarProducto).toHaveBeenCalledWith("p1", {
      codigoBarras: "7790895000782",
      nombre: "Coca-Cola 600ml",
      categoria: "Bebidas",
      unidadMedida: "unidad",
      umbralMinimo: 5,
    });
    expect(editarProducto.mock.calls[0][1]).not.toHaveProperty("stockActual");
  });

  test("pasar de un producto a otro no arrastra los datos del anterior", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Editar Coca-Cola 500ml" }),
    );
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));
    await usuario.click(screen.getByRole("button", { name: "Editar Yerba 1kg" }));

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Yerba 1kg");
  });
});

describe("El producto ya no existe (404)", () => {
  test("cierra el formulario, avisa y refresca la lista", async () => {
    const error = new Error("El producto no existe");
    error.status = 404;
    editarProducto.mockRejectedValue(error);

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Editar Coca-Cola 500ml" }),
    );
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /ya no existe.*actualizamos la lista/i,
    );
    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();
    expect(alRecargar).toHaveBeenCalled();
  });
});

describe("Eliminar", () => {
  test("pide confirmación antes de borrar", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Coca-Cola 500ml" }),
    );

    expect(
      screen.getByText(/¿eliminar «coca-cola 500ml»\?/i),
    ).toBeInTheDocument();
    expect(eliminarProducto).not.toHaveBeenCalled();
  });

  test("aclara que es una baja lógica", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Coca-Cola 500ml" }),
    );

    expect(screen.getByText(/historial de movimientos se conserva/i)).toBeInTheDocument();
  });

  test("borra solo cuando se confirma", async () => {
    eliminarProducto.mockResolvedValue(null);

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Coca-Cola 500ml" }),
    );
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    expect(eliminarProducto).toHaveBeenCalledWith("p1");
    expect(alRecargar).toHaveBeenCalled();
  });

  test("cancelar no borra nada", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Coca-Cola 500ml" }),
    );
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(eliminarProducto).not.toHaveBeenCalled();
    expect(screen.getByText("Coca-Cola 500ml")).toBeInTheDocument();
  });
});

describe("Operaciones concurrentes", () => {
  test("deshabilita las acciones mientras hay una en curso", async () => {
    // Una promesa que no resuelve deja la pantalla en estado "guardando".
    eliminarProducto.mockReturnValue(new Promise(() => {}));

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Coca-Cola 500ml" }),
    );
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    // Sin esto, un doble clic manda dos requests.
    expect(screen.getByRole("button", { name: /sí, eliminar/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Editar Yerba 1kg" }),
    ).toBeDisabled();
  });
});
