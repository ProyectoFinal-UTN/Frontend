/**
 * Lectura del CSV en el navegador para la vista previa de la importación (HU-7).
 *
 * Vive aparte de la pantalla —igual que `Productos.validacion.js`— para poder
 * probar las reglas sin renderizar nada, y porque un archivo de componente que
 * exporta funciones sueltas rompe el Fast Refresh de Vite.
 *
 * ## Esto NO es el parser del backend, y es a propósito
 *
 * El backend es la única autoridad sobre qué entra: tiene su propia lectura del
 * CSV, su lista larga de alias de encabezados, y la validación real de cada
 * fila. Lo de acá existe para dos cosas y nada más:
 *
 * 1. Mostrarle al usuario lo que está por subir, antes de subirlo.
 * 2. Frenar el ida y vuelta obvio (extensión, tamaño, falta una columna
 *    obligatoria) que si no se paga con una subida de 2 MB para recibir un 400.
 *
 * Por eso el reconocimiento de encabezados de acá es **deliberadamente más
 * pobre** que el del backend: cubre las variantes normales (acentos, mayúsculas,
 * camelCase, guiones bajos) y se queda ahí. Un archivo que pase este chequeo y
 * el backend igual rechace con 400 es el comportamiento esperado, no un bug: se
 * muestra ese 400 y listo.
 *
 * La tentación que hay que resistir es sincronizar esta lista con
 * `ALIAS_POR_CAMPO` del backend. Duplicar esa heurística significa mantenerla en
 * dos repos, y el día que se desincronicen el frontend va a estar rechazando
 * archivos que el backend acepta — que es el peor de los dos errores posibles.
 */

/** Tope de `subidaCsv.middleware.js`. Duplicarlo acá evita subir para nada. */
const TAMANO_MAXIMO_MB = 2;
const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024;

/** Tope de `MAXIMO_FILAS` en `productosImportacion.service.js`. */
export const MAXIMO_FILAS = 1000;

/** Cuántas filas se muestran en la vista previa. */
export const FILAS_EN_PREVIA = 10;

/**
 * Las columnas, como se le explican al usuario en la pantalla de ayuda.
 *
 * `ejemplo` alimenta la plantilla descargable, así que lo que se ve en la ayuda
 * y lo que trae el archivo de ejemplo no pueden divergir.
 */
export const COLUMNAS = [
  {
    encabezado: "nombre",
    obligatoria: true,
    ayuda: "Cómo se llama el producto.",
    ejemplo: ["Yerba Playadito 1kg", "Fideos Matarazzo 500g"],
  },
  {
    encabezado: "codigo_barras",
    obligatoria: true,
    ayuda: "Solo números, de 6 a 64 dígitos.",
    ejemplo: ["7790895000782", "7790070410016"],
  },
  {
    encabezado: "categoria",
    obligatoria: true,
    ayuda: "El rubro con el que lo agrupás.",
    ejemplo: ["Almacén", "Almacén"],
  },
  {
    encabezado: "unidad_medida",
    obligatoria: true,
    ayuda: "unidad, kg, g, l, ml, caja, paquete o docena.",
    ejemplo: ["unidad", "paquete"],
  },
  {
    encabezado: "umbral_minimo",
    obligatoria: false,
    ayuda: "Cuándo avisarte que queda poco. Vacío es 0.",
    ejemplo: ["5", "10"],
  },
  {
    encabezado: "stock_actual",
    obligatoria: false,
    ayuda: "Cuánto tenés hoy. Vacío es 0.",
    ejemplo: ["24", "0"],
  },
  {
    encabezado: "ubicacion",
    obligatoria: false,
    ayuda: "El nombre de la ubicación, tal como la creaste. Vacío usa la principal.",
    ejemplo: ["Depósito", ""],
  },
];

/**
 * Alias aceptados por campo obligatorio, ya normalizados.
 *
 * Versión corta y tolerante de la del backend (ver el comentario de arriba).
 * Solo están los cuatro obligatorios porque son los únicos que se chequean:
 * que falte una opcional no invalida nada.
 */
const ALIAS_OBLIGATORIOS = {
  nombre: ["nombre", "producto", "articulo"],
  codigo_barras: [
    "codigo_barras",
    "codigo_de_barras",
    "codigobarras",
    "cod_barras",
    "ean",
  ],
  categoria: ["categoria", "rubro"],
  unidad_medida: ["unidad_medida", "unidad_de_medida", "unidadmedida", "unidad"],
};

