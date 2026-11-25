import { describe, expect, test } from "vitest";
import { diaLocal, validarReporte, valoresIniciales } from "./TarjetaReportePdf.validacion";

const VALIDO = {
  tipo: "periodo",
  desde: "2026-09-01",
  hasta: "2026-09-30",
  productoId: "",
  proveedorId: "",
};

describe("valoresIniciales", () => {
  test("por período, del primer día del mes a hoy", () => {
    expect(valoresIniciales(new Date(2026, 10, 18, 15, 30))).toEqual({
      tipo: "periodo",
      desde: "2026-11-01",
      hasta: "2026-11-18",
      productoId: "",
      proveedorId: "",
    });
  });

  test("el primer día del mes: desde y hasta coinciden", () => {
    const { desde, hasta } = valoresIniciales(new Date(2026, 0, 1, 9));
    expect(desde).toBe("2026-01-01");
    expect(hasta).toBe("2026-01-01");
  });
});

test("diaLocal usa la fecha local, no la UTC", () => {
  // A las 23:30 del 18 ya puede ser el 19 en UTC; el día tiene que ser el 18.
  expect(diaLocal(new Date(2026, 10, 18, 23, 30))).toBe("2026-11-18");
});

describe("validarReporte", () => {
  test("todo completo: sin errores", () => {
    expect(validarReporte(VALIDO)).toEqual({});
  });

  test("fechas vacías", () => {
    expect(validarReporte({ ...VALIDO, desde: "", hasta: "" })).toEqual({
      desde: "Elegí desde qué día querés el reporte.",
      hasta: "Elegí hasta qué día querés el reporte.",
    });
  });

  test("desde posterior a hasta", () => {
    expect(
      validarReporte({ ...VALIDO, desde: "2026-10-01", hasta: "2026-09-30" }),
    ).toEqual({ desde: "La fecha «Desde» no puede ser posterior a «Hasta»." });
  });

  test("el mismo día en las dos fechas es válido", () => {
    expect(
      validarReporte({ ...VALIDO, desde: "2026-09-30", hasta: "2026-09-30" }),
    ).toEqual({});
  });

  test("por producto sin producto", () => {
    expect(validarReporte({ ...VALIDO, tipo: "producto" })).toEqual({
      productoId: "Elegí de qué producto querés el reporte.",
    });
  });

  test("por proveedor sin proveedor", () => {
    expect(validarReporte({ ...VALIDO, tipo: "proveedor" })).toEqual({
      proveedorId: "Elegí de qué proveedor querés el reporte.",
    });
  });

  test("por período no pide producto ni proveedor", () => {
    expect(validarReporte({ ...VALIDO, tipo: "periodo" })).toEqual({});
  });
});
