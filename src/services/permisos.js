import { obtenerConfiguracion } from "./configuracion";

/**
 * Los permisos del rol logueado, leídos una sola vez y compartidos (HU-32).
 *
 * `GET /api/configuracion` devuelve, además de moneda y ubicaciones, el `rol`
 * de quien pregunta y sus `permisos` efectivos. Antes lo pedían por separado
 * Configuración, Productos e Importar: tres requests para el mismo dato. Acá se
 * cachea la respuesta entera y todos leen de la misma.
 *
 * El store es de módulo, con suscriptores, en el mismo espíritu que la sesión
 * reactiva de Better Auth (`auth.js`): cuando los permisos cambian —porque el
 * propietario cambió un rol mientras la app estaba abierta— todas las pantallas
 * montadas se enteran juntas.
 *
 * **La matriz de permisos no vive en este repo.** Acá solo se guarda lo que el
 * backend respondió para este rol. Si mañana cambia qué puede cada uno, se toca
 * `Backend/src/lib/permissions.js` y el Frontend acompaña sin enterarse.
 */

/** `{ configuracion, error, cargando }`. Lo que leen los suscriptores. */
let estado = { configuracion: null, error: null, cargando: false };

/** La request en vuelo, para que N consumidores no disparen N requests. */
let promesa = null;

/**
 * Qué carga es la vigente.
 *
 * Sube cada vez que lo cargado deja de valer: un logout o un refresco. Una
 * respuesta que vuelve con una generación vieja se descarta sin publicar nada.
 *
 * Sin esto pasaban dos cosas feas. Al cerrar sesión con una consulta en vuelo,
 * esa respuesta aterrizaba después y volvía a publicar los permisos del que se
 * acababa de ir. Y dos refrescos seguidos podían aplicarse al revés, dejando en
 * pantalla una respuesta más vieja que la última —por ejemplo, sin la ubicación
 * que se acababa de crear—.
 */
let generacion = 0;

const oyentes = new Set();

function publicar(siguiente) {
  // Objeto nuevo en cada cambio: `useSyncExternalStore` compara por identidad y
  // mutar el anterior no dispararía ningún re-render.
  estado = { ...estado, ...siguiente };
  for (const oyente of oyentes) oyente();
}

/**
 * Pide la configuración si no está pedida ya, y devuelve la misma promesa a
 * todo el que pregunte mientras esté en vuelo.
 */
export function cargarConfiguracion() {
  if (promesa) return promesa;

  const mia = generacion;

  publicar({ cargando: true, error: null });

  promesa = obtenerConfiguracion()
    .then((configuracion) => {
      // Llegó tarde: entre el pedido y la respuesta hubo un logout o un
      // refresco, así que esto ya no representa a quien está usando la app.
      if (mia !== generacion) return null;

      publicar({ configuracion, error: null, cargando: false });
      return configuracion;
    })
    .catch((fallo) => {
      // Un fallo viejo tampoco se publica, y sobre todo no toca `promesa`: la
      // que está ahí ahora es de una carga más nueva, y anularla dispararía una
      // tercera request y dejaría a los consumidores esperando de más.
      if (mia !== generacion) return null;

      // La promesa fallada NO se cachea: si quedara, el error se volvería
      // permanente para toda la vida de la pestaña y ningún reintento —ni el
      // botón de la pantalla, ni un refresco tras un 403— podría sacarlo.
      promesa = null;
      publicar({ error: fallo, cargando: false });
      // No se relanza: quien se suscribe lee el error del estado. Relanzarlo
      // dejaría una promesa rechazada sin manejar por cada pantalla montada.
      return null;
    });

  return promesa;
}

/**
 * Vuelve a preguntar y avisa a todos.
 *
 * Se llama tras un 403 de permisos (se los pudieron haber cambiado hace un
 * segundo) y cuando la propia pantalla de Configuración modifica algo que
 * viaja en esta respuesta, como crear una ubicación.
 */
export function refrescarPermisos() {
  generacion += 1;
  promesa = null;
  return cargarConfiguracion();
}

/**
 * Tira la caché sin volver a pedir.
 *
 * Al cerrar sesión es obligatorio: si no, entrar con otra cuenta en la misma
 * pestaña reusa los permisos del rol anterior y la UI le ofrece a un empleado
 * lo que veía el propietario. Los tests lo usan para no filtrar estado de un
 * caso al siguiente.
 */
export function olvidarPermisos() {
  // Primero la generación: lo que ya esté en vuelo tiene que aterrizar sin
  // publicar nada. Si no, la respuesta del rol que se fue vuelve a entrar un
  // instante después y deja sus permisos puestos para quien entre ahora —que
  // es justamente lo que esta función existe para impedir—.
  generacion += 1;
  promesa = null;
  publicar({ configuracion: null, error: null, cargando: false });
}

export function suscribir(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function leer() {
  return estado;
}
