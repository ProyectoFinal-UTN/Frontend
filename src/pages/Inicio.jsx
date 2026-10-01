import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePermisos } from "../hooks/usePermisos";
import { cerrarSesion } from "../services/auth";

/**
 * Pantalla de inicio, por ahora mínima.
 *
 * Existe para poder verificar de punta a punta que el registro deja sesión
 * iniciada. El dashboard real (métricas, alertas, rotación) es de otras HU.
 *
 * Cada acceso se muestra solo si el rol puede usar la pantalla a la que lleva
 * (HU-32). Se OCULTA y no se deshabilita: acá no hay nada que la persona pueda
 * hacer para conseguir el permiso, así que un botón gris sería ruido que va a
 * ver todos los días. Deshabilitar se reserva para donde la acción sí existe y
 * falta una condición que se entiende o se cambia (el perfil, la moneda).
 */
export default function Inicio() {
  const { usuario } = useAuth();
  // Si la consulta de permisos falla se muestran todos: dejar esta pantalla
  // con dos botones convierte un problema de red en una app que parece rota, y
  // mostrar de más solo arriesga un 403 explicado. Mientras está en vuelo, en
  // cambio, se espera: ver aparecer un acceso y desaparecer es peor que verlo
  // llegar un instante después.
  const { puedeSalvoQueFalle: puede, resuelto } = usePermisos();
  const navegar = useNavigate();

  async function salir() {
    await cerrarSesion();
    // Al login: quien cierra sesión ya tiene cuenta, no necesita crear otra.
    navegar("/login", { replace: true });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-10">
      <h1 className="text-3xl font-extrabold text-(--color-texto)">
        Hola, {usuario?.name}
      </h1>
      <p className="mt-2 text-(--color-texto-apagado)">
        Tu cuenta ya está lista. El panel del negocio se agrega en las próximas
        historias.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {!resuelto && (
          <p className="text-(--color-texto-apagado)">Cargando accesos…</p>
        )}

        {/*
          Primera acción de la pantalla a propósito: registrar un movimiento es
          lo que más se hace en el día a día, y RNF1 pide llegar en ~3 pasos
          desde acá. Este link es el paso 1.
        */}
        {resuelto && puede("movimiento", "create") && (
          <Link
            to="/movimientos/nuevo"
            data-testid="acceso-registrar-movimiento"
            className="rounded-(--radius) bg-(--color-primario) px-4 py-3 text-center
                       font-bold text-(--color-primario-texto) transition hover:opacity-90"
          >
            Registrar movimiento
          </Link>
        )}

        {resuelto && puede("movimiento", "read") && (
          <Link
            to="/movimientos"
            data-testid="acceso-historial"
            className="rounded-(--radius) border-2 border-(--color-borde)
                       bg-(--color-tarjeta) px-4 py-3 text-center font-bold text-(--color-texto)
                       transition hover:border-(--color-primario)"
          >
            Historial de movimientos
          </Link>
        )}

        {resuelto && puede("transferencia", "create") && (
          <Link
            to="/transferencias"
            data-testid="acceso-transferir"
            className="rounded-(--radius) border-2 border-(--color-borde)
                       bg-(--color-tarjeta) px-4 py-3 text-center font-bold text-(--color-texto)
                       transition hover:border-(--color-primario)"
          >
            Transferir stock
          </Link>
        )}

        {resuelto && puede("producto", "read") && (
          <Link
            to="/productos"
            data-testid="acceso-productos"
            className="rounded-(--radius) bg-(--color-primario) px-4 py-3 text-center
                       font-bold text-(--color-primario-texto) transition hover:opacity-90"
          >
            Productos
          </Link>
        )}

        {/*
          El único acceso que el empleado pierde hoy. Lleva a una pantalla que
          consulta el código contra `producto:create`, así que dejárselo era
          mandarlo derecho a un 403 que no podía anticipar.
        */}
        {resuelto && puede("producto", "create") && (
          <Link
            to="/productos/escanear"
            data-testid="acceso-escanear"
            className="rounded-(--radius) border-2 border-(--color-borde)
                       bg-(--color-tarjeta) px-4 py-3 text-center font-bold text-(--color-texto)
                       transition hover:border-(--color-primario)"
          >
            Escanear producto
          </Link>
        )}

        {/*
          Sin condición: Configuración siempre tiene algo para todos. Aunque un
          empleado no vea Usuarios ni Auditoría, «Mis datos» (HU-31) es un
          derecho de los tres roles y vive ahí adentro.
        */}
        <Link
          to="/configuracion"
          data-testid="acceso-configuracion"
          className="rounded-(--radius) bg-(--color-primario) px-4 py-3 text-center
                     font-bold text-(--color-primario-texto) transition hover:opacity-90"
        >
          Configuración
        </Link>

        <button
          type="button"
          onClick={salir}
          className="rounded-(--radius) border-2 border-(--color-borde)
                     bg-(--color-tarjeta) px-4 py-3 font-bold text-(--color-texto)
                     transition hover:border-(--color-primario)"
        >
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
