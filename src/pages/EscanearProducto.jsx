import { useEffect, useState } from "react";
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

export default function EscanearProducto() {
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
    <div className="min-h-screen p-4 flex flex-col items-center gap-4">
      <h1 className="text-xl font-semibold text-gray-800">
        Escanear código de barras
      </h1>

      {estado === "inactivo" && (
        <button
          type="button"
          onClick={iniciar}
          className="px-4 py-2 rounded bg-blue-600 text-white"
        >
          Iniciar escaneo
        </button>
      )}

      {estado === "solicitando-permiso" && (
        <p className="text-gray-600">Pidiendo acceso a la cámara...</p>
      )}

      {(estado === "escaneando" || estado === "detectado") && (
        <video
          ref={videoRef}
          className="w-full max-w-sm rounded"
          muted
          playsInline
        />
      )}

      {estado === "error" && (
        <div className="text-center">
          <p className="text-red-600">{MENSAJE_ERROR_CAMARA[error]}</p>
          <button
            type="button"
            onClick={iniciar}
            className="mt-2 px-4 py-2 rounded bg-blue-600 text-white"
          >
            Reintentar
          </button>
        </div>
      )}

      {estado === "detectado" && estadoBusqueda === "buscando" && (
        <p className="text-gray-600">Buscando producto...</p>
      )}

      {estado === "detectado" && estadoBusqueda === "encontrado" && producto && (
        <div className="w-full max-w-sm border rounded p-4">
          <p className="font-semibold">{producto.nombre}</p>
          <p className="text-sm text-gray-600">
            Código: {producto.codigoBarras}
          </p>
          {producto.categoria && (
            <p className="text-sm text-gray-600">
              Categoría: {producto.categoria}
            </p>
          )}
          <button
            type="button"
            onClick={reintentar}
            className="mt-3 px-4 py-2 rounded bg-blue-600 text-white"
          >
            Escanear otro
          </button>
        </div>
      )}

      {estado === "detectado" && estadoBusqueda === "no-encontrado" && (
        <div className="w-full max-w-sm border rounded p-4 text-center">
          <p className="text-gray-800">
            No encontramos ningún producto con el código{" "}
            <span className="font-mono">{codigo}</span> en tu comercio.
          </p>

          {sugerencia && (
            <div className="mt-3 p-3 bg-gray-50 rounded text-left text-sm">
              <p className="font-medium">Encontramos esto en Open Food Facts:</p>
              {sugerencia.nombre && <p>{sugerencia.nombre}</p>}
              {sugerencia.categoria && <p>Categoría: {sugerencia.categoria}</p>}
              <p className="text-xs text-gray-500 mt-1">
                Datos de producto:{" "}
                <a
                  href="https://world.openfoodfacts.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Open Food Facts
                </a>
              </p>
            </div>
          )}

          <button
            type="button"
            disabled
            title="Disponible cuando exista la pantalla de alta de productos en el Frontend"
            className="mt-3 px-4 py-2 rounded bg-gray-300 text-gray-600 cursor-not-allowed"
          >
            Dar de alta
          </button>

          <div>
            <button
              type="button"
              onClick={reintentar}
              className="mt-3 px-4 py-2 rounded bg-blue-600 text-white"
            >
              Escanear otro
            </button>
          </div>
        </div>
      )}

      {estado === "detectado" && estadoBusqueda === "error" && (
        <div className="text-center">
          <p className="text-red-600">
            No pudimos conectar con el servidor. Intentá de nuevo.
          </p>
          <button
            type="button"
            onClick={reintentar}
            className="mt-2 px-4 py-2 rounded bg-blue-600 text-white"
          >
            Reintentar
          </button>
        </div>
      )}

      {(estado === "escaneando" || estado === "solicitando-permiso") && (
        <button type="button" onClick={detener} className="text-sm text-gray-500 underline">
          Cancelar
        </button>
      )}
    </div>
  );
}
