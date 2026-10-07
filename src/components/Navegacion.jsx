import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  CirclePlus,
  Ellipsis,
  History,
  House,
  LogOut,
  Package,
  ScanBarcode,
  Settings,
  Store,
} from "lucide-react";
import { usePermisos } from "../hooks/usePermisos";
import { cerrarSesion } from "../services/auth";

/**
 * Navegación principal de la app: sidebar en escritorio, barra abajo en
 * celular.
 *
 * Es UNA sola `<nav>` que cambia de forma con CSS, y no dos navegaciones (una
 * por tamaño) escondiendo la que no corresponde. Con dos, cada link existiría
 * dos veces en el HTML, y cualquier búsqueda por nombre —la de un lector de
 * pantalla, o la de un test— encontraría dos.
 *
 * Los accesos vivían en Inicio y se mudaron acá, con su nombre accesible y su
 * `data-testid` intactos. Son el contrato con los E2E (`soporte/accesos.js` y
 * los specs que entran por «Productos», «Configuración», «Historial de
 * movimientos»…), y por eso cada uno existe una sola vez en la página: si
 * siguieran también en Inicio, habría dos de cada uno.
 *
 * Las mismas reglas de HU-32 que tenía Inicio:
 *
 * - Cada acceso se muestra solo si el rol puede usar la pantalla, preguntando
 *   por ACCIÓN y no por rol. Se OCULTA, no se deshabilita.
 * - `puedeSalvoQueFalle`: si la consulta de permisos falla se muestran todos
 *   (mostrar de más arriesga un 403 explicado; esconder deja la app rota).
 * - Mientras está en vuelo no se muestra ninguno de los que dependen del rol:
 *   ver aparecer un acceso y desaparecer es peor que verlo llegar después.
 *
 * Tres decisiones que cuidan a los tests y a los lectores de pantalla:
 *
 * - Sin `<ul>/<li>`: hay tests que buscan `listitem` en toda la página, y los
 *   ítems del menú se les sumarían.
 * - Sin títulos (`<h1>`, `<h2>`): los títulos son de cada pantalla.
 * - En celular el texto visible es más corto ("Movimientos"), pero el nombre
 *   accesible no cambia: lo fija `aria-label`, así que el contrato es el mismo
 *   en cualquier tamaño de pantalla. El texto visible siempre está contenido en
 *   el nombre, como pide WCAG ("label in name").
 */

const CLASE_ITEM_BASE =
  "flex items-center gap-3 rounded-full px-4 py-2.5 font-bold transition " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)";

const CLASE_ITEM_ACTIVO =
  "bg-(--color-primario) text-(--color-primario-texto) shadow-sm";

/** En la barra de celular: ícono arriba y texto chico, repartidos a lo ancho. */
const CLASE_ITEM_EN_BARRA =
  "max-lg:flex-1 max-lg:flex-col max-lg:gap-1 max-lg:px-1 max-lg:py-2 max-lg:text-xs";

const CLASE_ITEM_INACTIVO =
  "text-(--color-texto) hover:bg-(--color-apagado)";

/**
 * Si `ruta` es la pantalla actual. `exacta` para las que tienen subpantallas
 * propias en el menú; `excepto`, para las subpantallas que tienen su propio
 * acceso (`/productos/escanear` no marca también a Productos).
 */
