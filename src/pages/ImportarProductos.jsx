import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ResumenImportacion from "../components/ResumenImportacion";
import VistaPreviaCsv from "../components/VistaPreviaCsv";
import { obtenerConfiguracion } from "../services/configuracion";
import { importarCatalogo } from "../services/productos";
import {
  MAXIMO_FILAS,
  contarProductos,
  leerCsv,
  validarArchivo,
} from "./ImportarProductos.validacion";

/**
 * Importación del catálogo inicial desde un CSV (HU-7).
 *
 * El recorrido es: elegir archivo → ver qué se va a subir → confirmar → leer el
 * reporte. Nada se manda al servidor hasta que el usuario confirma, que es lo
 * que pide el criterio de aceptación de la vista previa.
 *
 * El `File` elegido se guarda en el estado durante todo el recorrido, y no solo
 * hasta que se sube. Es lo que permite reintentar una importación interrumpida
 * —o volver a intentar después de un 400— sin obligar a buscar otra vez el
 * archivo en el explorador.
 *
 * Los dos caminos de respuesta nunca se cruzan: un 200 trae el reporte y va a
 * `reporte`; un 4xx/5xx trae `{ error }`, lo convierte `api.js` en excepción y
 * va a `error`. Un 200 con filas rechazadas **no** es un error — es el
 * resultado normal de la historia— y por eso el `catch` no lo ve nunca.
 */

const CLASES_BOTON_PRIMARIO =
  "rounded-(--radius) bg-(--color-primario) px-5 py-3 font-bold " +
  "text-(--color-primario-texto) transition hover:opacity-90 " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave) " +
  "disabled:opacity-60";

