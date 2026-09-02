import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Pestanas from "../components/Pestanas";
import SeccionUbicaciones from "../components/SeccionUbicaciones";
import { obtenerConfiguracion } from "../services/configuracion";

/**
 * Configuración del comercio.
 *
 * El armazón con las cuatro secciones queda armado acá aunque solo una esté
 * construida: así quien tome HU-4, HU-5 o HU-6 rellena su pestaña en vez de
 * rehacer la pantalla.
 */

const SECCIONES = [
  { id: "perfil", etiqueta: "Perfil del comercio", hu: "HU-6" },
  { id: "ubicaciones", etiqueta: "Ubicaciones y moneda", hu: null },
  { id: "usuarios", etiqueta: "Usuarios y roles", hu: "HU-4" },
  { id: "auditoria", etiqueta: "Auditoría", hu: "HU-5" },
];

const SECCION_POR_DEFECTO = "ubicaciones";

function Pendiente({ etiqueta, hu }) {
  return (
    <div className="rounded-(--radius) bg-(--color-apagado) px-4 py-8 text-center">
      <p className="font-bold text-(--color-texto)">{etiqueta}</p>
      <p className="mt-1 text-sm text-(--color-texto-apagado)">
        Esta sección se construye en {hu}.
      </p>
    </div>
  );
}

export default function Configuracion() {
  const [parametros, setParametros] = useSearchParams();
  const [configuracion, setConfiguracion] = useState(null);
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
  const cargar = useCallback(
    () =>
      obtenerConfiguracion()
        .then((datos) => {
          if (!montado.current) return;
          setConfiguracion(datos);
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

  const seccion = SECCIONES.find((s) => s.id === activa);

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

        {!cargando && !error && configuracion && (
          <>
            {activa === "ubicaciones" ? (
              <SeccionUbicaciones
                configuracion={configuracion}
                alRecargar={cargar}
              />
            ) : (
              <Pendiente etiqueta={seccion.etiqueta} hu={seccion.hu} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
