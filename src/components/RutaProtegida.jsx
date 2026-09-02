import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Deja pasar solo a quien tiene sesión.
 *
 * Mientras la sesión se está resolviendo no redirige: mandar al login a
 * alguien que sí está logueado, solo porque la respuesta todavía no llegó, se
 * ve como un parpadeo raro al recargar la página.
 */
export default function RutaProtegida({ children }) {
  const { autenticado, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-(--color-texto-apagado)">Cargando…</p>
      </div>
    );
  }

  if (!autenticado) {
    return <Navigate to="/registro" replace />;
  }

  return children;
}
