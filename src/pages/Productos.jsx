import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SeccionProductos from "../components/SeccionProductos";
import { obtenerProductos } from "../services/productos";

/**
 * Catálogo de productos del comercio (HU-9).
 *
 * La pantalla se ocupa de traer la lista y de los tres estados de esa carga;
 * el alta, la edición y la baja viven en `SeccionProductos`.
 */
export default function Productos() {
  const [parametros, setParametros] = useSearchParams();
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  // Permite abrir la pantalla con el alta ya desplegada y el código puesto:
  // `/productos?nuevo=7790895000782`. Es el gancho para que el escáner de
  // HU-10 pueda mandar acá el código que leyó — y, si lo encontró en Open
  // Food Facts, el nombre/categoría sugeridos (`&nombre=...&categoria=...`),
  // para no dejar al usuario retipeando lo que la pantalla de escaneo ya le
  // mostró.
  //
  // Se lee una sola vez, al entrar. Leerlo en cada render lo convertiría en un
  // estado pegajoso: la sección se desmonta ante un error de carga, así que el
  // "Reintentar" la remontaría reabriendo el alta con un código que a esa
  // altura quizá ya se dio de alta, y el guardado saldría con un 409 que el
  // usuario no pidió. Un F5 haría lo mismo.
  // La sección avisa cuando lo usó y acá se descarta: limpiar la URL sola no
  // alcanza, porque este estado sobrevive al desmontaje de la sección.
  const [codigoInicial, setCodigoInicial] = useState(
    () => parametros.get("nuevo") ?? "",
  );
  const [nombreInicial, setNombreInicial] = useState(
    () => parametros.get("nombre") ?? "",
  );
  const [categoriaInicial, setCategoriaInicial] = useState(
    () => parametros.get("categoria") ?? "",
  );

  useEffect(() => {
    if (!parametros.get("nuevo")) return;

    // Se borran estos tres y no la query entera, para no pisar parámetros que
    // otra historia agregue después. `replace` evita que el botón "atrás"
    // devuelva a la misma URL y reviva el problema por la otra puerta.
    const siguientes = new URLSearchParams(parametros);
    siguientes.delete("nuevo");
    siguientes.delete("nombre");
    siguientes.delete("categoria");
    setParametros(siguientes, { replace: true });
  }, [parametros, setParametros]);

  // Una recarga que dispara la sección hija puede volver después de que la
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
      obtenerProductos()
        .then((datos) => {
          if (!montado.current) return;
          setProductos(datos);
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
          Productos
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Cargá lo que vendés, corregí lo que cambió y dá de baja lo que ya no
          trabajás.
        </p>
      </header>

      {cargando && (
        <p className="text-(--color-texto-apagado)">Cargando productos…</p>
      )}

      {!cargando && error && (
        <div
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{error}</p>
          {/*
            Sin este botón, un backend que no responde deja la pantalla muerta:
            la lista no se renderiza, así que no queda ninguna acción a mano y
            la única salida es recargar el navegador.
          */}
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

      {!cargando && !error && productos && (
        <SeccionProductos
          productos={productos}
          alRecargar={cargar}
          codigoInicial={codigoInicial}
          nombreInicial={nombreInicial}
          categoriaInicial={categoriaInicial}
          alConsumirCodigo={() => {
            setCodigoInicial("");
            setNombreInicial("");
            setCategoriaInicial("");
          }}
        />
      )}
    </main>
  );
}
