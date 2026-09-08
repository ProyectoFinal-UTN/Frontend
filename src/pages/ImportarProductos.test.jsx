import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ImportarProductos from "./ImportarProductos";

/**
 * Se mockean los services y no `fetch`, como en el resto del repo: el service
 * es la única puerta a la API, así que mockearlo cubre lo mismo sin acoplar el
 * test a la forma de la request.
 */
vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  importarCatalogo: vi.fn(),
}));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { importarCatalogo } = await import("../services/productos");
const { obtenerConfiguracion } = await import("../services/configuracion");

const CSV_VALIDO =
  "nombre,codigo_barras,categoria,unidad_medida\n" +
  "Yerba,7790895000782,Almacén,unidad\n" +
  "Fideos,7790070410016,Almacén,paquete";

const REPORTE_LIMPIO = {
  totalFilas: 2,
  procesadas: 2,
  importados: 2,
  fallidos: 0,
  productos: [
    { fila: 2, id: "p1", nombre: "Yerba", codigoBarras: "7790895000782" },
    { fila: 3, id: "p2", nombre: "Fideos", codigoBarras: "7790070410016" },
  ],
  errores: [],
  interrumpido: false,
  interrupcion: null,
};

function archivoCsv(contenido = CSV_VALIDO, nombre = "catalogo.csv") {
  return new File([contenido], nombre, { type: "text/csv" });
}

function renderizar() {
  return render(
    <MemoryRouter>
      <ImportarProductos />
    </MemoryRouter>,
  );
}

/**
 * Elige el archivo, esperando primero a que la pantalla sepa el rol.
 *
 * Hasta que `obtenerConfiguracion` no responde se muestra "Cargando…" y el
 * input todavía no existe, así que hay que buscarlo con `find`.
 */
async function elegir(usuario, archivo) {
  await usuario.upload(await screen.findByLabelText("Archivo CSV"), archivo);
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerConfiguracion.mockResolvedValue({ rol: "propietario" });
});

