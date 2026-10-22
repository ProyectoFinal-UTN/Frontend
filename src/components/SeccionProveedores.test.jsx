import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SeccionProveedores from "./SeccionProveedores";

// El service es la única puerta a la API, así que es lo único que se mockea.
vi.mock("../services/proveedores", async (original) => ({
  ...(await original()),
  crearProveedor: vi.fn(),
  editarProveedor: vi.fn(),
  eliminarProveedor: vi.fn(),
}));

const { crearProveedor, editarProveedor, eliminarProveedor } = await import(
  "../services/proveedores"
);

const alRecargar = vi.fn();

const PROVEEDORES = [
  {
    id: "v1",
    nombre: "Distribuidora Sur",
    contacto: "Laura Gómez",
    telefono: "11 5555-0000",
    correo: "ventas@distrisur.com",
    rubro: "Bebidas",
    condicionesPago: "30 días",
  },
  {
    id: "v2",
    nombre: "Mayorista Norte",
    contacto: null,
    telefono: null,
    correo: null,
    rubro: null,
    condicionesPago: null,
  },
];

const ETIQUETAS = {
  nombre: /^nombre$/i,
  contacto: /persona de contacto/i,
  telefono: /teléfono/i,
  correo: /correo/i,
  rubro: /rubro/i,
  condicionesPago: /condiciones de pago/i,
};

function renderizar(props = {}) {
  return render(
    <MemoryRouter>
      <SeccionProveedores
        proveedores={PROVEEDORES}
        alRecargar={alRecargar}
        {...props}
      />
    </MemoryRouter>,
  );
}

async function abrirAlta(usuario) {
  await usuario.click(screen.getByRole("button", { name: /nuevo proveedor/i }));
}

async function completar(usuario, valores) {
  for (const [campo, valor] of Object.entries(valores)) {
    const input = screen.getByLabelText(ETIQUETAS[campo]);
    await usuario.clear(input);
    if (valor) await usuario.type(input, valor);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  alRecargar.mockResolvedValue();
});

describe("Listado", () => {
  test("muestra cada proveedor con su rubro, condiciones y contacto", () => {
    renderizar();

    const fila = screen.getByText("Distribuidora Sur").closest("li");
    expect(within(fila).getByText("Bebidas · 30 días")).toBeInTheDocument();
    expect(within(fila).getByText("Laura Gómez")).toBeInTheDocument();
  });

  test("el teléfono y el correo son links para llamar y escribir", () => {
    renderizar();

    expect(screen.getByRole("link", { name: "11 5555-0000" })).toHaveAttribute(
      "href",
      "tel:1155550000",
    );
    expect(
      screen.getByRole("link", { name: "ventas@distrisur.com" }),
    ).toHaveAttribute("href", "mailto:ventas@distrisur.com");
  });

  test("un proveedor cargado solo con el nombre no muestra renglones vacíos", () => {
    renderizar();

    const fila = screen.getByText("Mayorista Norte").closest("li");
    expect(within(fila).queryByText(/·/)).not.toBeInTheDocument();
    expect(within(fila).queryByText(/null/)).not.toBeInTheDocument();
  });

  test("cada proveedor linkea a sus compras en el historial", () => {
    renderizar();

    expect(
      screen.getByRole("link", { name: "Ver compras a Distribuidora Sur" }),
    ).toHaveAttribute("href", "/movimientos?proveedorId=v1");
  });

  test("avisa cuando todavía no hay ninguno", () => {
    renderizar({ proveedores: [] });

    expect(screen.getByText(/todavía no cargaste ningún proveedor/i)).toBeInTheDocument();
  });

  test("el formulario aparece recién al pedirlo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    await abrirAlta(usuario);
    expect(screen.getByRole("form", { name: "Nuevo proveedor" })).toBeInTheDocument();
  });
});

