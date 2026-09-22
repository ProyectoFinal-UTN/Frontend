import { Navigate, useLocation } from "react-router-dom";
import Bloqueado from "./Bloqueado";
import { useAuth } from "../hooks/useAuth";
import { usePermisos } from "../hooks/usePermisos";

/**
 * Deja pasar solo a quien tiene sesión y, si se le pide, el permiso.
 *
 * Mientras la sesión se está resolviendo no redirige: mandar al login a
 * alguien que sí está logueado, solo porque la respuesta todavía no llegó, se
 * ve como un parpadeo raro al recargar la página.
 *
 * Al redirigir guarda la ruta que se intentó abrir, para que después de entrar
 * vuelva ahí y no al inicio.
 *
 * Con `permiso` (HU-32) además chequea el rol, para el caso de quien escribe la
 * URL a mano:
 *
 *   <RutaProtegida permiso={{ producto: ["create"] }}>
 *
 * Muestra un cartel en vez de redirigir a propósito. Un redirect silencioso al
 * inicio se lee como un bug —hiciste clic y no pasó nada— mientras que el
 * cartel dice qué pasó. Es el mismo `Bloqueado` gris que usan las pantallas
 * cuando falta configurar algo: no es un error del sistema.
 *
 * Esto es refuerzo visual, no seguridad: el backend responde 403 igual. Por eso
 * ante la duda deja pasar (ver abajo).
 */
export default function RutaProtegida({ children, permiso, mensajeSinPermiso }) {
  const { autenticado, cargando } = useAuth();
  const { puede, resuelto, error } = usePermisos();
  const ubicacion = useLocation();

  if (cargando) {
    return <Esperando />;
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

  if (permiso) {
    const [recurso, acciones] = Object.entries(permiso)[0];

    // Todavía no se sabe qué puede: esperar. Sin esto, TODA navegación directa
    // a una ruta con permiso parpadearía el cartel de «no tenés permiso»
    // durante el primer render, incluso para el propietario.
    if (!resuelto) {
      return <Esperando />;
    }

    // No se pudo averiguar (se cayó la red, el endpoint falló): se deja pasar.
    // Acusar a alguien de no tener permiso porque una request secundaria falló
    // es mentirle, y encima le bloquea una pantalla que sí le corresponde. Si
    // de verdad no le toca, el backend se lo va a decir con un 403 —que es la
    // autoridad— y la pantalla lo va a mostrar. Misma política que ya tenía
    // `ImportarProductos` con su consulta del rol.
    if (error) {
      return children;
    }

    if (!acciones.some((accion) => puede(recurso, accion))) {
      return (
        <div className="mx-auto min-h-screen w-full max-w-md px-4 py-10">
          <Bloqueado
            testId="sin-permiso"
            // Cada ruta puede poner algo más útil que el genérico: decirle a
            // quién pedírselo es mejor que decirle solo que no puede.
            mensaje={
              mensajeSinPermiso ??
              "No tenés permiso para entrar acá. Si creés que es un error, pedíselo al propietario del comercio."
            }
            a="/"
            accion="Volver al inicio →"
          />
        </div>
      );
    }
  }

  return children;
}

function Esperando() {
  return (
    <div className="grid min-h-screen place-items-center">
      <p className="text-(--color-texto-apagado)">Cargando…</p>
    </div>
  );
}
