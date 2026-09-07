import { useState } from "react";
import { Link } from "react-router-dom";
import {
  armarCsvDeErrores,
  descargarCsv,
} from "../pages/ImportarProductos.validacion";

/**
 * El reporte de una importación de catálogo (HU-7).
 *
 * ## Por qué esto es un componente aparte y no cuatro líneas en la pantalla
 *
 * `POST /api/productos/importar` responde **200 siempre**, y ese 200 significa
 * tres cosas distintas. Elegir cuál es cada una está centralizado acá, en
 * `estadoDelReporte`, para que no haya dos lugares decidiéndolo con criterios
 * que se puedan desincronizar.
 *
 * - **completo**: entró todo. Verde.
 * - **conErrores**: el archivo se procesó entero y algunas filas se rechazaron
 *   por sus datos. Ámbar: hay algo que el usuario tiene que corregir.
 * - **interrumpido**: un problema técnico cortó la carga a la mitad. Azul, y
 *   ni ámbar ni rojo, porque **el archivo del usuario no tiene nada malo**.
 *
 * Ese último es el que justifica todo el componente. Es el único caso donde
 * mostrar un error a secas sería mentir: el usuario se iría creyendo que no se
 * cargó nada cuando tiene doscientos productos nuevos en el catálogo. Y si se
 * lo pintara de rojo o de ámbar, se iría a "corregir" una planilla que estaba
 * perfecta. Por eso se distingue por cuatro señales a la vez —color, ícono,
 * encabezado y acción— y no solo por el texto.
 */

/**
 * Cuántas filas se listan antes de pedir que se expanda.
 *
 * Con el tope de 1000 filas del endpoint, `errores` puede traer cientos.
 * Pintarlas todas de una hace una lista que no se puede leer ni recorrer. Se
 * corta con un `slice` y no con una librería de virtualización: mil ítems de
 * texto plano no la justifican, y el tope real del endpoint no va a crecer.
 */
const TOPE_VISIBLE = 50;

const CLASES_BOTON_SUAVE =
  "rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-4 py-2 text-sm font-bold text-(--color-texto) transition " +
  "hover:border-(--color-primario) focus:outline-none focus:ring-4 " +
  "focus:ring-(--color-primario-suave)";

const CLASES_BOTON_PRIMARIO =
  "rounded-(--radius) bg-(--color-primario) px-5 py-3 font-bold " +
  "text-(--color-primario-texto) transition hover:opacity-90 " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave) " +
  "disabled:opacity-60";

/**
 * El orden de los `if` importa: `interrumpido` manda sobre todo lo demás.
 *
 * Una importación cortada puede traer además filas rechazadas, y si se
 * preguntara primero por `fallidos` esa combinación se mostraría como "tu
 * archivo tiene errores" escondiendo que la carga ni siquiera terminó.
 */
function estadoDelReporte(reporte) {
  if (reporte.interrumpido) return "interrumpido";
  if (reporte.fallidos > 0) return "conErrores";
  return "completo";
}

/**
 * Las filas que el backend rechazó.
 *
 * `motivo` se muestra tal cual viene: ya está redactado en castellano y son los
 * mismos textos que vería cargando el producto a mano. Traducirlo o mapearlo
 * acá sería duplicar mensajes que después divergen.
 *
 * `fila` también se muestra tal cual, sin sumarle ni restarle nada: es la línea
 * real del archivo, la misma que se ve al abrirlo en Excel. Es lo único que
 * hace accionable el reporte.
 */
function ListaDeErrores({ errores }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const visibles = mostrarTodos ? errores : errores.slice(0, TOPE_VISIBLE);
  const ocultos = errores.length - visibles.length;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-(--color-texto)">
          Filas que no se cargaron
        </h3>
        {/* Corregir cincuenta filas mirando la pantalla y la planilla al mismo
            tiempo es inviable. Con el CSV al lado, se arregla la planilla y se
            vuelve a subir. */}
        <button
          type="button"
          onClick={() =>
            descargarCsv("errores-importacion.csv", armarCsvDeErrores(errores))
          }
          className={CLASES_BOTON_SUAVE}
        >
          Descargar los errores en CSV
        </button>
      </div>

      <ul
        aria-label="Filas que no se cargaron"
        className="mt-3 flex flex-col gap-2"
      >
        {visibles.map((error) => (
          <li
            key={`${error.fila}-${error.codigoBarras}`}
            className="rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) px-3 py-2"
          >
            <p className="text-sm font-bold text-(--color-texto)">
              Fila {error.fila}
              {" · "}
              <span className="font-normal text-(--color-texto-apagado)">
                {error.codigoBarras || "sin código de barras"}
              </span>
            </p>
            <p className="mt-1 text-sm text-(--color-texto)">{error.motivo}</p>
          </li>
        ))}
      </ul>

      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setMostrarTodos(true)}
          className={`mt-3 ${CLASES_BOTON_SUAVE}`}
        >
          Ver las {errores.length} filas con error
        </button>
      )}
    </div>
  );
}

/** Lo que sí entró, colapsado: el foco tiene que quedar en lo que falta. */
function ListaDeImportados({ productos }) {
  if (productos.length === 0) return null;

  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-bold text-(--color-texto)">
        Ver los {productos.length} productos importados
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {productos.slice(0, TOPE_VISIBLE).map((producto) => (
          <li key={producto.id} className="text-sm text-(--color-texto-apagado)">
            Fila {producto.fila} · {producto.nombre} ({producto.codigoBarras})
          </li>
        ))}
      </ul>
      {productos.length > TOPE_VISIBLE && (
        <p className="mt-2 text-sm text-(--color-texto-apagado)">
          y {productos.length - TOPE_VISIBLE} más.
        </p>
      )}
    </details>
  );
}