describe("vista previa antes de confirmar", () => {
  test("no manda nada al servidor con solo elegir el archivo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await elegir(usuario, archivoCsv());

    await screen.findByText(/El archivo tiene 2 productos/);
    expect(importarCatalogo).not.toHaveBeenCalled();
  });

  test("muestra las filas con el número de línea del archivo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await elegir(usuario, archivoCsv());

    // La fila 1 son los encabezados: el primer producto es la 2, igual que en
    // Excel y que en el reporte que devuelve el backend.
    const primera = await screen.findByRole("row", { name: /Yerba/ });
    expect(primera).toHaveTextContent("2");
  });

  test("sube el archivo recién al confirmar", async () => {
    const usuario = userEvent.setup();
    importarCatalogo.mockResolvedValue(REPORTE_LIMPIO);
    renderizar();

    await elegir(usuario, archivoCsv());
    await usuario.click(
      await screen.findByRole("button", {
        name: "Confirmar carga de 2 productos",
      }),
    );

    await waitFor(() => expect(importarCatalogo).toHaveBeenCalledTimes(1));
    expect(importarCatalogo).toHaveBeenCalledWith(expect.any(File));
  });

  test("avisa de la columna faltante antes de subir y no deja confirmar", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await elegir(usuario, archivoCsv("nombre,codigo_barras\nYerba,7790895000782"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Al archivo le faltan columnas obligatorias: categoria, unidad_medida. Agregalas y volvé a elegir el archivo.",
    );
    expect(
      screen.queryByRole("button", { name: /Confirmar carga/ }),
    ).not.toBeInTheDocument();
    expect(importarCatalogo).not.toHaveBeenCalled();
  });

  test("concuerda el aviso cuando falta una sola columna", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await elegir(
      usuario,
      archivoCsv("nombre,codigo_barras,categoria\nYerba,7790895000782,Almacén"),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Al archivo le falta una columna obligatoria: unidad_medida. Agregala y volvé a elegir el archivo.",
    );
  });

  test("deja volver a elegir el mismo archivo después de corregirlo", async () => {
    // Un input de archivo no dispara `change` dos veces con el mismo archivo si
    // no se le limpia el value. Sin eso, el "corregila y volvé a elegir el
    // archivo" que dice el aviso no funcionaría nunca.
    const usuario = userEvent.setup();
    renderizar();

    const roto = archivoCsv("nombre,codigo_barras\nYerba,7790895000782");
    await elegir(usuario, roto);
    await screen.findByRole("alert");

    // Mismo nombre de archivo, contenido corregido: es lo que devuelve Excel
    // después de agregar la columna y guardar.
    await elegir(usuario, archivoCsv());

    expect(
      await screen.findByRole("button", { name: /Confirmar carga/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("frena el archivo que pasa las 1000 filas sin subirlo", async () => {
    const usuario = userEvent.setup();
    const filas = Array.from(
      { length: 1001 },
      (_, i) => `Producto ${i},${1000000 + i},Almacén,unidad`,
    ).join("\n");
    renderizar();

    await elegir(
      usuario,
      archivoCsv(`nombre,codigo_barras,categoria,unidad_medida\n${filas}`),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El archivo tiene 1001 filas y el máximo es 1000",
    );
    expect(
      screen.queryByRole("button", { name: /Confirmar carga/ }),
    ).not.toBeInTheDocument();
    expect(importarCatalogo).not.toHaveBeenCalled();
  });

  test("un archivo de un solo producto no dice '1 productos'", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await elegir(
      usuario,
      archivoCsv(
        "nombre,codigo_barras,categoria,unidad_medida\nYerba,7790895000782,Almacén,unidad",
      ),
    );

    expect(
      await screen.findByRole("button", { name: "Confirmar carga de 1 producto" }),
    ).toBeInTheDocument();
  });

  test("rechaza otra extensión sin leer ni subir el archivo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await elegir(usuario, archivoCsv(CSV_VALIDO, "catalogo.xlsx"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/\.csv/);
    expect(importarCatalogo).not.toHaveBeenCalled();
  });
});

describe("respuesta del backend", () => {
  test("un 200 con filas rechazadas no se muestra como fallo", async () => {
    // Es el caso normal de la historia, no un error: si se mostrara en el
    // bloque rojo, el resumen de errores no aparecería nunca.
    const usuario = userEvent.setup();
    importarCatalogo.mockResolvedValue({
      ...REPORTE_LIMPIO,
      totalFilas: 5,
      procesadas: 5,
      importados: 3,
      fallidos: 2,
      errores: [
        { fila: 7, codigoBarras: "444444", motivo: "La unidad no es válida" },
        { fila: 9, codigoBarras: "555555", motivo: "El nombre es obligatorio" },
      ],
    });
    renderizar();

    await elegir(usuario, archivoCsv());
    await usuario.click(
      await screen.findByRole("button", { name: /Confirmar carga/ }),
    );

    expect(
      await screen.findByText("Se importaron 3 de 5 productos."),
    ).toBeInTheDocument();
    expect(screen.getByText("La unidad no es válida")).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo/)).not.toBeInTheDocument();
  });

  test("el 400 del archivo inválido se muestra como mensaje único, sin contadores", async () => {
    const usuario = userEvent.setup();
    const fallo = new Error(
      "Al archivo le faltan columnas obligatorias: unidad_medida",
    );
    fallo.status = 400;
    importarCatalogo.mockRejectedValue(fallo);
    renderizar();

    await elegir(usuario, archivoCsv());
    await usuario.click(
      await screen.findByRole("button", { name: /Confirmar carga/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Al archivo le faltan columnas obligatorias: unidad_medida",
    );
    // Acá no hay filas que listar: el archivo entero se rechazó.
    expect(screen.queryByText(/Se importaron/)).not.toBeInTheDocument();
  });

  test("después del 400 el archivo sigue elegido y se puede reintentar", async () => {
    const usuario = userEvent.setup();
    const fallo = new Error("El archivo CSV está vacío");
    fallo.status = 400;
    importarCatalogo.mockRejectedValueOnce(fallo);
    importarCatalogo.mockResolvedValueOnce(REPORTE_LIMPIO);
    renderizar();

    await elegir(usuario, archivoCsv());
    await usuario.click(
      await screen.findByRole("button", { name: /Confirmar carga/ }),
    );
    await screen.findByRole("alert");

    // Sin volver a pasar por el explorador de archivos.
    await usuario.click(
      screen.getByRole("button", { name: /Confirmar carga/ }),
    );

    expect(
      await screen.findByText("Se importaron 2 productos: el archivo entró completo."),
    ).toBeInTheDocument();
  });

  test("reintentar una importación interrumpida reusa el mismo archivo", async () => {
    const usuario = userEvent.setup();
    importarCatalogo.mockResolvedValueOnce({
      ...REPORTE_LIMPIO,
      totalFilas: 500,
      procesadas: 200,
      importados: 200,
      fallidos: 0,
      interrumpido: true,
      interrupcion: { fila: 202, motivo: "Se cortó, volvé a subir el archivo." },
    });
    importarCatalogo.mockResolvedValueOnce(REPORTE_LIMPIO);
    renderizar();

    await elegir(usuario, archivoCsv());
    await usuario.click(
      await screen.findByRole("button", { name: /Confirmar carga/ }),
    );

    await usuario.click(
      await screen.findByRole("button", {
        name: "Volver a subir el mismo archivo",
      }),
    );

    await waitFor(() => expect(importarCatalogo).toHaveBeenCalledTimes(2));
    // El mismo File de la primera vez, no uno nuevo.
    expect(importarCatalogo.mock.calls[1][0]).toBe(
      importarCatalogo.mock.calls[0][0],
    );
  });

  test("el botón se bloquea mientras sube, para no importar dos veces", async () => {
    const usuario = userEvent.setup();
    let resolver;
    importarCatalogo.mockReturnValue(
      new Promise((resuelve) => {
        resolver = resuelve;
      }),
    );
    renderizar();

    await elegir(usuario, archivoCsv());
    await usuario.click(
      await screen.findByRole("button", { name: /Confirmar carga/ }),
    );

    const boton = screen.getByRole("button", { name: "Importando…" });
    expect(boton).toBeDisabled();
    expect(screen.getByText(/puede tardar un momento/)).toBeInTheDocument();

    resolver(REPORTE_LIMPIO);
    await screen.findByText("Se importaron 2 productos: el archivo entró completo.");
  });
});

describe("permisos", () => {
  test("al empleado se le explica en vez de dejarlo chocar con un 403", async () => {
    obtenerConfiguracion.mockResolvedValue({ rol: "empleado" });
    renderizar();

    expect(
      await screen.findByText("Tu rol no puede importar productos"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Archivo CSV")).not.toBeInTheDocument();
  });

  test("si no se puede saber el rol, la pantalla se muestra igual", async () => {
    // El backend sigue siendo el que corta. Bloquear a alguien que sí podía
    // importar porque una request secundaria falló sería peor.
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));
    renderizar();

    expect(await screen.findByLabelText("Archivo CSV")).toBeInTheDocument();
  });
});
