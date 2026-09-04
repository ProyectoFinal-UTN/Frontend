import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { cerrarSesion } from "../services/auth";

/**
 * Pantalla de inicio, por ahora mínima.
 *
 * Existe para poder verificar de punta a punta que el registro deja sesión
 * iniciada. El dashboard real (métricas, alertas, rotación) es de otras HU.
 */
export default function Inicio() {
  const { usuario } = useAuth();
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
        {/*
          Primera acción de la pantalla a propósito: registrar un movimiento es
          lo que más se hace en el día a día, y RNF1 pide llegar en ~3 pasos
          desde acá. Este link es el paso 1.
        */}
        <Link
          to="/movimientos/nuevo"
          className="rounded-(--radius) bg-(--color-primario) px-4 py-3 text-center
                     font-bold text-(--color-primario-texto) transition hover:opacity-90"
        >
          Registrar movimiento
        </Link>

        <Link
          to="/productos"
          className="rounded-(--radius) bg-(--color-primario) px-4 py-3 text-center
                     font-bold text-(--color-primario-texto) transition hover:opacity-90"
        >
          Productos
        </Link>

        <Link
          to="/productos/escanear"
          className="rounded-(--radius) border-2 border-(--color-borde)
                     bg-(--color-tarjeta) px-4 py-3 text-center font-bold text-(--color-texto)
                     transition hover:border-(--color-primario)"
        >
          Escanear producto
        </Link>

        <Link
          to="/configuracion"
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
