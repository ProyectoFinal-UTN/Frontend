import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Deja pasar solo a quien tiene sesión.
 *
 * Mientras la sesión se está resolviendo no redirige: mandar al login a
 * alguien que sí está logueado, solo porque la respuesta todavía no llegó, se
 * ve como un parpadeo raro al recargar la página.
 *
 * Al redirigir guarda la ruta que se intentó abrir, para que después de entrar
 * vuelva ahí y no al inicio.
 */
export default function RutaProtegida({ children }) {
  const { autenticado, cargando } = useAuth();
  const ubicacion = useLocation();

  if (cargando) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-(--color-texto-apagado)">Cargando…</p>
      </div>
    );
  }

  if (!autenticado) {
    // Al login y no al registro: quien llega a una pantalla protegida casi
    // siempre ya tiene cuenta y lo que le falta es entrar.
    return (
      <Navigate
        to="/login"
        replace
        state={{ desde: ubicacion.pathname + ubicacion.search }}
      />
    );
  }

  return children;
}
