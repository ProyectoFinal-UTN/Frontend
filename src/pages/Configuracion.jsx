import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Pestanas from "../components/Pestanas";
import SeccionAuditoria from "../components/SeccionAuditoria";
import SeccionMiCuenta from "../components/SeccionMiCuenta";
import SeccionPerfil from "../components/SeccionPerfil";
import SeccionUbicaciones from "../components/SeccionUbicaciones";
import SeccionUsuarios from "../components/SeccionUsuarios";
import { useAuth } from "../hooks/useAuth";
import { usePermisos } from "../hooks/usePermisos";
import { obtenerPerfil } from "../services/comercio";

/**
 * Configuración del comercio.
 *
 * Las cuatro secciones del prototipo, ya completas: perfil (HU-6), ubicaciones
 * y moneda (HU-8), usuarios y roles (HU-4) y auditoría (HU-5).
 *
 * "Mis datos" (HU-31) es una quinta que el prototipo no tenía. Va última y
 * separada de las otras a propósito: las cuatro primeras son del comercio y
 * dependen del rol, y esa es de la persona —los mismos derechos para todos,
 * incluido el empleado—.
 *
 * Las pestañas que el rol no puede usar no se muestran (HU-32). Se ocultan y no
 * se deshabilitan: una pestaña gris le anuncia al empleado que existe una
 * sección con la lista del equipo, y HU-4 pide exactamente lo contrario —que ni
 * siquiera sepa que puede mirarse—.
 */

/**
 * `requiere` es el permiso que hace falta para ver la pestaña; sin él, la ve
 * cualquiera con sesión. Perfil y Ubicaciones se muestran siempre porque los
 * tres roles pueden al menos leerlas, aunque no todos puedan editarlas.
 */
const SECCIONES = [
  { id: "perfil", etiqueta: "Perfil del comercio" },
  { id: "ubicaciones", etiqueta: "Ubicaciones y moneda" },
  {
    id: "usuarios",
    etiqueta: "Usuarios y roles",
    // `member:read` y no "es propietario": el gerente también la ve, en modo
    // lectura, porque necesita saber quién registró cada movimiento.
    requiere: ["member", "read"],
  },
  { id: "auditoria", etiqueta: "Auditoría", requiere: ["auditoria", "read"] },
  { id: "mis-datos", etiqueta: "Mis datos" },
];

const SECCION_POR_DEFECTO = "perfil";

