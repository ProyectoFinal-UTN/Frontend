import { describe, expect, test } from "vitest";
import {
  armarCsvDeErrores,
  armarPlantillaCsv,
  leerCsv,
  validarArchivo,
} from "./ImportarProductos.validacion";

/** Un `File` de mentira: solo se miran `name` y `size`. */
function archivoFalso(name, size) {
  return { name, size };
}

describe("validarArchivo", () => {
  test("acepta un .csv dentro del tamaño", () => {
    expect(validarArchivo(archivoFalso("catalogo.csv", 1024))).toEqual({
      valido: true,
      motivo: "",
    });
  });

  test("acepta la extensión en mayúsculas", () => {
    expect(validarArchivo(archivoFalso("CATALOGO.CSV", 10)).valido).toBe(true);
  });

  test("rechaza otra extensión", () => {
    const { valido, motivo } = validarArchivo(archivoFalso("catalogo.xlsx", 10));

    expect(valido).toBe(false);
    expect(motivo).toMatch(/\.csv/);
  });

  test("rechaza un archivo de más de 2 MB antes de subirlo", () => {
    const { valido, motivo } = validarArchivo(
      archivoFalso("catalogo.csv", 3 * 1024 * 1024),
    );

    expect(valido).toBe(false);
    expect(motivo).toContain("3.0 MB");
    expect(motivo).toContain("2 MB");
  });

  test("rechaza un archivo vacío", () => {
    expect(validarArchivo(archivoFalso("catalogo.csv", 0)).valido).toBe(false);
  });

  test("rechaza que no haya archivo", () => {
    expect(validarArchivo(null).valido).toBe(false);
  });
});

