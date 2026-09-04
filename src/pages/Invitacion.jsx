import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Campo from "../components/Campo";
import { useAuth } from "../hooks/useAuth";
import { registrar } from "../services/auth";
import {
  aceptarInvitacion,
  etiquetaDeRol,
  verInvitacion,
} from "../services/miembros";
import { validarRegistro } from "./Registro.validacion";

/**
 * Pantalla que ve quien recibe un link de invitación (HU-4).
 *
 * Sirve para los dos casos: quien ya tiene cuenta acepta con un botón, y quien
 * no la tiene se registra acá mismo. En ese segundo caso el alta lleva el
 * `invitacionId`, y el backend lo suma al comercio que lo invitó en vez de
 * crearle uno propio.
 */
export default function Invitacion() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { autenticado, cargando: cargandoSesion } = useAuth();

  const [invitacion, setInvitacion] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [campos, setCampos] = useState({
    correo: "",
    password: "",
    confirmacion: "",
  });
  const [errores, setErrores] = useState({});

  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    verInvitacion(id)
      .then((datos) => {
        if (!montado.current) return;
        setInvitacion(datos);
        // El correo viene de la invitación: se precarga para que no lo tipeen
        // mal, pero se deja editable por si el dueño se equivocó al invitar.
        setCampos((previos) => ({ ...previos, correo: datos.correo }));
      })
      .catch((fallo) => {
        if (montado.current) setError(fallo.message);
      })
      .finally(() => {
        if (montado.current) setCargando(false);
      });
  }, [id]);

  function alEscribir(evento) {
    const { name, value } = evento.target;
    setCampos((previos) => ({ ...previos, [name]: value }));
    setErrores((previos) => ({ ...previos, [name]: undefined }));
    setError("");
  }

  async function aceptarConCuenta() {
    setEnviando(true);
    setError("");

    try {
      await aceptarInvitacion(id);
      navegar("/", { replace: true });
    } catch (fallo) {
      setError(fallo.message);
    } finally {
      setEnviando(false);
    }
  }

  async function registrarseYAceptar(evento) {
    evento.preventDefault();

    const encontrados = validarRegistro(campos);
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setEnviando(true);
    setError("");

    const resultado = await registrar({
      correo: campos.correo.trim(),
      password: campos.password,
      invitacionId: id,
    });

    setEnviando(false);

    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }

    navegar("/", { replace: true });
  }

  if (cargando || cargandoSesion) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="text-(--color-texto-apagado)">Cargando…</p>
      </main>
    );
  }

  if (error && !invitacion) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-extrabold text-(--color-texto)">
            Esta invitación no sirve
          </h1>
          <p role="alert" className="mt-2 text-(--color-texto-apagado)">
            {error}
          </p>
          <p className="mt-6 text-sm text-(--color-texto-apagado)">
            Pedile al dueño del comercio que te mande una nueva.
          </p>
          <Link
            to="/login"
            className="mt-4 inline-block font-bold text-(--color-primario) underline"
          >
            Ir al inicio de sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-(--color-texto)">
            Te invitaron a un comercio
          </h1>
          <p className="mt-2 text-(--color-texto-apagado)">
            Vas a entrar como{" "}
            <strong className="text-(--color-texto)">
              {etiquetaDeRol(invitacion.rol)}
            </strong>
            .
          </p>
        </header>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                       text-sm font-semibold text-(--color-peligro)"
          >
            {error}
          </p>
        )}

        {autenticado ? (
          <button
            type="button"
            disabled={enviando}
            onClick={aceptarConCuenta}
            className="w-full rounded-(--radius) bg-(--color-primario) px-4 py-3.5
                       text-base font-bold text-(--color-primario-texto) transition
                       hover:opacity-90 focus:outline-none focus:ring-4
                       focus:ring-(--color-primario-suave) disabled:opacity-60"
          >
            {enviando ? "Entrando…" : "Aceptar invitación"}
          </button>
        ) : (
          <form
            onSubmit={registrarseYAceptar}
            noValidate
            className="flex flex-col gap-5"
          >
            <p className="text-sm text-(--color-texto-apagado)">
              Creá tu cuenta para entrar.
            </p>

            <Campo
              id="correo"
              etiqueta="Correo"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={campos.correo}
              onChange={alEscribir}
              error={errores.correo}
            />

            <Campo
              id="password"
              etiqueta="Contraseña"
              type="password"
              autoComplete="new-password"
              value={campos.password}
              onChange={alEscribir}
              error={errores.password}
            />

            <Campo
              id="confirmacion"
              etiqueta="Repetí la contraseña"
              type="password"
              autoComplete="new-password"
              value={campos.confirmacion}
              onChange={alEscribir}
              error={errores.confirmacion}
            />

            <button
              type="submit"
              disabled={enviando}
              className="mt-2 w-full rounded-(--radius) bg-(--color-primario) px-4 py-3.5
                         text-base font-bold text-(--color-primario-texto) transition
                         hover:opacity-90 focus:outline-none focus:ring-4
                         focus:ring-(--color-primario-suave) disabled:opacity-60"
            >
              {enviando ? "Creando cuenta…" : "Crear cuenta y entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