describe("Sin permiso para modificar (HU-32)", () => {
  test("no ofrece cargar, editar ni eliminar, pero sí ver las compras", () => {
    renderizar({ puedeEditar: false });

    expect(screen.queryByRole("button", { name: /nuevo proveedor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^eliminar/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver compras a Distribuidora Sur" }),
    ).toBeInTheDocument();
  });
});

describe("Alta", () => {
  test("con solo el nombre alcanza, y recarga la lista", async () => {
    const usuario = userEvent.setup();
    crearProveedor.mockResolvedValue({ id: "v3" });
    renderizar();

    await abrirAlta(usuario);
    await completar(usuario, { nombre: "  Almacén Mayorista  " });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(crearProveedor).toHaveBeenCalledWith({
      nombre: "Almacén Mayorista",
      contacto: "",
      telefono: "",
      correo: "",
      rubro: "",
      condicionesPago: "",
    });
    expect(alRecargar).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "«Almacén Mayorista» se agregó a tus proveedores.",
    );
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  test("manda todos los datos cargados", async () => {
    const usuario = userEvent.setup();
    crearProveedor.mockResolvedValue({ id: "v3" });
    renderizar();

    await abrirAlta(usuario);
    await completar(usuario, {
      nombre: "Lácteos del Oeste",
      contacto: "Pedro",
      telefono: "11 4444-1111",
      correo: "pedro@lacteos.com",
      rubro: "Lácteos",
      condicionesPago: "Contado",
    });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(crearProveedor).toHaveBeenCalledWith({
      nombre: "Lácteos del Oeste",
      contacto: "Pedro",
      telefono: "11 4444-1111",
      correo: "pedro@lacteos.com",
      rubro: "Lácteos",
      condicionesPago: "Contado",
    });
  });

  test("sin nombre no llama al backend y marca el campo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await abrirAlta(usuario);
    await completar(usuario, { rubro: "Bebidas" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(crearProveedor).not.toHaveBeenCalled();
    expect(screen.getByLabelText(ETIQUETAS.nombre)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Ingresá el nombre del proveedor.")).toBeInTheDocument();
  });

  test("un correo mal escrito no llega al backend", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await abrirAlta(usuario);
    await completar(usuario, { nombre: "X", correo: "pedro@" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(crearProveedor).not.toHaveBeenCalled();
    expect(screen.getByLabelText(ETIQUETAS.correo)).toHaveAttribute("aria-invalid", "true");
  });

  test("el nombre repetido (409) se muestra debajo del nombre y conserva lo tipeado", async () => {
    const usuario = userEvent.setup();
    crearProveedor.mockRejectedValue(
      Object.assign(new Error('Ya existe un proveedor llamado "Distribuidora Sur"'), {
        status: 409,
      }),
    );
    renderizar();

    await abrirAlta(usuario);
    await completar(usuario, { nombre: "Distribuidora Sur", rubro: "Bebidas" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    const nombre = screen.getByLabelText(ETIQUETAS.nombre);
    expect(nombre).toHaveAttribute("aria-invalid", "true");
    expect(nombre).toHaveAccessibleDescription(/ya existe un proveedor/i);
    expect(screen.getByLabelText(ETIQUETAS.rubro)).toHaveValue("Bebidas");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("cualquier otro error se muestra arriba del formulario", async () => {
    const usuario = userEvent.setup();
    crearProveedor.mockRejectedValue(
      Object.assign(new Error("Error interno del servidor"), { status: 500 }),
    );
    renderizar();

    await abrirAlta(usuario);
    await completar(usuario, { nombre: "X" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Error interno del servidor");
    expect(screen.getByRole("form")).toBeInTheDocument();
  });
});

describe("Edición", () => {
  test("abre el formulario con los datos del proveedor", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Editar Distribuidora Sur" }));

    expect(screen.getByRole("form", { name: "Editar proveedor" })).toBeInTheDocument();
    expect(screen.getByLabelText(ETIQUETAS.nombre)).toHaveValue("Distribuidora Sur");
    expect(screen.getByLabelText(ETIQUETAS.condicionesPago)).toHaveValue("30 días");
  });

  test("los datos que vienen en null se editan como campos vacíos", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Editar Mayorista Norte" }));

    expect(screen.getByLabelText(ETIQUETAS.contacto)).toHaveValue("");
  });

  test("vaciar un campo lo manda vacío, para borrarlo", async () => {
    const usuario = userEvent.setup();
    editarProveedor.mockResolvedValue({});
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Editar Distribuidora Sur" }));
    await completar(usuario, { telefono: "", condicionesPago: "Contado" });
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(editarProveedor).toHaveBeenCalledWith("v1", {
      nombre: "Distribuidora Sur",
      contacto: "Laura Gómez",
      telefono: "",
      correo: "ventas@distrisur.com",
      rubro: "Bebidas",
      condicionesPago: "Contado",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Se guardaron los cambios de «Distribuidora Sur».",
    );
  });

  test("pasar de un proveedor a otro no arrastra los datos del anterior", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Editar Distribuidora Sur" }));
    await usuario.click(screen.getByRole("button", { name: "Editar Mayorista Norte" }));

    expect(screen.getByLabelText(ETIQUETAS.nombre)).toHaveValue("Mayorista Norte");
    expect(screen.getByLabelText(ETIQUETAS.rubro)).toHaveValue("");
  });

  test("si el proveedor ya no existe (404), cierra el formulario, avisa y recarga", async () => {
    const usuario = userEvent.setup();
    editarProveedor.mockRejectedValue(
      Object.assign(new Error("El proveedor no existe"), { status: 404 }),
    );
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Editar Distribuidora Sur" }));
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByText(/ese proveedor ya no existe/i)).toBeInTheDocument();
    expect(alRecargar).toHaveBeenCalled();
  });
});

describe("Eliminar", () => {
  test("pide confirmación y aclara que las compras se conservan", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Eliminar Distribuidora Sur" }));

    expect(screen.getByText("¿Eliminar «Distribuidora Sur»?")).toBeInTheDocument();
    expect(screen.getByText(/siguen en el historial/i)).toBeInTheDocument();
    expect(eliminarProveedor).not.toHaveBeenCalled();
  });

  test("borra solo cuando se confirma, y recarga", async () => {
    const usuario = userEvent.setup();
    eliminarProveedor.mockResolvedValue();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Eliminar Distribuidora Sur" }));
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    expect(eliminarProveedor).toHaveBeenCalledWith("v1");
    expect(alRecargar).toHaveBeenCalled();
  });

  test("cancelar no borra nada", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Eliminar Distribuidora Sur" }));
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(eliminarProveedor).not.toHaveBeenCalled();
    expect(screen.getByText("Distribuidora Sur")).toBeInTheDocument();
  });

  test("un fallo al borrar se muestra", async () => {
    const usuario = userEvent.setup();
    eliminarProveedor.mockRejectedValue(
      Object.assign(new Error("Error interno del servidor"), { status: 500 }),
    );
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Eliminar Distribuidora Sur" }));
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    expect(await screen.findByText(/error interno del servidor/i)).toBeInTheDocument();
  });

  test("mientras borra, las acciones quedan deshabilitadas (sin doble clic)", async () => {
    const usuario = userEvent.setup();
    eliminarProveedor.mockReturnValue(new Promise(() => {}));
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Eliminar Distribuidora Sur" }));
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    expect(screen.getByRole("button", { name: /sí, eliminar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar Mayorista Norte" })).toBeDisabled();
    expect(eliminarProveedor).toHaveBeenCalledTimes(1);
  });
});
