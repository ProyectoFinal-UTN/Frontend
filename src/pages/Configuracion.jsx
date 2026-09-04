import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Pestanas from "../components/Pestanas";
import SeccionAuditoria from "../components/SeccionAuditoria";
import SeccionPerfil from "../components/SeccionPerfil";
import SeccionUbicaciones from "../components/SeccionUbicaciones";
import SeccionUsuarios from "../components/SeccionUsuarios";
import { useAuth } from "../hooks/useAuth";
import { obtenerConfiguracion } from "../services/configuracion";
import { obtenerPerfil } from "../services/comercio";

/**
 * Configuración del comercio.
 *
 * Las cuatro secciones del prototipo, ya completas: perfil (HU-6), ubicaciones
 * y moneda (HU-8), usuarios y roles (HU-4) y auditoría (HU-5).
 */

const SECCIONES = [
  { id: "perfil", etiqueta: "Perfil del comercio" },
  { id: "ubicaciones", etiqueta: "Ubicaciones y moneda" },
  { id: "usuarios", etiqueta: "Usuarios y roles" },
  { id: "auditoria", etiqueta: "Auditoría" },
];

const SECCION_POR_DEFECTO = "perfil";

export default function Configuracion() {
  const [parametros, setParametros] = useSearchParams();
  const { usuario } = useAuth();
  const [configuracion, setConfiguracion] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  // La pestaña vive en la URL, no en estado local: así el link se puede
  // compartir y sobrevive a un refresh.
  const pedida = parametros.get("seccion");
  const activa = SECCIONES.some((s) => s.id === pedida)
    ? pedida
    : SECCION_POR_DEFECTO;

  // La recarga que dispara la sección hija puede volver después de que la
  // pantalla se desmontó. El ref lo comparten la carga inicial y las recargas,
  // así los dos caminos se protegen igual.
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Devuelve la promesa en vez de usar async/await para que quede explícito
  // que ningún `setState` ocurre de forma síncrona dentro del efecto.
  // Las dos cargas van en paralelo: el perfil y la configuración son
  // endpoints distintos, y esperarlos en serie duplicaría la espera sin
  // ninguna razón.
  const cargar = useCallback(
    () =>
      Promise.all([obtenerConfiguracion(), obtenerPerfil()])
        .then(([datosConfiguracion, datosPerfil]) => {
          if (!montado.current) return;
          setConfiguracion(datosConfiguracion);
          setPerfil(datosPerfil);
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <header className="mb-6">
        <Link
          to="/"
          className="text-sm font-bold text-(--color-primario) underline"
        >
          ← Volver al inicio
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-(--color-texto)">
          Configuración
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Datos del comercio, usuarios con permisos y registro de accesos.
        </p>
      </header>

      <Pestanas
        items={SECCIONES}
        activa={activa}
        alCambiar={(id) => setParametros({ seccion: id })}
      />

      <div className="mt-8">
        {cargando && (
          <p className="text-(--color-texto-apagado)">Cargando datos…</p>
        )}

        {!cargando && error && (
          <p
            role="alert"
            className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                       text-sm font-semibold text-(--color-peligro)"
          >
            {error}
          </p>
        )}

        {!cargando && !error && configuracion && perfil && (
          <>
            {activa === "perfil" && (
              // `key` fuerza a montar de nuevo el formulario cuando llegan
              // datos distintos: si no, `useState` conserva lo que se tipeó
              // antes y la pantalla mostraría valores viejos.
              <SeccionPerfil
                key={perfil.nombre}
                perfil={perfil}
                alGuardar={cargar}
                puedeEditar={configuracion.rol === "propietario"}
              />
            )}

            {activa === "ubicaciones" && (
              // Las ubicaciones las administra también el gerente, porque son
              // parte de operar el negocio. La moneda no: eso es del
              // propietario. Los permisos reales están en el backend; acá solo
              // se evita ofrecer lo que va a terminar en un 403.
              <SeccionUbicaciones
                configuracion={configuracion}
                alRecargar={cargar}
                puedeEditarUbicaciones={configuracion.rol !== "empleado"}
                puedeEditarMoneda={configuracion.rol === "propietario"}
              />
            )}

            {activa === "usuarios" && (
              // El rol viene del backend, no del cliente: es lo que decide qué
              // controles se muestran. Igual cada endpoint valida por su
              // cuenta, así que esconderlos es UX y no seguridad.
              <SeccionUsuarios
                rol={configuracion.rol}
                usuarioId={usuario?.id}
              />
            )}

            {/*
              La auditoría no recibe el rol: solo la puede leer el propietario y
              eso lo decide el backend. Si otro rol entra, se muestra su 403.
            */}
            {activa === "auditoria" && <SeccionAuditoria />}
          </>
        )}
      </div>
    </main>
  );
}