/**
 * Chequeos que se pueden hacer sin abrir el archivo.
 *
 * Corren apenas se elige, antes de leerlo y mucho antes de subirlo: enterarse
 * de que el archivo pesa 5 MB después de haberlo subido es la peor versión del
 * mismo mensaje, sobre todo desde el celular en el negocio.
 *
 * @returns {{valido: boolean, motivo: string}}
 */
export function validarArchivo(archivo) {
  if (!archivo) {
    return { valido: false, motivo: "Elegí un archivo CSV para continuar." };
  }

  if (!/\.csv$/i.test(archivo.name ?? "")) {
    return {
      valido: false,
      motivo:
        "El archivo tiene que ser un .csv. Si lo tenés en Excel, usá " +
        '"Guardar como" y elegí CSV.',
    };
  }

  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return {
      valido: false,
      motivo: `El archivo pesa ${mb} MB y el máximo es ${TAMANO_MAXIMO_MB} MB. Dividilo en partes y subilas de a una.`,
    };
  }

  // Un CSV de 0 bytes no llega ni a tener encabezados. El backend también lo
  // rechaza, pero avisarlo acá ahorra la subida.
  if (archivo.size === 0) {
    return { valido: false, motivo: "El archivo está vacío." };
  }

  return { valido: true, motivo: "" };
}

/**
 * Deja un texto comparable: sin acentos, en minúscula y sin espacios de sobra.
 *
 * Nadie escribe los acentos igual dos veces y "Código" no debería fallar contra
 * "codigo". `\p{Diacritic}` en vez de un rango de combinantes escrito a mano,
 * para no dejar caracteres invisibles en el fuente.
 */
function sinAcentos(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/** `"Código de Barras"` → `codigo_de_barras`. */
function normalizarEncabezado(valor) {
  return sinAcentos(valor)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Elige el separador mirando solo la línea de encabezados.
 *
 * Excel en configuración regional es-AR exporta con `;`, porque la coma es el
 * separador decimal — y ese es el archivo que el comercio va a subir de verdad.
 * Se mira la primera línea y no todo el texto para que una coma dentro del
 * nombre de un producto no incline la decisión.
 */
function detectarDelimitador(texto) {
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length;
  const comas = (primeraLinea.match(/,/g) ?? []).length;

  return puntoYComa > comas ? ";" : ",";
}

/**
 * Parte el texto en filas y celdas, llevando la cuenta de la línea física.
 *
 * Es un recorrido carácter por carácter y no un `split` por dos razones: un
 * campo entrecomillado puede contener el separador (`"Fideos, tallarín"`) y
 * puede contener saltos de línea, con lo cual "una fila" y "una línea" dejan de
 * ser lo mismo. Por eso `fila` es la línea donde **termina** el registro, que es
 * el mismo criterio que usa el backend (`info.lines` de csv-parse) y, por lo
 * tanto, el mismo número que el usuario ve en Excel.
 */
function partirEnFilas(texto, delimitador) {
  const filas = [];
  let celdas = [];
  let celda = "";
  let enComillas = false;
  let linea = 1;

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];

    if (enComillas) {
      if (caracter === '"') {
        // Dos comillas seguidas dentro de un campo entrecomillado son una
        // comilla literal escapada, no el cierre del campo.
        if (texto[i + 1] === '"') {
          celda += '"';
          i += 1;
        } else {
          enComillas = false;
        }
      } else {
        if (caracter === "\n") linea += 1;
        celda += caracter;
      }
      continue;
    }

    if (caracter === '"') {
      enComillas = true;
      continue;
    }

    if (caracter === delimitador) {
      celdas.push(celda);
      celda = "";
      continue;
    }

    if (caracter === "\r") continue;

    if (caracter === "\n") {
      celdas.push(celda);
      filas.push({ fila: linea, celdas });
      celdas = [];
      celda = "";
      linea += 1;
      continue;
    }

    celda += caracter;
  }

  // El último registro no termina en salto de línea si el archivo no lo trae.
  if (celda !== "" || celdas.length > 0) {
    celdas.push(celda);
    filas.push({ fila: linea, celdas });
  }

  return filas;
}

/** Una fila que no tiene ni un dato: línea vacía, o `;;;` de Excel. */
function estaVacia({ celdas }) {
  return celdas.every((celda) => celda.trim() === "");
}

/**
 * Lee el CSV para la vista previa.
 *
 * No valida datos —eso es del backend, fila por fila— sino la forma del archivo:
 * qué columnas trae y qué se va a subir.
 *
 * @param {string} texto contenido del archivo
 * @param {{maxFilas?: number}} opciones cuántas filas devolver para mostrar
 * @returns {{
 *   encabezados: string[],
 *   filas: {fila: number, celdas: string[]}[],
 *   totalFilas: number,
 *   faltantes: string[],
 *   error: string,
 * }}
 */