function estaActiva(pathname, ruta, { exacta = false, excepto = [] } = {}) {
  if (excepto.includes(pathname)) return false;
  if (exacta) return pathname === ruta;
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/**
 * Un acceso de la navegación. Afuera de `Navegacion` a propósito: definido
 * adentro, React lo trataría como un componente nuevo en cada render, volvería
 * a montar los links y se perdería el foco de quien navega con teclado.
 *
 * `etiqueta` es el nombre accesible (el contrato); `corta`, lo que se ve en
 * la barra de celular cuando hay que abreviar. `enBarra` para los que van en
 * la barra de celular (ícono arriba, texto chico); los del panel "Más" van en
 * fila, como en la sidebar.
 */
function Acceso({ pathname, a, etiqueta, corta, icono: Icono, testId, exacta, excepto, enBarra }) {
  const activa = estaActiva(pathname, a, { exacta, excepto });

  return (
    <Link
      to={a}
      data-testid={testId}
      aria-label={corta ? etiqueta : undefined}
      aria-current={activa ? "page" : undefined}
      className={`${CLASE_ITEM_BASE} ${
        activa ? CLASE_ITEM_ACTIVO : CLASE_ITEM_INACTIVO
      } ${enBarra ? CLASE_ITEM_EN_BARRA : ""}`}
    >
      <Icono aria-hidden="true" className="size-5 shrink-0" />
      {corta ? (
        <>
          <span className="lg:hidden">{corta}</span>
          <span className="max-lg:hidden">{etiqueta}</span>
        </>
      ) : (
        <span>{etiqueta}</span>
      )}
    </Link>
  );
}

export default function Navegacion() {
  const { puedeSalvoQueFalle: puede, resuelto, configuracion } = usePermisos();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  // El "Más" solo existe en celular: en escritorio todo entra en la sidebar.
  // Se guarda EN QUÉ pantalla se abrió, y no un booleano: al navegar queda
  // cerrado solo —se abrió para elegir algo, y ya se eligió— sin un efecto que
  // lo cierre (un setState en un efecto es un render de más).
  const [masAbiertoEn, setMasAbiertoEn] = useState(null);
  const masAbierto = masAbiertoEn === pathname;

  async function salir() {
    await cerrarSesion();
    // Al login: quien cierra sesión ya tiene cuenta, no necesita crear otra.
    navegar("/login", { replace: true });
  }

  const nombreComercio = configuracion?.nombre;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-(--color-borde)
                 bg-(--color-tarjeta) px-2 py-1.5
                 lg:sticky lg:top-4 lg:m-4 lg:flex lg:h-[calc(100vh-2rem)] lg:w-72
                 lg:shrink-0 lg:flex-col lg:rounded-[2rem] lg:border-2 lg:p-4
                 lg:shadow-sm"
    >
      {/* Marca: solo en escritorio. En la barra de celular no hay lugar. */}
      <div className="mb-6 hidden items-center gap-3 px-2 pt-1 lg:flex">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-(--color-primario) text-(--color-primario-texto)">
          <Store aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-extrabold text-(--color-texto)">
            {nombreComercio || "Mi comercio"}
          </span>
          <span className="block text-sm text-(--color-texto-apagado)">
            Gestión comercial
          </span>
        </span>
      </div>

      {/*
        El mismo texto de carga que tenía Inicio. `soporte/accesos.js` espera a
        que desaparezca para saber que los permisos llegaron.
      */}
      {!resuelto && (
        <p className="px-4 py-2 text-sm text-(--color-texto-apagado) max-lg:hidden">
          Cargando accesos…
        </p>
      )}

      {/* Principales: en celular son la barra; en escritorio, la parte de arriba. */}
      <div className="flex gap-1 lg:flex-col">
        <Acceso pathname={pathname} a="/" etiqueta="Inicio" icono={House} exacta enBarra />

        {resuelto && puede("movimiento", "create") && (
          <Acceso
            pathname={pathname}
            a="/movimientos/nuevo"
            etiqueta="Registrar movimiento"
            corta="Registrar"
            icono={CirclePlus}
            testId="acceso-registrar-movimiento"
            enBarra
            exacta
          />
        )}

        {resuelto && puede("movimiento", "read") && (
          <Acceso
            pathname={pathname}
            a="/movimientos"
            etiqueta="Historial de movimientos"
            corta="Movimientos"
            icono={History}
            testId="acceso-historial"
            enBarra
            exacta
          />
        )}

        {resuelto && puede("producto", "read") && (
          <Acceso
            pathname={pathname}
            a="/productos"
            etiqueta="Productos"
            icono={Package}
            testId="acceso-productos"
            enBarra
            excepto={["/productos/escanear"]}
          />
        )}

        <button
          type="button"
          onClick={() => setMasAbiertoEn(masAbierto ? null : pathname)}
          aria-expanded={masAbierto}
          className={`${CLASE_ITEM_BASE} ${CLASE_ITEM_INACTIVO} flex-1 flex-col gap-1 px-1 py-2 text-xs lg:hidden`}
        >
          <Ellipsis aria-hidden="true" className="size-5" />
          Más
        </button>
      </div>

      {/*
        Secundarios. En escritorio siempre visibles, debajo de un separador. En
        celular, un panel que se abre con "Más" encima de la barra.
      */}
      <div
        className={`${masAbierto ? "flex" : "hidden"} flex-col gap-1
                    max-lg:absolute max-lg:right-2 max-lg:bottom-full max-lg:mb-2
                    max-lg:w-64 max-lg:rounded-3xl max-lg:border-2
                    max-lg:border-(--color-borde) max-lg:bg-(--color-tarjeta)
                    max-lg:p-2 max-lg:shadow-xl
                    lg:mt-4 lg:flex lg:flex-1 lg:border-t-2 lg:border-(--color-borde)
                    lg:pt-4`}
      >
        {resuelto && puede("transferencia", "create") && (
          <Acceso
            pathname={pathname}
            a="/transferencias"
            etiqueta="Transferir stock"
            icono={ArrowLeftRight}
            testId="acceso-transferir"
          />
        )}

        {/*
          El único acceso que el empleado pierde hoy: la pantalla consulta el
          código contra `producto:create`.
        */}
        {resuelto && puede("producto", "create") && (
          <Acceso
            pathname={pathname}
            a="/productos/escanear"
            etiqueta="Escanear producto"
            icono={ScanBarcode}
            testId="acceso-escanear"
            exacta
          />
        )}

        {/*
          Sin condición: Configuración siempre tiene algo para todos («Mis
          datos», HU-31, es un derecho de los tres roles).
        */}
        <Acceso
          pathname={pathname}
          a="/configuracion"
          etiqueta="Configuración"
          icono={Settings}
          testId="acceso-configuracion"
        />

        <button
          type="button"
          onClick={salir}
          className={`${CLASE_ITEM_BASE} ${CLASE_ITEM_INACTIVO} lg:mt-auto`}
        >
          <LogOut aria-hidden="true" className="size-5 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
