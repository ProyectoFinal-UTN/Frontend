import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ResumenImportacion from "./ResumenImportacion";

/**
 * El endpoint responde 200 en los tres casos, así que lo único que los separa
 * es cómo se muestran. Estos tests afirman sobre el texto accesible y no sobre
 * las clases de color: el color solo no alcanza para distinguirlos —ni para
 * alguien que no lo ve— y una aserción sobre clases pasaría igual con el
 * mensaje equivocado.
 */

const MOTIVO_DE_CORTE =
  "La importación se cortó por un problema del sistema. Los productos ya " +
  "importados quedaron guardados: volvé a subir el mismo archivo para " +
  "continuar desde donde se cortó.";

function reporte(cambios = {}) {
  return {
    totalFilas: 3,
    procesadas: 3,
    importados: 3,
    fallidos: 0,
    productos: [
      { fila: 2, id: "p1", nombre: "Yerba", codigoBarras: "111111" },
      { fila: 3, id: "p2", nombre: "Fideos", codigoBarras: "222222" },
      { fila: 4, id: "p3", nombre: "Azúcar", codigoBarras: "333333" },
    ],
    errores: [],
    interrumpido: false,
    interrupcion: null,
    ...cambios,
  };
}

function renderizar(datos, props = {}) {
  return render(
    <MemoryRouter>
      <ResumenImportacion
        reporte={datos}
        alReintentar={props.alReintentar ?? vi.fn()}
        alImportarOtro={props.alImportarOtro ?? vi.fn()}
        subiendo={props.subiendo ?? false}
      />
    </MemoryRouter>,
  );
}

describe("estado completo", () => {
  test("dice que entraron todos y no ofrece nada para corregir", () => {
    renderizar(reporte());

    expect(
      screen.getByText("Se importaron los 3 productos del archivo."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/quedaron sin cargar/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Descargar los errores/ }),
    ).not.toBeInTheDocument();
  });
});

describe("estado con filas rechazadas", () => {
  const CON_ERRORES = reporte({
    totalFilas: 5,
    procesadas: 5,
    importados: 3,
    fallidos: 2,
    errores: [
      {
        fila: 7,
        codigoBarras: "444444",
        motivo: "La unidad de medida no es válida",
      },
      { fila: 9, codigoBarras: "", motivo: "El nombre es obligatorio" },
    ],
  });

  test("muestra cuántos entraron y encuadra el problema en el archivo", () => {
    renderizar(CON_ERRORES);

    expect(
      screen.getByText("Se importaron 3 de 5 productos."),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 filas quedaron sin cargar/)).toBeInTheDocument();
  });

  test("usa la fila real del archivo y el motivo del backend, sin reescribirlo", () => {
    renderizar(CON_ERRORES);

    expect(screen.getByText(/Fila 7/)).toBeInTheDocument();
    expect(
      screen.getByText("La unidad de medida no es válida"),
    ).toBeInTheDocument();
  });

  test("una fila sin código de barras se dice en palabras", () => {
    renderizar(CON_ERRORES);

    expect(screen.getByText("sin código de barras")).toBeInTheDocument();
  });

  test("corta la lista larga y la expande a pedido", () => {
    const muchos = Array.from({ length: 120 }, (_, i) => ({
      fila: i + 2,
      codigoBarras: `${i}`.padStart(6, "0"),
      motivo: `Motivo número ${i}`,
    }));

    renderizar(
      reporte({
        totalFilas: 120,
        procesadas: 120,
        importados: 0,
        fallidos: 120,
        productos: [],
        errores: muchos,
      }),
    );

    expect(screen.getByText("Motivo número 49")).toBeInTheDocument();
    expect(screen.queryByText("Motivo número 50")).not.toBeInTheDocument();

    return userEvent
      .click(screen.getByRole("button", { name: "Ver las 120 filas con error" }))
      .then(() => {
        expect(screen.getByText("Motivo número 119")).toBeInTheDocument();
      });
  });
});