export default function Configuracion() {
  const [parametros, setParametros] = useSearchParams();
  const { usuario } = useAuth();
  const {
    puede,
    seSabe,
    resuelto,
    configuracion,
    refrescar,
    error: errorDePermisos,
  } = usePermisos();
  const [perfil, setPerfil] = useState(null);
  const [errorDelPerfil, setErrorDelPerfil] = useState("");
  const [cargandoPerfil, setCargandoPerfil] = useState(true);

  // Las dos cargas son independientes y cualquiera de las dos que falle deja la
  // pantalla sin poder mostrarse: se muestra la primera que haya fallado.
  const error = errorDelPerfil || errorDePermisos?.message || "";

  // Las dos, no solo el perfil. Antes de esto, cuando el perfil ganaba la
  // carrera contra `GET /api/configuracion` el panel quedaba en blanco: sin
  // "Cargando…", sin error y sin sección, porque el render de abajo exige
  // `configuracion` y ya nadie decía que faltaba algo.
  const cargando = cargandoPerfil || !resuelto;

  // Mientras no se sepa qué puede el rol —o si averiguarlo falló— se muestran
  // todas. Esconder por las dudas le sacaría pestañas a quien sí podía usarlas
  // por una request caída; de todos modos cada sección pide sus datos y el
  // backend responde 403 si de verdad no corresponde.
  const visibles = seSabe
    ? SECCIONES.filter(({ requiere }) => !requiere || puede(...requiere))
    : SECCIONES;

  // La pestaña vive en la URL, no en estado local: así el link se puede
  // compartir y sobrevive a un refresh.
  //
  // Se resuelve contra las pestañas VISIBLES, así que un `?seccion=auditoria`
  // escrito a mano por quien no puede leerla cae en Perfil.
  const pedida = parametros.get("seccion");
  const activa = visibles.some((s) => s.id === pedida)
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
  //
  // Solo el perfil: la configuración del comercio la trae el store de permisos,
  // que ya la pidió una vez para toda la app. Antes esta pantalla la pedía por
  // su cuenta y era una de las tres requests duplicadas al mismo endpoint.
  const cargarPerfil = useCallback(
    () =>
      obtenerPerfil()
        .then((datosPerfil) => {
          if (!montado.current) return;
          setPerfil(datosPerfil);
          setErrorDelPerfil("");
        })
        .catch((fallo) => {
          if (montado.current) setErrorDelPerfil(fallo.message);
        })
        .finally(() => {
          if (montado.current) setCargandoPerfil(false);
        }),
    [],
  );

  useEffect(() => {
    cargarPerfil();
  }, [cargarPerfil]);

  /**
   * Lo que llaman las secciones hijas después de guardar algo.
   *
   * Las dos van en paralelo: son endpoints distintos y esperarlos en serie
   * duplicaría la espera. Se refresca también la configuración porque las
   * ubicaciones viajan en esa respuesta: crear una tiene que verse acá.
   */
  const cargar = useCallback(
    () => Promise.all([refrescar(), cargarPerfil()]),
    [refrescar, cargarPerfil],
  );

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
          Datos del comercio, usuarios con permisos, registro de accesos y tus
          datos personales.
        </p>
      </header>

      <Pestanas
        items={visibles}
        activa={activa}
        alCambiar={(id) => setParametros({ seccion: id })}
      />

      <div className="mt-8">
        {/*
          "Mis datos" se renderiza aparte del resto, fuera de la carga del
          comercio. No necesita ni la configuración ni el perfil, y si esa
          carga falla igual tiene que poder abrirse: sería absurdo que un error
          leyendo el negocio le impidiera a alguien ejercer un derecho que la
          ley le da sobre sus propios datos.
        */}
        {activa === "mis-datos" && <SeccionMiCuenta />}

        {activa !== "mis-datos" && cargando && (
          <p className="text-(--color-texto-apagado)">Cargando datos…</p>
        )}

        {activa !== "mis-datos" && !cargando && error && (
          <p
            role="alert"
            className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                       text-sm font-semibold text-(--color-peligro)"
          >
            {error}
          </p>
        )}

        {activa !== "mis-datos" && !cargando && !error && configuracion && perfil && (
          <>
            {activa === "perfil" && (
              // Sin `key`, a propósito. Antes había uno atado a `perfil.nombre`
              // para forzar el remonte cuando llegaban datos distintos, pero el
              // único momento en que eso pasa es después de guardar, y ahí el
              // remonte ocurría en medio del `await` y se llevaba puesto el
              // aviso de "Datos guardados": cambiar el nombre del negocio
              // guardaba bien y no mostraba ninguna confirmación. Ahora el
              // propio formulario refleja lo que guardó (ver SeccionPerfil), que
              // era lo que el `key` venía a resolver.
              <SeccionPerfil
                perfil={perfil}
                alGuardar={cargar}
                puedeEditar={puede("comercio", "update")}
              />
            )}

            {activa === "ubicaciones" && (
              // Las ubicaciones las administra también el gerente, porque son
              // parte de operar el negocio. La moneda no: eso es del
              // propietario, y por eso cuelga de `comercio:update`. Los
              // permisos reales están en el backend; acá solo se evita ofrecer
              // lo que va a terminar en un 403.
              <SeccionUbicaciones
                configuracion={configuracion}
                alRecargar={cargar}
                puedeEditarUbicaciones={puede("ubicacion", "create")}
                puedeEditarMoneda={puede("comercio", "update")}
              />
            )}

            {activa === "usuarios" && (
              // Una prop por acción en vez de un "puedeEditar" global: el
              // gerente llega hasta acá con `member:read` y tiene que ver la
              // lista sin poder tocarla. Preguntando por acción eso sale solo,
              // sin nombrar ningún rol.
              <SeccionUsuarios
                usuarioId={usuario?.id}
                puedeInvitar={puede("invitation", "create")}
                puedeCancelarInvitacion={puede("invitation", "cancel")}
                puedeCambiarRoles={puede("member", "update")}
                puedeQuitar={puede("member", "delete")}
              />
            )}

            {/* La pestaña ya no existe para quien no tiene `auditoria:read`. */}
            {activa === "auditoria" && <SeccionAuditoria />}
          </>
        )}
      </div>
    </main>
  );
}
