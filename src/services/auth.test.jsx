import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

/**
 * Regresión de la carrera entre el login y el store de sesión.
 *
 * Better Auth propaga el cambio de sesión con un `setTimeout(..., 10)` interno.
 * En ese hueco el store todavía dice que no hay sesión, así que si la pantalla
 * navegaba apenas respondía el login, `RutaProtegida` la rebotaba de vuelta al
 * formulario: había que apretar "Entrar" dos veces para pasar.
 *
 * El test comprueba lo que ve `RutaProtegida` en el instante justo después de
 * que el login resuelve, sin esperas de por medio: cualquier `waitFor` acá
 * taparía el bug, porque a los 10 ms el store se arregla solo.
 *
 * El cliente de Better Auth captura `fetch` al importarse, así que el stub
 * tiene que quedar puesto ANTES del import dinámico.
 */

const SESION = {
  session: { id: "s1", token: "t1", expiresAt: "2099-01-01T00:00:00.000Z" },
  user: { id: "u1", name: "ana", email: "ana@kiosco.com" },
};

function fetchSimulado(llamadas) {
  return vi.fn(async (url) => {
    llamadas.push(String(url));

    return new Response(JSON.stringify(SESION), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

/** Muestra lo mismo que decide `RutaProtegida`. */
function Sonda({ useAuth }) {
  const { autenticado } = useAuth();
  return <span data-testid="estado">{autenticado ? "adentro" : "afuera"}</span>;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("iniciarSesion", () => {
  test("apenas resuelve, la sesión ya es visible para las rutas protegidas", async () => {
    const llamadas = [];
    vi.stubGlobal("fetch", fetchSimulado(llamadas));

    const { iniciarSesion } = await import("./auth");
    const { useAuth } = await import("../hooks/useAuth");

    render(<Sonda useAuth={useAuth} />);
    expect(screen.getByTestId("estado")).toHaveTextContent("afuera");

    await act(async () => {
      await iniciarSesion({ correo: "ana@kiosco.com", password: "clave" });
    });

    // Sin `waitFor` a propósito: es el instante en que la pantalla navega.
    expect(screen.getByTestId("estado")).toHaveTextContent("adentro");
  });

  test("pide la sesión además del login, sin esperar al timer interno", async () => {
    const llamadas = [];
    vi.stubGlobal("fetch", fetchSimulado(llamadas));

    const { iniciarSesion } = await import("./auth");

    await iniciarSesion({ correo: "ana@kiosco.com", password: "clave" });

    expect(llamadas.some((r) => r.includes("sign-in"))).toBe(true);
    expect(llamadas.some((r) => r.includes("get-session"))).toBe(true);
  });

  test("traduce el error de credenciales invalidas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "INVALID_EMAIL_OR_PASSWORD" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const { iniciarSesion } = await import("./auth");

    const resultado = await iniciarSesion({
      correo: "ana@kiosco.com",
      password: "mala",
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/no son correctos/i);
  });
});

describe("registrar", () => {
  test("también refresca la sesión antes de devolver", async () => {
    // El registro deja la sesión iniciada, así que sufría la misma carrera.
    //
    // Acá se verifica la llamada y no el estado de la sonda a propósito: con la
    // sonda el test pasaba igual sin el arreglo, porque la ventana de 10 ms
    // alcanzaba a cerrarse sola durante el `act` y el resultado dependía del
    // timing de la máquina. Contar las llamadas es determinista.
    const llamadas = [];
    vi.stubGlobal("fetch", fetchSimulado(llamadas));

    const { registrar } = await import("./auth");

    await registrar({ correo: "ana@kiosco.com", password: "unaClaveSegura" });

    expect(llamadas.some((r) => r.includes("sign-up"))).toBe(true);
    expect(llamadas.some((r) => r.includes("get-session"))).toBe(true);
  });
});
