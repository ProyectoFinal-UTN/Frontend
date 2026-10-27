/**
 * Service worker de la app (HU-18): muestra los avisos de reposición.
 *
 * Es un archivo aparte que el navegador instala y deja corriendo por su cuenta,
 * por eso puede mostrar un aviso con la app cerrada. Lo registra
 * `registrarServiceWorker` (services/pushNavegador.js) al cargar la app.
 *
 * Hace solo dos cosas: mostrar lo que manda el backend y abrir la app cuando
 * tocan el aviso. No intercepta pedidos ni guarda nada en caché, así que no
 * cambia cómo carga la app.
 *
 * Va escrito a mano, sin pasar por Vite: lo que está en `public/` se sirve tal
 * cual. Por eso es JavaScript plano, sin imports.
 */

const ICONO = "/iconos/app-192.png";
const INSIGNIA = "/iconos/insignia-96.png";

/** Lo que entiende `escucharAperturas` en services/pushNavegador.js. */
const MENSAJE_ABRIR = "abrir-ruta";

// Que una versión nueva de este archivo tome el control apenas se instala, sin
// esperar a que se cierren todas las pestañas.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

/** El contenido del aviso, o `null` si no vino o no es JSON. */
function leerAviso(evento) {
  try {
    return evento.data ? evento.data.json() : null;
  } catch {
    return null;
  }
}

/**
 * Título y opciones de la notificación.
 *
 * Si el aviso no es uno de reposición, o no se pudo leer, se muestra uno
 * genérico. Chrome exige mostrar algo por cada push que llega: si no, después
 * de unos cuantos castiga al sitio con un aviso propio.
 */
function armarNotificacion(aviso) {
  if (
    aviso?.tipo === "alerta_reposicion" &&
    typeof aviso.productoId === "string"
  ) {
    return {
      titulo: aviso.titulo || "Reponer stock",
      opciones: {
        body: aviso.cuerpo || "",
        icon: ICONO,
        badge: INSIGNIA,
        // Un tag por producto: un aviso nuevo del mismo producto reemplaza al
        // anterior en vez de apilarse, y `renotify` hace que igual suene.
        tag: `reposicion-${aviso.productoId}`,
        renotify: true,
        data: { productoId: aviso.productoId },
      },
    };
  }

  return {
    titulo: "Gestión Comercial PyME",
    opciones: {
      body: "Tenés un aviso nuevo. Tocá para abrir la app.",
      icon: ICONO,
      badge: INSIGNIA,
      data: {},
    },
  };
}

self.addEventListener("push", (evento) => {
  const { titulo, opciones } = armarNotificacion(leerAviso(evento));
  // `waitUntil` mantiene vivo al service worker hasta que el aviso se muestre.
  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

/** La pantalla a abrir: la del producto si el aviso trae uno, si no el inicio. */
function rutaDestino(datos) {
  const id = datos?.productoId;
  return typeof id === "string" && id
    ? `/productos/${encodeURIComponent(id)}`
    : "/";
}

/**
 * Si hay una pestaña de la app abierta, la trae al frente y le pide que vaya a
 * la ruta (la navegación la hace React Router, adentro de la app). Si no hay
 * ninguna, abre una nueva directo en esa ruta.
 */
async function abrir(ruta) {
  const pestanas = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  const propia = pestanas.find(
    (pestana) => new URL(pestana.url).origin === self.location.origin,
  );

  if (propia) {
    try {
      await propia.focus();
    } catch {
      // Algunos navegadores no dejan enfocar: igual se navega.
    }
    propia.postMessage({ tipo: MENSAJE_ABRIR, ruta });
    return;
  }

  await self.clients.openWindow(ruta);
}

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(abrir(rutaDestino(evento.notification.data)));
});