describe("leerCsv", () => {
  const ENCABEZADO = "nombre,codigo_barras,categoria,unidad_medida";

  test("lee las filas y no cuenta el encabezado como producto", () => {
    const { totalFilas, filas, encabezados } = leerCsv(
      `${ENCABEZADO}\nYerba,7790895000782,Almacén,unidad\nFideos,7790070410016,Almacén,paquete`,
    );

    expect(encabezados).toEqual([
      "nombre",
      "codigo_barras",
      "categoria",
      "unidad_medida",
    ]);
    expect(totalFilas).toBe(2);
    expect(filas[0].celdas[0]).toBe("Yerba");
  });

  test("numera las filas como el archivo, arrancando en 2", () => {
    // Es el número que el usuario ve en Excel y el que va a usar el backend
    // para señalar los errores. Si acá arrancara en 1, el "Fila 7" del resumen
    // mandaría a corregir la fila equivocada.
    const { filas } = leerCsv(
      `${ENCABEZADO}\nUno,111111,A,unidad\nDos,222222,A,unidad`,
    );

    expect(filas.map(({ fila }) => fila)).toEqual([2, 3]);
  });

  test("detecta el punto y coma que exporta Excel en español", () => {
    const { encabezados, filas } = leerCsv(
      "nombre;codigo_barras;categoria;unidad_medida\nYerba;7790895000782;Almacén;unidad",
    );

    expect(encabezados).toHaveLength(4);
    expect(filas[0].celdas[1]).toBe("7790895000782");
  });

  test("saca el BOM que antepone Excel al guardar como CSV UTF-8", () => {
    // Sin esto el BOM se pega a "nombre", el encabezado deja de matchear y el
    // archivo se rechazaría por una columna que está ahí.
    const { faltantes } = leerCsv(
      `\uFEFF${ENCABEZADO}\nYerba,7790895000782,Almacén,unidad`,
    );

    expect(faltantes).toEqual([]);
  });

  test("respeta el separador y el salto de línea dentro de comillas", () => {
    const { filas, totalFilas } = leerCsv(
      `${ENCABEZADO}\n"Fideos, tallarín","111111",Almacén,paquete`,
    );

    expect(totalFilas).toBe(1);
    expect(filas[0].celdas[0]).toBe("Fideos, tallarín");
    expect(filas[0].celdas[1]).toBe("111111");
  });

  test("una comilla escapada queda como comilla en el dato", () => {
    const { filas } = leerCsv(`${ENCABEZADO}\n"TV 32"" LED",111111,Hogar,unidad`);

    expect(filas[0].celdas[0]).toBe('TV 32" LED');
  });

  test("un campo multilínea corre el número de fila del registro siguiente", () => {
    const { filas } = leerCsv(
      `${ENCABEZADO}\n"Yerba\ncon palo",111111,Almacén,unidad\nFideos,222222,Almacén,paquete`,
    );

    // El primer registro ocupa las líneas 2 y 3, así que termina en la 3 y el
    // siguiente es la 4 — igual que `info.lines` del backend.
    expect(filas.map(({ fila }) => fila)).toEqual([3, 4]);
  });

  test("acepta encabezados con acentos, mayúsculas y camelCase", () => {
    const { faltantes } = leerCsv(
      "Nombre,Código de Barras,Categoría,unidadMedida\nYerba,111111,Almacén,unidad",
    );

    expect(faltantes).toEqual([]);
  });

  test("nombra las columnas obligatorias que faltan", () => {
    const { faltantes } = leerCsv(
      "nombre,codigo_barras\nYerba,7790895000782",
    );

    expect(faltantes).toEqual(["categoria", "unidad_medida"]);
  });

  test("una columna desconocida no invalida el archivo", () => {
    const { faltantes, encabezados } = leerCsv(
      `${ENCABEZADO},precio\nYerba,111111,Almacén,unidad,3500`,
    );

    expect(faltantes).toEqual([]);
    expect(encabezados).toContain("precio");
  });

  test("descarta las filas fantasma que deja Excel", () => {
    // Son líneas con solo separadores, de a decenas cuando alguien le dio
    // formato a celdas más abajo de los datos. Contarlas haría que un catálogo
    // de 1 producto se vea como 4 filas.
    const { totalFilas } = leerCsv(
      `${ENCABEZADO}\nYerba,111111,Almacén,unidad\n,,,\n,,,\n`,
    );

    expect(totalFilas).toBe(1);
  });

  test("avisa si el archivo está vacío", () => {
    expect(leerCsv("   ").error).toMatch(/vacío/);
  });

  test("avisa si solo hay encabezados", () => {
    expect(leerCsv(ENCABEZADO).error).toMatch(/ninguna fila de datos/);
  });

  test("corta la previa en maxFilas pero informa el total", () => {
    const filas = Array.from(
      { length: 25 },
      (_, i) => `Producto ${i},11111${i},Almacén,unidad`,
    ).join("\n");

    const previa = leerCsv(`${ENCABEZADO}\n${filas}`, { maxFilas: 10 });

    expect(previa.filas).toHaveLength(10);
    expect(previa.totalFilas).toBe(25);
  });
});

describe("armarPlantillaCsv", () => {
  test("trae las columnas obligatorias y se relee sin faltantes", () => {
    // La plantilla que se descarga tiene que pasar la misma validación que
    // cualquier otro archivo: si no, se estaría entregando un ejemplo roto.
    const { faltantes, totalFilas } = leerCsv(armarPlantillaCsv());

    expect(faltantes).toEqual([]);
    expect(totalFilas).toBe(2);
  });
});

describe("armarCsvDeErrores", () => {
  test("entrecomilla el motivo para que las comillas no desarmen el archivo", () => {
    const csv = armarCsvDeErrores([
      {
        fila: 7,
        codigoBarras: "111111",
        motivo: 'El código "111111" está repetido; ya venía en la fila 3',
      },
    ]);

    expect(csv.split("\r\n")[0]).toBe("fila;codigo_barras;motivo");
    expect(csv).toContain(
      '"7";"111111";"El código ""111111"" está repetido; ya venía en la fila 3"',
    );
  });

  test("una fila sin código de barras no rompe el CSV", () => {
    const csv = armarCsvDeErrores([
      { fila: 4, codigoBarras: "", motivo: "Falta el nombre" },
    ]);

    expect(csv).toContain('"4";"";"Falta el nombre"');
  });
});
