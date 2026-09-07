import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Campo from "../components/Campo";
import { restablecerPassword } from "../services/auth";
import { validarPasswordNueva } from "./Recuperar.validacion";

/**
 * Paso 2 de la recuperación de contraseña (HU-3): elegir la nueva.
 *
 * El token viene en la URL, puesto ahí por el link del correo. Es la única
 * credencial de esta pantalla: quien lo tiene puede cambiar la contraseña, así
 * que vence a la hora y se usa una sola vez.
 *
 * Después de cambiarla hay que volver a entrar. No es un olvido: el backend
 * cierra todas las sesiones abiertas de la cuenta, porque si alguien está
 * recuperándola justamente porque se la tomaron, dejar viva la sesión del
 * intruso haría que cambiar la contraseña no sirviera de nada.
 */
export default function Restablecer() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const token = parametros.get("token");

  const [campos, setCampos] = useState({ password: "", confirmacion: "" });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alEscribir(evento) {
    const { name, value } = evento.target;
    setCampos((previos) => ({ ...previos, [name]: value }));
    setErrores((previos) => ({ ...previos, [name]: undefined }));
    setErrorGeneral("");
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    const encontrados = validarPasswordNueva(campos);
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setEnviando(true);
    setErrorGeneral("");

    const resultado = await restablecerPassword({
      token,
      password: campos.password,
    });

    setEnviando(false);

    if (!resultado.ok) {
      setErrorGeneral(resultado.error);
      return;
    }

    navegar("/login", { replace: true });
  }

  // Sin token no hay nada que hacer acá. Pasa si alguien entra a mano a la
  // ruta, o si el cliente de correo cortó el link a la mitad.
  if (!token) {
    return (
      <main className="min-h-screen px-4 py-10 sm:grid sm:place-items-center">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-3xl font-extrabold text-(--color-texto)">
            Link inválido
          </h1>
          <p
            role="alert"
            className="mt-4 rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                       text-sm font-semibold text-(--color-peligro)"
          >
            Este link no tiene el código de recuperación. Puede que el correo lo
            haya cortado: probá copiarlo entero, o pedí uno nuevo.
          </p>
          <Link
            to="/recuperar"
            className="mt-6 block text-center font-bold text-(--color-primario) underline"
          >
            Pedir un link nuevo
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
            Elegí una contraseña nueva
          </h1>
          <p className="mt-2 text-(--color-texto-apagado)">
            Después vas a tener que iniciar sesión otra vez, también en los
            dispositivos donde ya estabas.
          </p>
        </header>

        <form onSubmit={alEnviar} noValidate className="flex flex-col gap-5">
          {errorGeneral && (
            <p
              role="alert"
              className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                         text-sm font-semibold text-(--color-peligro)"
            >
              {errorGeneral}
            </p>
          )}

          <Campo
            id="password"
            etiqueta="Contraseña nueva"
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
            {enviando ? "Guardando…" : "Guardar y volver a entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
