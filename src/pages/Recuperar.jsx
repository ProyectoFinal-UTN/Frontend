import { useState } from "react";
import { Link } from "react-router-dom";
import Campo from "../components/Campo";
import { pedirRecuperacion } from "../services/auth";
import { validarPedidoDeRecuperacion } from "./Recuperar.validacion";

/**
 * Paso 1 de la recuperación de contraseña (HU-3): pedir el link.
 *
 * La pantalla **nunca dice si el correo existe**. El backend responde igual en
 * los dos casos para que no se pueda averiguar quién tiene cuenta probando de a
 * uno, y de nada serviría si acá se mostrara "ese correo no está registrado".
 * Por eso el mensaje de éxito habla en condicional: "si hay una cuenta con ese
 * correo".
 */
export default function Recuperar() {
  const [correo, setCorreo] = useState("");
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState(false);

  async function alEnviar(evento) {
    evento.preventDefault();

    const encontrados = validarPedidoDeRecuperacion({ correo });
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setEnviando(true);
    setErrorGeneral("");

    const resultado = await pedirRecuperacion({ correo: correo.trim() });

    setEnviando(false);

    if (!resultado.ok) {
      // Solo llega acá si falló la comunicación. Eso no dice nada de si la
      // cuenta existe.
      setErrorGeneral(resultado.error);
      return;
    }

    setPedido(true);
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-(--color-texto)">
            Recuperar contraseña
          </h1>
          <p className="mt-2 text-(--color-texto-apagado)">
            Te mandamos un link para elegir una nueva.
          </p>
        </header>

        {pedido ? (
          <div className="flex flex-col gap-5">
            <p
              role="status"
              className="rounded-(--radius) bg-(--color-apagado) px-4 py-3
                         text-sm text-(--color-texto)"
            >
              Si hay una cuenta con ese correo, va a llegar un mensaje con el
              link para elegir una contraseña nueva. Vence en una hora y se usa
              una sola vez.
            </p>
            <p className="text-sm text-(--color-texto-apagado)">
              Revisá también el correo no deseado. Si no llega, probá de nuevo
              en unos minutos.
            </p>
            <Link
              to="/login"
              className="text-center font-bold text-(--color-primario) underline"
            >
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
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
              value={correo}
              onChange={(evento) => {
                setCorreo(evento.target.value);
                setErrores({});
                setErrorGeneral("");
              }}
              error={errores.correo}
            />

            <button
              type="submit"
              disabled={enviando}
              className="mt-2 w-full rounded-(--radius) bg-(--color-primario) px-4 py-3.5
                         text-base font-bold text-(--color-primario-texto) transition
                         hover:opacity-90 focus:outline-none focus:ring-4
                         focus:ring-(--color-primario-suave) disabled:opacity-60"
            >
              {enviando ? "Enviando…" : "Enviarme el link"}
            </button>
          </form>
        )}

        {!pedido && (
          <p className="mt-6 text-center text-sm text-(--color-texto-apagado)">
            ¿Te acordaste?{" "}
            <Link
              to="/login"
              className="font-bold text-(--color-primario) underline"
            >
              Iniciá sesión
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
