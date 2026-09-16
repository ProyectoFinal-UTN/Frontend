import {
  COLUMNAS,
  MAXIMO_FILAS,
  armarPlantillaCsv,
  descargarCsv,
} from "../pages/ImportarProductos.validacion";

/**
 * Lo que el usuario ve antes de confirmar la importación (HU-7).
 *
 * Son dos cosas en una: la ayuda de formato, que está desde antes de elegir
 * archivo, y la tabla de las primeras filas, que aparece cuando ya hay uno.
 * Van juntas a propósito — quien está mirando la previa y no entiende por qué
 * una columna quedó vacía necesita la lista de columnas ahí mismo, no en otra
 * pantalla.
 */

const CLASES_BOTON_SUAVE =
  "rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-4 py-2 text-sm font-bold text-(--color-texto) transition " +
  "hover:border-(--color-primario) focus:outline-none focus:ring-4 " +
  "focus:ring-(--color-primario-suave)";

/**
 * Las columnas que acepta el archivo.
 *
 * Es el bloque que más rechazos evita: el 400 más común es que falte una
 * columna obligatoria, y ese error solo se puede prevenir antes de armar la
 * planilla, no después de subirla.
 */
function AyudaDeFormato() {
  const obligatorias = COLUMNAS.filter((columna) => columna.obligatoria);
  const opcionales = COLUMNAS.filter((columna) => !columna.obligatoria);

  return (
    <section className="rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) p-4">
      <h2 className="text-lg font-extrabold text-(--color-texto)">
        Cómo tiene que estar armado el archivo
      </h2>

      <p className="mt-2 text-sm text-(--color-texto-apagado)">
        La primera fila son los encabezados. No hace falta que los escribas
        exactamente así: se entienden con mayúsculas, con acentos o en una sola
        palabra, y el separador puede ser coma o punto y coma. Las columnas que
        no reconozca (precio, proveedor) las ignora sin rechazar el archivo.
      </p>

      <h3 className="mt-4 text-sm font-bold text-(--color-texto)">
        Obligatorias
      </h3>
      <ul className="mt-2 flex flex-col gap-1">
        {obligatorias.map((columna) => (
          <li key={columna.encabezado} className="text-sm">
            <code className="font-bold text-(--color-texto)">
              {columna.encabezado}
            </code>{" "}
            <span className="text-(--color-texto-apagado)">{columna.ayuda}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-bold text-(--color-texto)">Opcionales</h3>
      <ul className="mt-2 flex flex-col gap-1">
        {opcionales.map((columna) => (
          <li key={columna.encabezado} className="text-sm">
            <code className="font-bold text-(--color-texto)">
              {columna.encabezado}
            </code>{" "}
            <span className="text-(--color-texto-apagado)">{columna.ayuda}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-(--color-texto-apagado)">
        Hasta {MAXIMO_FILAS} productos y 2 MB por archivo.
      </p>

      <button
        type="button"
        onClick={() =>
          descargarCsv("plantilla-catalogo.csv", armarPlantillaCsv())
        }
        className={`mt-4 ${CLASES_BOTON_SUAVE}`}
      >
        Descargar plantilla CSV
      </button>
    </section>
  );
}

/**
 * Las primeras filas del archivo, con su número de fila real.
 *
 * El número que se muestra es la línea del archivo, no la posición en la tabla:
 * la fila 1 son los encabezados, así que la primera de datos es la 2. Es el
 * mismo número que el backend va a usar después para señalar los errores y el
 * mismo que el usuario ve en la columna izquierda de Excel. Si acá se numerara
 * desde 1, el "Fila 7" del resumen mandaría a corregir la fila equivocada.
 */
function TablaDePrevia({ previa }) {
  const restantes = previa.totalFilas - previa.filas.length;

  return (
    <section className="rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) p-4">
      <h2 className="text-lg font-extrabold text-(--color-texto)">
        Vista previa
      </h2>
      <p className="mt-1 text-sm text-(--color-texto-apagado)">
        {previa.totalFilas === 1
          ? "El archivo tiene 1 producto."
          : `El archivo tiene ${previa.totalFilas} productos.`}{" "}
        Revisá que las columnas hayan quedado donde van antes de confirmar.
      </p>

      {/* El scroll horizontal va acá adentro y no en la página: un catálogo con
          siete columnas no entra en un celular, y hacer que se mueva la
          pantalla entera para leerlo es peor que mover solo la tabla. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <caption className="sr-only">
            Primeras {previa.filas.length} filas del archivo
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b-2 border-(--color-borde) px-2 py-2 font-bold text-(--color-texto-apagado)"
              >
                Fila
              </th>
              {previa.encabezados.map((encabezado, indice) => (
                <th
                  // Los encabezados de un CSV cualquiera pueden venir repetidos
                  // o vacíos, así que el índice es la única clave estable.
                  key={`${encabezado}-${indice}`}
                  scope="col"
                  className="border-b-2 border-(--color-borde) px-2 py-2 font-bold text-(--color-texto)"
                >
                  {encabezado || <span className="italic">(sin nombre)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previa.filas.map(({ fila, celdas }) => (
              <tr key={fila}>
                <th
                  scope="row"
                  className="border-b border-(--color-borde) px-2 py-2 font-bold text-(--color-texto-apagado)"
                >
                  {fila}
                </th>
                {previa.encabezados.map((encabezado, indice) => (
                  <td
                    key={`${fila}-${indice}`}
                    className="border-b border-(--color-borde) px-2 py-2 text-(--color-texto)"
                  >
                    {celdas[indice] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {restantes > 0 && (
        <p className="mt-3 text-sm text-(--color-texto-apagado)">
          y {restantes} {restantes === 1 ? "fila más" : "filas más"}.
        </p>
      )}
    </section>
  );
}

export default function VistaPreviaCsv({ previa }) {
  return (
    <div className="flex flex-col gap-4">
      <AyudaDeFormato />
      {previa && previa.filas.length > 0 && <TablaDePrevia previa={previa} />}
    </div>
  );
}
