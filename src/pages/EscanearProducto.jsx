import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEscanerCodigoBarras } from "../hooks/useEscanerCodigoBarras";
import { verificarCodigoBarras } from "../services/productos";

const MENSAJE_ERROR_CAMARA = {
  "permiso-denegado":
    "No diste permiso para usar la cámara. Habilitalo desde la configuración del navegador e intentá de nuevo.",
  "sin-camara": "No se encontró ninguna cámara en este dispositivo.",
  "contexto-inseguro":
    "El acceso a la cámara requiere una conexión segura (HTTPS), salvo en localhost.",
  desconocido: "No se pudo acceder a la cámara. Intentá de nuevo.",
};

const BOTON_PRIMARIO =
  "rounded-(--radius) bg-(--color-primario) px-4 py-3 text-center " +
  "font-bold text-(--color-primario-texto) transition hover:opacity-90";

export default function EscanearProducto() {
  const navegar = useNavigate();
  const { videoRef, iniciar, detener, estado, error, codigo } =
    useEscanerCodigoBarras();

  const [estadoBusqueda, setEstadoBusqueda] = useState("inactivo");
  const [producto, setProducto] = useState(null);
  const [sugerencia, setSugerencia] = useState(null);

  useEffect(() => {
    if (!codigo) return;

    let cancelado = false;

    async function buscar() {
      setEstadoBusqueda("buscando");
      setProducto(null);
      setSugerencia(null);

      try {
        // GET /api/productos/codigo/:codigoBarras (HU-9): responde siempre
        // 200, con { existe, producto } o { existe: false, sugerencia }. La
        // sugerencia de Open Food Facts ya viene armada por el backend, no
        // hace falta pedirla aparte desde acá.
        const resultado = await verificarCodigoBarras(codigo);
        if (cancelado) return;

        if (resultado.existe) {
          setProducto(resultado.producto);
          setEstadoBusqueda("encontrado");
          return;
        }

        setSugerencia(resultado.sugerencia);
        setEstadoBusqueda("no-encontrado");
      } catch {
        if (!cancelado) setEstadoBusqueda("error");
      }
    }

    buscar();

    return () => {
      cancelado = true;
    };
  }, [codigo]);

  function reintentar() {
    setEstadoBusqueda("inactivo");
    setProducto(null);
    setSugerencia(null);
    iniciar();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center gap-4 px-4 py-10">
      <h1 className="text-3xl font-extrabold text-(--color-texto)">
        Escanear código de barras
      </h1>

      {estado === "inactivo" && (
        <button type="button" onClick={iniciar} className={BOTON_PRIMARIO}>
          Iniciar escaneo
        </button>
      )}

      {estado === "solicitando-permiso" && (
        <p className="text-(--color-texto-apagado)">
          Pidiendo acceso a la cámara...
        </p>
      )}

      {/*
        El <video> se renderiza SIEMPRE (nunca condicionado por `estado`) y
        se oculta con CSS cuando no hace falta. Si en cambio solo se
        renderizara durante "escaneando", `videoRef.current` seguiria siendo
        null en el momento en que `iniciar()` llama a
        `decodeFromVideoDevice`: el cambio de estado a "solicitando-permiso"
        todavia no se reflejo en el DOM (React no re-renderizo) cuando esa
        linea se ejecuta, porque pasa de forma sincronica dentro del mismo
        handler de click. zxing igual pedia la camara (por eso el navegador
        la mostraba prendida), pero decodificaba contra un video interno
        propio en vez del elemento visible de la pagina.
      */}
      <video
        ref={videoRef}
        className={`w-full rounded-(--radius) border-2 border-(--color-borde) ${
          estado === "escaneando" ? "" : "hidden"
        }`}
        muted
        playsInline
      />

      {estado === "error" && (
        <div className="text-center">
          <p className="text-(--color-peligro)">{MENSAJE_ERROR_CAMARA[error]}</p>
          <button
            type="button"
            onClick={iniciar}
            className={`${BOTON_PRIMARIO} mt-2`}
          >
            Reintentar
          </button>
        </div>
      )}

      {estado === "detectado" && estadoBusqueda === "buscando" && (
        <p className="text-(--color-texto-apagado)">Buscando producto...</p>
      )}

      {estado === "detectado" && estadoBusqueda === "encontrado" && producto && (
        <div className="w-full rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) p-4">
          <p className="font-bold text-(--color-texto)">{producto.nombre}</p>
          <p className="text-sm text-(--color-texto-apagado)">
            Código: {producto.codigoBarras}
          </p>
          {producto.categoria && (
            <p className="text-sm text-(--color-texto-apagado)">
              Categoría: {producto.categoria}
            </p>
          )}
          <button
            type="button"
            onClick={reintentar}
            className={`${BOTON_PRIMARIO} mt-3 w-full`}
          >
            Escanear otro
          </button>
        </div>
      )}

      {estado === "detectado" && estadoBusqueda === "no-encontrado" && (
        <div className="w-full rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) p-4 text-center">
          <p className="text-(--color-texto)">
            No encontramos ningún producto con el código{" "}
            <span className="font-mono">{codigo}</span> en tu comercio.
          </p>

          {sugerencia && (
            <div className="mt-3 rounded-(--radius) bg-(--color-apagado) p-3 text-left text-sm">
              <p className="font-bold text-(--color-texto)">
                Encontramos esto en Open Food Facts:
              </p>
              {sugerencia.nombre && (
                <p className="text-(--color-texto)">{sugerencia.nombre}</p>
              )}
              {sugerencia.categoria && (
                <p className="text-(--color-texto)">
                  Categoría: {sugerencia.categoria}
                </p>
              )}
              <p className="mt-1 text-xs text-(--color-texto-apagado)">
                Datos de producto:{" "}
                <a
                  href="https://world.openfoodfacts.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-(--color-primario) underline"
                >
                  Open Food Facts
                </a>
              </p>
            </div>
          )}

          <button
            type="button"
            // /productos?nuevo=<codigo> (HU-9): abre el catálogo con el alta
            // ya desplegada y el código puesto. Se consume una sola vez del
            // otro lado, no hace falta limpiar nada acá.
            onClick={() => navegar(`/productos?nuevo=${codigo}`)}
            className={`${BOTON_PRIMARIO} mt-3 w-full`}
          >
            Dar de alta
          </button>

          <button
            type="button"
            onClick={reintentar}
            className={`${BOTON_PRIMARIO} mt-3 w-full`}
          >
            Escanear otro
          </button>
        </div>
      )}

      {estado === "detectado" && estadoBusqueda === "error" && (
        <div className="text-center">
          <p className="text-(--color-peligro)">
            No pudimos conectar con el servidor. Intentá de nuevo.
          </p>
          <button
            type="button"
            onClick={reintentar}
            className={`${BOTON_PRIMARIO} mt-2`}
          >
            Reintentar
          </button>
        </div>
      )}

      {(estado === "escaneando" || estado === "solicitando-permiso") && (
        <button
          type="button"
          onClick={detener}
          className="text-sm text-(--color-texto-apagado) underline"
        >
          Cancelar
        </button>
      )}
    </main>
  );
}