export default function ImportarProductos() {
  const [archivo, setArchivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  // El rol decide si esta pantalla tiene sentido para quien la abre. Viene del
  // backend y no del cliente, igual que en la configuración: acá solo cambia lo
  // que se muestra, el permiso real lo sigue chequeando el endpoint.
  const [rol, setRol] = useState(null);
  const [cargandoRol, setCargandoRol] = useState(true);

  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    obtenerConfiguracion()
      .then((configuracion) => {
        if (montado.current) setRol(configuracion.rol);
      })
      // Si no se puede saber el rol, se muestra la pantalla igual: el backend
      // responde 403 si no corresponde, y ese mensaje es mejor que bloquear a
      // alguien que sí tenía permiso porque una request secundaria falló.
      .catch(() => {})
      .finally(() => {
        if (montado.current) setCargandoRol(false);
      });
  }, []);

  function alElegirArchivo(evento) {
    const elegido = evento.target.files?.[0] ?? null;

    // Se limpia el input apenas se saca el archivo de adentro, y no al final:
    // un `<input type="file">` no vuelve a disparar `change` si se elige el
    // mismo archivo dos veces seguidas. Sin esto, el "corregí la columna y
    // volvé a elegir el archivo" de más abajo no funciona nunca — la persona
    // arregla la planilla en Excel, la guarda con el mismo nombre, la vuelve a
    // elegir y la pantalla no se entera. El `File` ya capturado sigue siendo
    // válido: limpiar el input no lo invalida.
    evento.target.value = "";

    setReporte(null);
    setPrevia(null);
    setError("");

    if (!elegido) {
      setArchivo(null);
      return;
    }

    // Extensión y tamaño se chequean antes de leer nada: enterarse de que el
    // archivo pesa 5 MB recién después de haberlo subido es la peor versión del
    // mismo mensaje, sobre todo desde el celular en el negocio.
    const { valido, motivo } = validarArchivo(elegido);

    if (!valido) {
      setArchivo(null);
      setError(motivo);
      return;
    }

    setArchivo(elegido);

    const lector = new FileReader();

    lector.onload = () => {
      if (!montado.current) return;

      const leido = leerCsv(String(lector.result ?? ""));

      if (leido.error) {
        setError(leido.error);
        setPrevia(null);
        return;
      }

      setPrevia(leido);
    };

    lector.onerror = () => {
      if (montado.current) setError("No se pudo leer el archivo.");
    };

    lector.readAsText(elegido, "utf-8");
  }

  function importar() {
    if (!archivo) return;

    setSubiendo(true);
    setError("");

    importarCatalogo(archivo)
      .then((datos) => {
        if (!montado.current) return;
        // Llega tal cual del backend. Que traiga `fallidos > 0` no lo convierte
        // en un fallo: de decidir qué significa se encarga `ResumenImportacion`.
        setReporte(datos);
      })
      .catch((fallo) => {
        // Solo cae acá lo que invalida el archivo entero (falta una columna
        // obligatoria, está vacío, no parsea, se pasa de 2 MB o de 1000 filas)
        // o el 403 del rol. No hay filas que listar: es un mensaje único.
        if (montado.current) setError(fallo.message);
      })
      .finally(() => {
        if (montado.current) setSubiendo(false);
      });
  }

  function empezarDeNuevo() {
    setArchivo(null);
    setPrevia(null);
    setReporte(null);
    setError("");
  }

  const faltanColumnas = previa ? previa.faltantes.length > 0 : false;
  const excedeMaximo = previa ? previa.excedeMaximo : false;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <header className="mb-6">
        <Link
          to="/productos"
          className="text-sm font-bold text-(--color-primario) underline"
        >
          ← Volver a productos
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-(--color-texto)">
          Importar catálogo
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Subí la planilla que ya tenés y cargá todos tus productos de una vez.
        </p>
      </header>

      {cargandoRol && (
        <p className="text-(--color-texto-apagado)">Cargando…</p>
      )}

      {!cargandoRol && rol === "empleado" && (
        <div className="rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) p-4">
          <h2 className="text-lg font-extrabold text-(--color-texto)">
            Tu rol no puede importar productos
          </h2>
          <p className="mt-2 text-(--color-texto-apagado)">
            Pedile a quien administra el comercio —el propietario o el gerente—
            que suba la planilla.
          </p>
        </div>
      )}

      {!cargandoRol && rol !== "empleado" && (
        <div className="flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                         text-sm font-semibold text-(--color-peligro)"
            >
              {error}
            </div>
          )}

          {reporte ? (
            <ResumenImportacion
              reporte={reporte}
              alReintentar={importar}
              alImportarOtro={empezarDeNuevo}
              subiendo={subiendo}
            />
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="archivo"
                  className="text-sm font-bold text-(--color-texto)"
                >
                  Archivo CSV
                </label>
                <input
                  id="archivo"
                  name="archivo"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={alElegirArchivo}
                  className="w-full rounded-(--radius) border-2 border-(--color-borde)
                             bg-(--color-tarjeta) px-4 py-3 text-base text-(--color-texto)
                             outline-none transition focus:border-(--color-primario)"
                />
              </div>

              {faltanColumnas && (
                <div
                  role="alert"
                  className="rounded-(--radius) bg-(--color-atencion-suave) px-4 py-3
                             text-sm font-semibold text-(--color-atencion)"
                >
                  {previa.faltantes.length === 1
                    ? `Al archivo le falta una columna obligatoria: ${previa.faltantes[0]}. Agregala`
                    : `Al archivo le faltan columnas obligatorias: ${previa.faltantes.join(", ")}. Agregalas`}{" "}
                  y volvé a elegir el archivo.
                </div>
              )}

              {excedeMaximo && (
                <div
                  role="alert"
                  className="rounded-(--radius) bg-(--color-atencion-suave) px-4 py-3
                             text-sm font-semibold text-(--color-atencion)"
                >
                  El archivo tiene {previa.totalFilas} filas y el máximo es{" "}
                  {MAXIMO_FILAS}. Dividilo en partes y subilas de a una.
                </div>
              )}

              <VistaPreviaCsv previa={previa} />

              {previa && !faltanColumnas && !excedeMaximo && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={importar}
                    disabled={subiendo}
                    className={CLASES_BOTON_PRIMARIO}
                  >
                    {subiendo
                      ? "Importando…"
                      : `Confirmar carga de ${contarProductos(previa.totalFilas)}`}
                  </button>
                  {subiendo && (
                    // Un catálogo de 1000 filas son 1000 transacciones: sin
                    // este aviso, el silencio parece que se colgó y el usuario
                    // recarga o vuelve a apretar.
                    <p
                      role="status"
                      className="text-sm text-(--color-texto-apagado)"
                    >
                      Esto puede tardar un momento si el archivo es grande. No
                      cierres la pantalla.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
