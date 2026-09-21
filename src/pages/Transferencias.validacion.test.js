import { describe, expect, test } from "vitest";
import {
  formatearCantidad,
  validarTransferencia,
} from "./Transferencias.validacion";

/** Un formulario completo y válido contra un origen con 12 disponibles. */
const VALIDO = {
  productoId: "p1",
  ubicacionOrigenId: "u1",
  ubicacionDestinoId: "u2",
  cantidad: "5",
  motivo: "",
};

const CONTEXTO = { disponible: 12, unidad: "unidad", nombreOrigen: "Depósito" };

describe("validarTransferencia", () => {
  test("un formulario completo no tiene errores", () => {
    expect(validarTransferencia(VALIDO, CONTEXTO)).toEqual({});
  });

  test("un formulario vacío marca producto, origen, destino y cantidad", () => {
    expect(
      validarTransferencia(
        { productoId: "", ubicacionOrigenId: "", ubicacionDestinoId: "", cantidad: "", motivo: "" },
        CONTEXTO,
      ),
    ).toEqual({
      productoId: "Elegí el producto.",
      ubicacionOrigenId: "Elegí de dónde sale.",
      ubicacionDestinoId: "Elegí a dónde va.",
      cantidad: "Ingresá cuántas unidades.",
    });
  });

  test("rechaza origen y destino iguales", () => {
    expect(
      validarTransferencia({ ...VALIDO, ubicacionDestinoId: "u1" }, CONTEXTO),
    ).toEqual({
      ubicacionDestinoId: "El destino tiene que ser distinto del origen.",
    });
  });

  test.each([
    ["0", "Tiene que ser al menos 1."],
    ["2.5", "Tiene que ser un número entero, sin decimales ni signos."],
    ["-3", "Tiene que ser un número entero, sin decimales ni signos."],
    ["2147483648", "No puede superar 2147483647."],
  ])("cantidad %s → %s", (cantidad, mensaje) => {
    expect(validarTransferencia({ ...VALIDO, cantidad }, CONTEXTO)).toEqual({
      cantidad: mensaje,
    });
  });

  describe("tope por stock en el origen", () => {
    test("exactamente lo disponible pasa", () => {
      expect(validarTransferencia({ ...VALIDO, cantidad: "12" }, CONTEXTO)).toEqual({});
    });

    test("una unidad más que lo disponible se bloquea con el disponible y el origen", () => {
      expect(validarTransferencia({ ...VALIDO, cantidad: "13" }, CONTEXTO)).toEqual({
        cantidad: "Hay 12 unidades disponibles en Depósito. No podés transferir más.",
      });
    });

    test("usa la unidad del producto en el mensaje", () => {
      expect(
        validarTransferencia(
          { ...VALIDO, cantidad: "4" },
          { disponible: 3, unidad: "kg", nombreOrigen: "Depósito" },
        ),
      ).toEqual({
        cantidad: "Hay 3 kg disponibles en Depósito. No podés transferir más.",
      });
    });

    test("con 1 disponible el mensaje va en singular", () => {
      expect(
        validarTransferencia({ ...VALIDO, cantidad: "2" }, { ...CONTEXTO, disponible: 1 }),
      ).toEqual({
        cantidad: "Hay 1 unidad disponible en Depósito. No podés transferir más.",
      });
    });

    test("sin stock en el origen pide elegir otro", () => {
      expect(
        validarTransferencia({ ...VALIDO, cantidad: "1" }, { ...CONTEXTO, disponible: 0 }),
      ).toEqual({
        cantidad: "No hay stock en Depósito. Elegí otro origen.",
      });
    });

    test("sin el nombre del origen dice «en el origen»", () => {
      expect(
        validarTransferencia({ ...VALIDO, cantidad: "13" }, { disponible: 12 }),
      ).toEqual({
        cantidad: "Hay 12 unidades disponibles en el origen. No podés transferir más.",
      });
    });

    test("si todavía no se conoce el disponible, no deja enviar", () => {
      expect(
        validarTransferencia(VALIDO, { ...CONTEXTO, disponible: null }),
      ).toEqual({
        cantidad:
          "Todavía no sabemos cuánto hay en el origen. Consultá el stock de nuevo.",
      });
    });

    test("sin origen elegido el error va en el origen, no en la cantidad", () => {
      expect(
        validarTransferencia({ ...VALIDO, ubicacionOrigenId: "" }, { disponible: null }),
      ).toEqual({
        ubicacionOrigenId: "Elegí de dónde sale.",
      });
    });

    test("una cantidad inválida muestra su propio error antes que el tope", () => {
      expect(
        validarTransferencia({ ...VALIDO, cantidad: "0" }, { ...CONTEXTO, disponible: 0 }),
      ).toEqual({ cantidad: "Tiene que ser al menos 1." });
    });
  });

  describe("motivo (opcional)", () => {
    test("vacío o en blanco pasa", () => {
      expect(validarTransferencia({ ...VALIDO, motivo: "   " }, CONTEXTO)).toEqual({});
    });

    test("255 caracteres pasa", () => {
      expect(
        validarTransferencia({ ...VALIDO, motivo: "a".repeat(255) }, CONTEXTO),
      ).toEqual({});
    });

    test("256 caracteres falla", () => {
      expect(
        validarTransferencia({ ...VALIDO, motivo: "a".repeat(256) }, CONTEXTO),
      ).toEqual({ motivo: "No puede superar 255 caracteres." });
    });

    test("los espacios de los bordes no cuentan, igual que en el backend", () => {
      expect(
        validarTransferencia({ ...VALIDO, motivo: ` ${"a".repeat(255)} ` }, CONTEXTO),
      ).toEqual({});
    });
  });
});

describe("formatearCantidad", () => {
  test.each([
    [1, "unidad", "1 unidad"],
    [12, "unidad", "12 unidades"],
    [0, "unidad", "0 unidades"],
    [3, "kg", "3 kg"],
    [5, undefined, "5 unidades"],
    [5, null, "5 unidades"],
  ])("%s %s → %s", (cantidad, unidad, esperado) => {
    expect(formatearCantidad(cantidad, unidad)).toBe(esperado);
  });
});
