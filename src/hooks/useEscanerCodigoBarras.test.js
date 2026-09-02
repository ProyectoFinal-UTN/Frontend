import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useEscanerCodigoBarras } from "./useEscanerCodigoBarras";

vi.mock("@zxing/browser", () => ({
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4 },
  BrowserMultiFormatReader: vi.fn(),
}));

vi.mock("@zxing/library", () => ({
  DecodeHintType: { POSSIBLE_FORMATS: "POSSIBLE_FORMATS" },
}));

function setContextoSeguro(valor) {
  Object.defineProperty(window, "isSecureContext", {
    value: valor,
    configurable: true,
  });
}

describe("useEscanerCodigoBarras", () => {
  beforeEach(() => {
    BrowserMultiFormatReader.mockReset();
    setContextoSeguro(true);
  });

  test("detecta un codigo y expone estado 'detectado'", async () => {
    let callbackCapturado;
    const stop = vi.fn();
    BrowserMultiFormatReader.mockImplementation(function () {
      return {
        decodeFromConstraints: vi.fn((constraints, video, callback) => {
          callbackCapturado = callback;
          return Promise.resolve({ stop });
        }),
      };
    });

    const { result } = renderHook(() => useEscanerCodigoBarras());

    await act(async () => {
      await result.current.iniciar();
    });

    expect(result.current.estado).toBe("escaneando");

    act(() => {
      callbackCapturado({ getText: () => "7791234567890" });
    });

    expect(result.current.estado).toBe("detectado");
    expect(result.current.codigo).toBe("7791234567890");
    expect(stop).toHaveBeenCalled();
  });

  test("permiso de camara denegado -> estado error / permiso-denegado", async () => {
    BrowserMultiFormatReader.mockImplementation(function () {
      return {
        decodeFromConstraints: vi.fn(() => {
          const error = new Error("denied");
          error.name = "NotAllowedError";
          return Promise.reject(error);
        }),
      };
    });

    const { result } = renderHook(() => useEscanerCodigoBarras());

    await act(async () => {
      await result.current.iniciar();
    });

    expect(result.current.estado).toBe("error");
    expect(result.current.error).toBe("permiso-denegado");
  });

  test("sin camara disponible -> estado error / sin-camara", async () => {
    BrowserMultiFormatReader.mockImplementation(function () {
      return {
        decodeFromConstraints: vi.fn(() => {
          const error = new Error("not found");
          error.name = "NotFoundError";
          return Promise.reject(error);
        }),
      };
    });

    const { result } = renderHook(() => useEscanerCodigoBarras());

    await act(async () => {
      await result.current.iniciar();
    });

    expect(result.current.estado).toBe("error");
    expect(result.current.error).toBe("sin-camara");
  });

  test("contexto inseguro (sin HTTPS) -> no intenta acceder a la camara", async () => {
    setContextoSeguro(false);

    const { result } = renderHook(() => useEscanerCodigoBarras());

    await act(async () => {
      await result.current.iniciar();
    });

    expect(result.current.estado).toBe("error");
    expect(result.current.error).toBe("contexto-inseguro");
    expect(BrowserMultiFormatReader).not.toHaveBeenCalled();
  });
});
