import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Campo from "../components/Campo";
import { iniciarSesion } from "../services/auth";
import { validarLogin } from "./Login.validacion";

export default function Login() {
  const navegar = useNavigate();
  const ubicacion = useLocation();

  // Si llegó acá porque intentó entrar a una pantalla protegida, vuelve a esa
  // en vez de al inicio. `RutaProtegida` deja la ruta original en el state.
  const destino = ubicacion.state?.desde ?? "/";

  const [campos, setCampos] = useState({ correo: "", password: "" });
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

    const encontrados = validarLogin(campos);
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setEnviando(true);
    setErrorGeneral("");

    const resultado = await iniciarSesion({
      correo: campos.correo.trim(),
      password: campos.password,
    });

    setEnviando(false);

    if (!resultado.ok) {
      // El backend responde igual ante correo inexistente y contraseña
      // incorrecta, para que no se pueda averiguar qué correos están
      // registrados. El mensaje que llega ya refleja esa ambigüedad.
      setErrorGeneral(resultado.error);
      return;
    }

    navegar(destino, { replace: true });
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-(--color-texto)">
            Iniciar sesión
          </h1>
          <p className="mt-2 text-(--color-texto-apagado)">
            Entrá para seguir controlando tu stock.
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
            autoComplete="current-password"
            value={campos.password}
            onChange={alEscribir}
            error={errores.password}
          />

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 w-full rounded-(--radius) bg-(--color-primario) px-4 py-3.5
                       text-base font-bold text-(--color-primario-texto) transition
                       hover:opacity-90 focus:outline-none focus:ring-4
                       focus:ring-(--color-primario-suave) disabled:opacity-60"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-(--color-texto-apagado)">
          ¿Todavía no tenés cuenta?{" "}
          <Link
            to="/registro"
            className="font-bold text-(--color-primario) underline"
          >
            Creá una
          </Link>
        </p>
      </div>
    </main>
  );
}