export default function ResumenImportacion({
  reporte,
  alReintentar,
  alImportarOtro,
  subiendo,
}) {
  const { totalFilas, procesadas, importados, fallidos, interrupcion } =
    reporte;
  const estado = estadoDelReporte(reporte);

  // El invariante del backend es `importados + fallidos === procesadas`. No
  // debería fallar nunca, pero si fallara, mostrar un desglose que no cierra es
  // peor que no mostrarlo: el usuario no tiene forma de saber cuál de los
  // números creerle.
  const cuentaCierra = importados + fallidos === procesadas;
  const sinProcesar = totalFilas - procesadas;

  const estilos = {
    completo:
      "border-(--color-exito) bg-(--color-exito-suave) text-(--color-exito)",
    conErrores:
      "border-(--color-atencion) bg-(--color-atencion-suave) text-(--color-atencion)",
    interrumpido:
      "border-(--color-primario) bg-(--color-primario-suave) text-(--color-primario)",
  };

  const iconos = { completo: "✓", conErrores: "⚠", interrumpido: "↻" };

  return (
    <div className="flex flex-col gap-4">
      <section
        // `status` y no `alert`: ninguno de los tres estados es un error de la
        // aplicación, ni siquiera el interrumpido. El 400 —que sí lo es— se
        // muestra en la pantalla, fuera de este componente.
        role="status"
        className={`rounded-(--radius) border-2 p-4 ${estilos[estado]}`}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            {iconos[estado]}
          </span>

          <div className="flex-1">
            {estado === "interrumpido" && (
              // Va primero, antes que cualquier número: es lo que evita que el
              // usuario salga de acá pensando que armó mal la planilla.
              <p className="font-extrabold">No es un problema de tu archivo.</p>
            )}

            <h2
              className={`text-lg font-extrabold ${
                estado === "interrumpido" ? "mt-1" : ""
              }`}
            >
              {estado === "completo"
                ? `Se importaron los ${importados} productos del archivo.`
                : `Se importaron ${importados} de ${totalFilas} productos.`}
            </h2>

            {estado === "conErrores" && (
              <p className="mt-2 text-(--color-texto)">
                {fallidos === 1
                  ? "1 fila quedó sin cargar."
                  : `${fallidos} filas quedaron sin cargar.`}{" "}
                Corregilas en tu archivo y volvé a subirlo — las que ya entraron
                se van a informar como duplicadas.
              </p>
            )}

            {estado === "interrumpido" && (
              <div className="mt-2 flex flex-col gap-2 text-(--color-texto)">
                {/*
                  Los dos denominadores conviven a propósito y cada uno responde
                  algo distinto: `totalFilas` dice cuánto del archivo falta, que
                  es lo que el usuario necesita saber, y `procesadas` es el
                  único contra el que el desglose cierra. Presentar
                  `importados` y `fallidos` como si repartieran `totalFilas`
                  es exactamente lo que hace que los números no den.
                */}
                {cuentaCierra && (
                  <p>
                    {fallidos > 0
                      ? `Se alcanzaron a procesar ${procesadas} filas y ${fallidos} quedaron con error.`
                      : `Se alcanzaron a procesar ${procesadas} filas.`}{" "}
                    {sinProcesar > 0 &&
                      (sinProcesar === 1
                        ? "La fila que falta no se procesó."
                        : `Las ${sinProcesar} filas que faltan no se procesaron.`)}
                  </p>
                )}

                {/* Texto del backend, sin reescribir: ya le explica que vuelva
                    a subir el mismo archivo y qué va a pasar con lo ya cargado. */}
                <p>{interrupcion?.motivo}</p>

                {interrupcion?.fila != null && (
                  <p className="text-sm text-(--color-texto-apagado)">
                    Se cortó en la fila {interrupcion.fila}.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {estado === "interrumpido" && (
          <div className="mt-4 flex flex-wrap gap-3">
            {/* Reusa el mismo `File` que ya está en el estado de la pantalla:
                el motivo le pide volver a subir el archivo, y mandarlo a
                buscarlo de nuevo en el explorador sería pedirle el trabajo dos
                veces. */}
            <button
              type="button"
              onClick={alReintentar}
              disabled={subiendo}
              className={CLASES_BOTON_PRIMARIO}
            >
              {subiendo ? "Importando…" : "Volver a subir el mismo archivo"}
            </button>
          </div>
        )}
      </section>

      {fallidos > 0 && (
        <section
          className={
            estado === "interrumpido"
              ? // Subordinada al bloque de la interrupción: las filas con
                // error existen, pero lo primero que hay que entender es que
                // la carga no terminó.
                "rounded-(--radius) border-2 border-(--color-atencion) bg-(--color-atencion-suave) p-4"
              : ""
          }
        >
          {estado === "interrumpido" && (
            <p className="font-bold text-(--color-atencion)">
              Además, {fallidos === 1 ? "1 fila tenía" : `${fallidos} filas tenían`}{" "}
              datos para corregir.
            </p>
          )}
          <ListaDeErrores errores={reporte.errores} />
        </section>
      )}

      <ListaDeImportados productos={reporte.productos} />

      <div className="flex flex-wrap gap-3">
        <Link to="/productos" className={CLASES_BOTON_PRIMARIO}>
          Ver el catálogo
        </Link>
        <button
          type="button"
          onClick={alImportarOtro}
          className={CLASES_BOTON_SUAVE}
        >
          Importar otro archivo
        </button>
      </div>
    </div>
  );
}