export function leerCsv(texto, { maxFilas = FILAS_EN_PREVIA } = {}) {
  const vacio = {
    encabezados: [],
    filas: [],
    totalFilas: 0,
    faltantes: [],
    error: "",
  };

  // El BOM (U+FEFF) lo antepone Excel al guardar como "CSV UTF-8". Si no se
  // saca, se pega al primer encabezado y este deja de matchear con nada: el
  // archivo se rechazaría por "falta la columna nombre" aunque esté ahí, con un
  // carácter invisible como única pista. Se escribe escapado y no literal
  // justamente por eso: un BOM suelto en el fuente es invisible acá también.
  const limpio = String(texto ?? "").replace(/^\uFEFF/, "");

  if (limpio.trim() === "") {
    return { ...vacio, error: "El archivo está vacío." };
  }

  const todas = partirEnFilas(limpio, detectarDelimitador(limpio));
  const [encabezado, ...resto] = todas;

  if (!encabezado || estaVacia(encabezado)) {
    return {
      ...vacio,
      error: "La primera línea del archivo tiene que ser la de los encabezados.",
    };
  }

  const encabezados = encabezado.celdas.map((celda) => celda.trim());
  const normalizados = new Set(encabezados.map(normalizarEncabezado));

  // Las filas fantasma se descartan en silencio, igual que en el backend:
  // Excel genera decenas de líneas con solo separadores cuando alguien le dio
  // formato a celdas más abajo de los datos. Mostrarlas en la previa haría que
  // un catálogo de 3 productos se vea como 40 filas.
  const conDatos = resto.filter((fila) => !estaVacia(fila));

  if (conDatos.length === 0) {
    return {
      ...vacio,
      encabezados,
      error: "El archivo no tiene ninguna fila de datos debajo de los encabezados.",
    };
  }

  const faltantes = Object.entries(ALIAS_OBLIGATORIOS)
    .filter(([, alias]) => !alias.some((nombre) => normalizados.has(nombre)))
    .map(([campo]) => campo);

  return {
    encabezados,
    filas: conDatos.slice(0, maxFilas),
    totalFilas: conDatos.length,
    faltantes,
    error: "",
  };
}

/**
 * Arma el CSV de ejemplo que ofrece la pantalla.
 *
 * Separador `;` y no `,` a propósito: el Excel en español que va a abrir este
 * archivo espera `;` y con la coma mete todo en una sola columna, que es
 * exactamente la confusión que la plantilla viene a evitar. El backend acepta
 * los dos, así que no cambia nada del lado del servidor.
 */
export function armarPlantillaCsv() {
  const encabezados = COLUMNAS.map((columna) => columna.encabezado);
  const cuantasFilas = COLUMNAS[0].ejemplo.length;

  const filas = Array.from({ length: cuantasFilas }, (_, indice) =>
    COLUMNAS.map((columna) => columna.ejemplo[indice] ?? "").join(";"),
  );

  return [encabezados.join(";"), ...filas].join("\r\n");
}

/**
 * Arma el CSV con las filas que el backend rechazó, para corregir la planilla
 * con ese listado al lado.
 *
 * El `motivo` viene redactado por el backend y puede traer comas y comillas
 * (`El código de barras "779..." está repetido`), así que cada celda se
 * entrecomilla y las comillas internas se duplican. Sin eso, el archivo se
 * desarma justo en las filas más largas, que son las que más se necesitan.
 */
export function armarCsvDeErrores(errores) {
  const entrecomillar = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;

  const filas = errores.map(({ fila, codigoBarras, motivo }) =>
    [fila, codigoBarras, motivo].map(entrecomillar).join(";"),
  );

  return ["fila;codigo_barras;motivo", ...filas].join("\r\n");
}

/**
 * Baja un texto como archivo, sin pedírselo al servidor.
 *
 * Mismo patrón que `descargarMisDatos` en `services/datosPersonales.js`: se
 * arma un Blob, se dispara un `<a download>` sintético y se libera la URL, que
 * si no queda retenida en memoria hasta recargar la página.
 *
 * El BOM al principio no es decorativo: sin él, Excel abre el CSV en la
 * codificación del sistema y muestra "Almacén" como "AlmacÃ©n". Es el mismo
 * carácter que `leerCsv` saca al leer, del otro lado del viaje.
 */
export function descargarCsv(nombre, contenido) {
  const archivo = new Blob([`\uFEFF${contenido}`], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();

  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
