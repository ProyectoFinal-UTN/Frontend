import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registrar } from "../services/auth";
import { validarRegistro } from "./Registro.validacion";

/** Un campo de texto con su etiqueta y su mensaje de error. */
function Campo({ id, etiqueta, error, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-(--color-texto)">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `error-${id}` : undefined}
        className={`w-full rounded-(--radius) border-2 bg-(--color-tarjeta) px-4 py-3
                    text-base text-(--color-texto) outline-none transition
                    focus:border-(--color-primario)
                    ${error ? "border-(--color-peligro)" : "border-(--color-borde)"}`}
        {...props}
      />
      {error && (
        <p id={`error-${id}`} className="text-sm text-(--color-peligro)">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Registro() {
  const navegar = useNavigate();

  const [campos, setCampos] = useState({
    correo: "",
    password: "",
    confirmacion: "",
  });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alEscribir(evento) {
    const { name, value } = evento.target;
    setCampos((previos) => ({ ...previos, [name]: value }));
    // El error se limpia apenas tocan el campo: dejarlo mientras corrigen
    // es molesto.
    setErrores((previos) => ({ ...previos, [name]: undefined }));
    setErrorGeneral("");
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    const encontrados = validarRegistro(campos);
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setEnviando(true);
    setErrorGeneral("");

    const resultado = await registrar({
      correo: campos.correo.trim(),
      password: campos.password,
    });

    setEnviando(false);

    if (!resultado.ok) {
      setErrorGeneral(resultado.error);
      return;
    }

    // El registro deja la sesión iniciada, así que se entra directo.
    navegar("/", { replace: true });
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-(--color-texto)">
            Creá tu cuenta
          </h1>
          <p className="mt-2 text-(--color-texto-apagado)">
            Empezá a controlar el stock de tu negocio.
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
            {enviando ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-(--color-texto-apagado)">
          ¿Ya tenés cuenta?{" "}
          <Link
            to="/login"
            className="font-bold text-(--color-primario) underline"
          >
            Iniciá sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