describe("estado interrumpido", () => {
  const INTERRUMPIDO = reporte({
    totalFilas: 500,
    procesadas: 200,
    importados: 195,
    fallidos: 5,
    productos: [{ fila: 2, id: "p1", nombre: "Yerba", codigoBarras: "111111" }],
    errores: [
      { fila: 8, codigoBarras: "999999", motivo: "La categoría es obligatoria" },
    ],
    interrumpido: true,
    interrupcion: { fila: 202, motivo: MOTIVO_DE_CORTE },
  });

  test("aclara que el archivo no es el problema", () => {
    // Es la línea que evita que el usuario se vaya a corregir una planilla que
    // estaba bien. Va antes que cualquier número.
    renderizar(INTERRUMPIDO);

    expect(
      screen.getByText("No es un problema de tu archivo."),
    ).toBeInTheDocument();
  });

  test("el titular cuenta contra el total del archivo", () => {
    renderizar(INTERRUMPIDO);

    expect(
      screen.getByText("Se importaron 195 de 500 productos."),
    ).toBeInTheDocument();
  });

  test("el desglose cierra contra procesadas, no contra totalFilas", () => {
    // 195 + 5 = 200 procesadas; las otras 300 no se llegaron a mirar. Si el
    // desglose se leyera contra totalFilas, los números no darían.
    renderizar(INTERRUMPIDO);

    expect(
      screen.getByText(
        /Se alcanzaron a procesar 200 filas y 5 quedaron con error/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Las 300 filas que faltan no se procesaron/),
    ).toBeInTheDocument();
  });

  test("muestra el motivo del backend tal cual", () => {
    renderizar(INTERRUMPIDO);

    expect(screen.getByText(MOTIVO_DE_CORTE)).toBeInTheDocument();
  });

  test("la fila del corte se nombra aparte y no como una fila con error", () => {
    // `interrupcion.fila` no tiene nada malo: simplemente no se llegó a
    // procesar. Listarla entre los errores mandaría a corregir una fila sana.
    renderizar(INTERRUMPIDO);

    expect(screen.getByText(/Se cortó en la fila 202/)).toBeInTheDocument();

    const lista = screen.getByRole("list", {
      name: "Filas que no se cargaron",
    });
    expect(lista.textContent).not.toContain("Fila 202");
  });

  test("no se presenta como un archivo con errores de validación", () => {
    renderizar(INTERRUMPIDO);

    const encabezado = screen.getByRole("status");

    expect(encabezado.textContent).not.toMatch(/Corregilas en tu archivo/);
    expect(encabezado.textContent).not.toMatch(/quedaron sin cargar/);
  });

  test("ofrece reintentar con el mismo archivo, sin volver a elegirlo", () => {
    const alReintentar = vi.fn();
    renderizar(INTERRUMPIDO, { alReintentar });

    return userEvent
      .click(
        screen.getByRole("button", {
          name: "Volver a subir el mismo archivo",
        }),
      )
      .then(() => {
        expect(alReintentar).toHaveBeenCalledTimes(1);
      });
  });

  test("el botón de reintento se bloquea mientras sube", () => {
    renderizar(INTERRUMPIDO, { subiendo: true });

    expect(screen.getByRole("button", { name: "Importando…" })).toBeDisabled();
  });

  test("las filas con error se muestran subordinadas al corte", () => {
    // Existen y hay que verlas, pero lo primero que se tiene que entender es
    // que la carga no terminó.
    renderizar(INTERRUMPIDO);

    expect(screen.getByText(/Además, 5 filas tenían/)).toBeInTheDocument();
    expect(
      screen.getByText("La categoría es obligatoria"),
    ).toBeInTheDocument();
  });
});

describe("guarda de consistencia", () => {
  test("si el desglose no cierra, no se muestra una cuenta inventada", () => {
    renderizar(
      reporte({
        totalFilas: 500,
        procesadas: 200,
        importados: 100,
        fallidos: 5,
        interrumpido: true,
        interrupcion: { fila: 202, motivo: MOTIVO_DE_CORTE },
        errores: [],
      }),
    );

    expect(
      screen.queryByText(/Se alcanzaron a procesar/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(MOTIVO_DE_CORTE)).toBeInTheDocument();
  });
});
