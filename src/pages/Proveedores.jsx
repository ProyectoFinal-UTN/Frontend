import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SeccionProveedores from "../components/SeccionProveedores";
import { usePermisos } from "../hooks/usePermisos";
import { obtenerProveedores } from "../services/proveedores";

/**
 * Directorio de proveedores del comercio (HU-19).
 *
 * La pantalla trae la lista y maneja los tres estados de esa carga; el alta,
 * la edición y la baja viven en `SeccionProveedores`. Mismo reparto que
 * `Productos`.
 *
 * El empleado la ve entera como consulta (tiene `proveedor:read`, para saber a
 * quién llamar): lo único que no se le ofrece es cargar, editar y eliminar.
 */
export default function Proveedores() {
  const [proveedores, setProveedores] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  // Una recarga que dispara la sección puede volver con la pantalla ya
  // desmontada; el ref protege la carga inicial y las recargas por igual.
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const cargar = useCallback(
    () =>
      obtenerProveedores()
        .then((datos) => {
          if (!montado.current) return;
          setProveedores(datos);
          setError("");
        })
        .catch((fallo) => {
          if (montado.current) setError(fallo.message);
        })
        .finally(() => {
          if (montado.current) setCargando(false);
        }),
    [],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // "Salvo que falle", igual que en Productos: si la consulta de permisos se
  // cae, se ofrecen las acciones y el backend corta si no corresponde.
  const { puedeSalvoQueFalle, resuelto } = usePermisos();
  const puedeEditar = puedeSalvoQueFalle("proveedor", "create");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <header className="mb-6">
        <Link
          to="/"
          className="text-sm font-bold text-(--color-primario) underline"
        >
          ← Volver al inicio
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-(--color-texto)">
          Proveedores
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Tené a mano a quién le comprás: el contacto, el rubro y las
          condiciones de pago de cada uno.
        </p>

        {resuelto && !puedeEditar && (
          <p
            data-testid="proveedores-solo-lectura"
            className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3
                       text-sm text-(--color-texto-apagado)"
          >
            Tu rol puede consultar los proveedores, pero no modificarlos.
          </p>
        )}
      </header>

      {cargando && (
        <p className="text-(--color-texto-apagado)">Cargando proveedores…</p>
      )}

      {!cargando && error && (
        <div
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setCargando(true);
              cargar();
            }}
            className="mt-2 rounded-(--radius) bg-(--color-peligro)
                       px-3 py-2 text-sm font-bold text-(--color-peligro-texto)
                       transition focus:outline-none focus:ring-4
                       focus:ring-(--color-primario-suave)"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !error && proveedores && (
        <SeccionProveedores
          proveedores={proveedores}
          alRecargar={cargar}
          // Mientras los permisos viajan `puedeSalvoQueFalle` da false: los
          // botones llegan un instante después en vez de aparecer y
          // desaparecer.
          puedeEditar={puedeEditar}
        />
      )}
    </main>
  );
}
