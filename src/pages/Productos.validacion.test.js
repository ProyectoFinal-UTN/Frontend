import { describe, expect, test } from "vitest";
import {
  LARGO_MAXIMO_CATEGORIA,
  LARGO_MAXIMO_NOMBRE,
  MAXIMO_ENTERO,
  validarProducto,
} from "./Productos.validacion";

/** Un producto válido; cada test rompe solo el campo que le interesa. */
const VALIDO = {
  codigoBarras: "7790895000782",
  nombre: "Coca-Cola 500ml",
  categoria: "Bebidas",
  unidadMedida: "unidad",
  umbralMinimo: "5",
  stockActual: "20",
};

describe("validarProducto", () => {
  test("no encuentra errores en un producto valido", () => {
    expect(validarProducto(VALIDO)).toEqual({});
  });

  describe("codigo de barras", () => {
    test("lo exige", () => {
      const errores = validarProducto({ ...VALIDO, codigoBarras: "   " });
      expect(errores.codigoBarras).toBe("Ingresá el código de barras.");
    });

    test("rechaza menos de 6 digitos", () => {
      const errores = validarProducto({ ...VALIDO, codigoBarras: "12345" });
      expect(errores.codigoBarras).toMatch(/6 a 64 dígitos/);
    });

    test("rechaza letras", () => {
      const errores = validarProducto({ ...VALIDO, codigoBarras: "77908A5" });
      expect(errores.codigoBarras).toMatch(/6 a 64 dígitos/);
    });

    test("acepta un codigo con espacios alrededor", () => {
      const errores = validarProducto({
        ...VALIDO,
        codigoBarras: "  7790895000782  ",
      });
      expect(errores.codigoBarras).toBeUndefined();
    });
  });

  describe("nombre y categoria", () => {
    test("los exige", () => {
      const errores = validarProducto({
        ...VALIDO,
        nombre: "  ",
        categoria: "",
      });
      expect(errores.nombre).toBe("Ingresá el nombre del producto.");
      expect(errores.categoria).toBe("Ingresá una categoría.");
    });

    test("respeta los largos maximos del backend", () => {
      const errores = validarProducto({
        ...VALIDO,
        nombre: "a".repeat(LARGO_MAXIMO_NOMBRE + 1),
        categoria: "b".repeat(LARGO_MAXIMO_CATEGORIA + 1),
      });
      expect(errores.nombre).toMatch(String(LARGO_MAXIMO_NOMBRE));
      expect(errores.categoria).toMatch(String(LARGO_MAXIMO_CATEGORIA));
    });
  });

  describe("unidad de medida", () => {
    test("rechaza una unidad que el backend no acepta", () => {
      const errores = validarProducto({ ...VALIDO, unidadMedida: "bidones" });
      expect(errores.unidadMedida).toBe("Elegí una unidad de medida.");
    });
  });

  describe("umbral minimo y stock inicial", () => {
    test("los exige", () => {
      const errores = validarProducto({
        ...VALIDO,
        umbralMinimo: "",
        stockActual: "",
      });
      expect(errores.umbralMinimo).toBe("Ingresá un número.");
      expect(errores.stockActual).toBe("Ingresá un número.");
    });

    test("acepta el cero", () => {
      const errores = validarProducto({
        ...VALIDO,
        umbralMinimo: "0",
        stockActual: "0",
      });
      expect(errores.umbralMinimo).toBeUndefined();
      expect(errores.stockActual).toBeUndefined();
    });

    test("rechaza negativos y decimales", () => {
      expect(
        validarProducto({ ...VALIDO, umbralMinimo: "-1" }).umbralMinimo,
      ).toMatch(/entero/);
      expect(
        validarProducto({ ...VALIDO, umbralMinimo: "1.5" }).umbralMinimo,
      ).toMatch(/entero/);
    });

    test("rechaza notacion cientifica, que Number() aceptaria y el backend no", () => {
      const errores = validarProducto({ ...VALIDO, umbralMinimo: "1e3" });
      expect(errores.umbralMinimo).toMatch(/entero/);
    });

    test("rechaza pasarse del maximo de un integer de Postgres", () => {
      const errores = validarProducto({
        ...VALIDO,
        umbralMinimo: String(MAXIMO_ENTERO + 1),
      });
      expect(errores.umbralMinimo).toMatch(String(MAXIMO_ENTERO));
    });
  });

  describe("modo edicion", () => {
    test("no pide stock inicial, porque el PUT no lo acepta", () => {
      const errores = validarProducto(
        { ...VALIDO, stockActual: "" },
        { esEdicion: true },
      );
      expect(errores.stockActual).toBeUndefined();
      expect(errores).toEqual({});
    });

    test("sigue validando el resto de los campos", () => {
      const errores = validarProducto(
        { ...VALIDO, nombre: "" },
        { esEdicion: true },
      );
      expect(errores.nombre).toBe("Ingresá el nombre del producto.");
    });
  });
});
