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

/**
 * Open Food Facts devuelve nombre/categoría en minúsculas
 * ("puré arcor", "tomate natural triturado"). Se prolija acá, no en el
 * backend: es puramente cosmético para esta pantalla y para lo que se
 * precarga en el alta, no algo que el resto de la API deba cargar.
 *
 * El nombre se capitaliza palabra por palabra, como un nombre de producto
 * ("Puré Arcor"); la categoría solo en la primera letra, como una frase
 * ("Tomate natural triturado") — misma idea que ya usan los placeholders del
 * formulario de alta ("Coca-Cola 500ml" vs "Bebidas").
 */
function capitalizarNombre(texto) {
  if (!texto) return texto;
  return texto
    .split(" ")
    .map((palabra) => (palabra ? palabra[0].toUpperCase() + palabra.slice(1) : palabra))
    .join(" ");
}

function capitalizarCategoria(texto) {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
}

export default function EscanearProducto() {
  const navegar = useNavigate();
  const { videoRef, iniciar, detener, estado, error, codigo } =
    useEscanerCodigoBarras();

  const [estadoBusqueda, setEstadoBusqueda] = useState("inactivo");
  const [producto, setProducto] = useState(null);
  const [sugerencia, setSugerencia] = useState(null);

  // Al entrar a esta pantalla se viene específicamente a escanear — pedir la
  // cámara de una y no hacer que el primer paso sea un click de más.
  useEffect(() => {
    iniciar();
  }, [iniciar]);

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

        setSugerencia(
          resultado.sugerencia
            ? {
                nombre: capitalizarNombre(resultado.sugerencia.nombre),
                categoria: capitalizarCategoria(resultado.sugerencia.categoria),
              }
            : null,
        );
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

      {(estado === "inactivo" || estado === "solicitando-permiso") && (
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
          <p className="font-bold text-(--color-exito)">
            Este producto ya está en tu catálogo
          </p>
          <p className="mt-2 font-bold text-(--color-texto)">{producto.nombre}</p>
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

          {sugerencia ? (
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
          ) : (
            <p className="mt-3 text-sm text-(--color-texto-apagado)">
              Tampoco lo encontramos en Open Food Facts. Podés cargarlo a mano.
            </p>
          )}

          <button
            type="button"
            // /productos?nuevo=<codigo>[&nombre=...&categoria=...] (HU-9):
            // abre el catálogo con el alta ya desplegada. Sin sugerencia el
            // formulario arranca vacío en nombre/categoria (el usuario los
            // tipea a mano) — con ella, ya vienen precargados. Se consume una
            // sola vez del otro lado, no hace falta limpiar nada acá.
            onClick={() => {
              const parametros = new URLSearchParams({ nuevo: codigo });
              if (sugerencia?.nombre) parametros.set("nombre", sugerencia.nombre);
              if (sugerencia?.categoria)
                parametros.set("categoria", sugerencia.categoria);
              navegar(`/productos?${parametros.toString()}`);
            }}
            className={`${BOTON_PRIMARIO} mt-3 w-full`}
          >
            {sugerencia ? "Dar de alta" : "Cargar a mano"}
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
          // Solo apagar la cámara dejaba la pantalla en "inactivo" sin salida:
          // el efecto que la prende arranca una sola vez al montar, así que
          // no hay forma de volver a pedirla desde acá sin recargar. Cancelar
          // tiene que sacar a la persona de esta pantalla, no dejarla varada.
          onClick={() => {
            detener();
            navegar(-1);
          }}
          className="text-sm text-(--color-texto-apagado) underline"
        >
          Cancelar
        </button>
      )}
    </main>
  );
}
