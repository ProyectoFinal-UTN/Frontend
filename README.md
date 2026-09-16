# Frontend — Centralización y Optimización de la Gestión Comercial

Aplicación web del proyecto. React + Vite + Tailwind CSS v4, consumiendo la API del backend a través de un proxy de desarrollo.

## Stack

- **React** (con Vite como bundler y dev server)
- **Tailwind CSS v4** (integrado vía plugin de Vite, sin `tailwind.config.js` ni PostCSS manual)
- **React Router** (`react-router-dom`) — instalado, pendiente de uso hasta que arranque la primera Épica con pantallas reales
- **ESLint** como linter

## Requisitos previos

- Node.js en la versión indicada en `.nvmrc` (usar `nvm use` si tenés nvm instalado)
- El repo `Backend` corriendo en paralelo en `http://localhost:4000` (ver su propio README) para poder probar llamadas reales a la API

## Instalación

```bash
git clone git@github.com:ProyectoFinal-UTN/Frontend.git
cd Frontend
npm install
```

## Levantar el proyecto en desarrollo

```bash
npm run dev
```

- App disponible en `http://localhost:5173`
- Cualquier llamada a `/api/...` se redirige automáticamente al backend en `http://localhost:4000` (configurado en `vite.config.js`, sección `server.proxy`) — **nunca hardcodear la URL del backend en el código**, siempre usar rutas relativas como `/api/productos`.

## Probar la cámara desde un celular real

Los navegadores bloquean `getUserMedia` (cámara) fuera de un "contexto seguro" — HTTPS, salvo la excepción de `localhost`. `npm run dev` normal alcanza para probar la cámara **en la misma PC**, pero no desde un celular conectado por la IP de LAN (ej. `http://192.168.0.5`): ahí el navegador la bloquea aunque el resto de la app funcione bien. Hace falta HTTPS + que el celular pueda alcanzar el puerto de la PC.

Esto es un atajo rápido para una prueba puntual con el dev server (sin Docker). Si lo que hace falta es levantar el stack completo con HTTPS (Backend + Nginx incluidos), esa es la vía documentada en el repo `Infraestructura` (`chore/https-local-mkcert`, con mkcert).

**No cambia nada del día a día**: `npm run dev` sigue siendo HTTP en localhost, como siempre. Esto es un comando aparte, opt-in.

1. Levantar el Backend normal (`npm run dev` en `Backend`, puerto 4000).
2. Levantar el Frontend con HTTPS + escuchando en la red:
   ```bash
   npm run dev:lan
   ```
   La terminal va a mostrar algo como `Network: https://192.168.x.x:5173/` (o el puerto que haya quedado libre — Vite salta al siguiente si el 5173 está ocupado). Esa es la URL que necesita el celular. Certificado autofirmado: el navegador del celular va a mostrar una advertencia de seguridad, hay que aceptarla ("Avanzado" → "Visitar este sitio de todas formas" o el texto equivalente) — es esperado, no es un error.
3. **Windows Firewall bloquea esto por defecto.** Si el celular no logra ni conectar (no llega a mostrar la advertencia de HTTPS, directamente no carga nada), hace falta abrir el puerto una vez, desde una PowerShell **como administrador**:
   ```powershell
   New-NetFirewallRule -DisplayName "Vite dev server LAN" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow -Profile Any
   ```
   (ajustar `5173` al puerto real que mostró Vite, si saltó a otro).
4. El Backend tiene que aceptar ese origin. Agregar en `Backend/.env` (no se commitea, es local):
   ```
   TRUSTED_ORIGINS=http://localhost:5173,https://<IP-de-tu-PC>:<puerto>
   ```
   y reiniciar el Backend para que lo tome. Sin esto, Better Auth rechaza los pedidos del celular con `Invalid origin` — el registro/login se queda colgado sin avisar nada visible en pantalla.
5. En el celular, tenés que estar en la **misma red Wi-Fi** que la PC. Las cookies de sesión son por navegador: si ya te registraste desde la PC, en el celular hace falta crear una cuenta de prueba aparte (o loguearte con la misma, si ya existe).

### Troubleshooting de este modo

- **El celular no conecta a nada** (ni siquiera la advertencia de certificado): firewall de Windows, ver paso 3. Confirmá antes que el celular y la PC están en la misma red (`ping <IP-de-tu-PC>` desde otra PC en la misma red, o simplemente confirmar el mismo nombre de Wi-Fi en ambos — routers con banda de 2.4GHz/5GHz separadas a veces las nombran distinto).
- **"Invalid origin" al registrarte/loguearte desde el celular**: falta el origin en `TRUSTED_ORIGINS` del Backend (paso 4), o el Backend no se reinició después de editarlo — un simple `nodemon` restart (guardar cualquier archivo `.js` del backend) alcanza para que lo tome, no hace falta matar el proceso a mano.
- **La cámara da negro pero el ícono del navegador muestra que está prendida**: no es este setup, es el bug que ya se arregló en `useEscanerCodigoBarras.js` (ver el PR de HU-10) — confirmá que estás en una rama que ya lo tiene.

## Docker

Este repo incluye un `Dockerfile` multi-etapa: primero compila la app con Node (`npm run build`), después descarta Node y sirve el resultado (`dist/`) con un Nginx liviano propio de este contenedor. Ese Nginx interno es distinto del Nginx principal del repo `Infraestructura` — este solo sirve los archivos estáticos ya compilados, no hace de reverse proxy.

Al igual que el backend, **no se usa de forma aislada** — se construye y orquesta junto con `Backend` y `Nginx` desde `docker-compose.yml` en el repo `Infraestructura`, que referencia este repo como contexto de build.

Para desarrollo del día a día, seguir usando `npm run dev` como se indica arriba.

Si se necesita construir la imagen de este repo de forma aislada (poco común, mayormente para debug):

```bash
docker build -t frontend .
```

## Variables de entorno

Este proyecto **no necesita `.env`** en condiciones normales. En desarrollo, el proxy de Vite resuelve las llamadas a `/api/...`. En producción, el frontend se despliega en **Vercel** como sitio estático independiente — no detrás de Nginx —, por lo que el consumo de `/api/...` deberá apuntar a la URL pública del backend en Render (a definir cuando se configure el despliegue). El frontend nunca maneja secretos en ningún escenario.

Si en algún momento se necesita una variable pública (no secreta, por ejemplo un flag de feature), Vite usa el prefijo `VITE_` y queda expuesta en el build final — **nunca poner ahí claves de API ni nada sensible**, ya que cualquiera puede leerlas inspeccionando el JS compilado.

## Estructura de carpetas

```
src/
├── assets/          # imágenes, íconos, recursos estáticos
├── components/       # piezas de UI reutilizables entre varias páginas
├── hooks/             # lógica reutilizable (ej: useAuth)
├── pages/            # una por pantalla (Login, Dashboard, Productos, etc.)
├── services/          # funciones que llaman a la API (usan api.js)
├── App.jsx
├── index.css
└── main.jsx
```

**Regla**: ninguna página llama a `fetch` directo. El flujo siempre es:

```
página (pages/) → service (services/) → api.js → backend
```

## Cómo agregar una pantalla nueva (una Épica nueva)

Seguir el mismo patrón que ya está armado para `Login`. Por ejemplo, para arrancar la pantalla de **productos**:

1. Crear `src/services/productos.js`:

```js
import { apiFetch } from "./api";

export function obtenerProductos() {
  return apiFetch("/productos");
}
```

2. Crear `src/pages/Productos.jsx` usando ese service.
3. Si ya está en uso React Router, agregar la ruta correspondiente en el archivo donde se defina `<Routes>` (a crear cuando arranque la primera Épica con navegación real).

## Estilos (Tailwind v4)

- No hay `tailwind.config.js` ni `postcss.config.js` — Tailwind v4 se integra directo vía el plugin `@tailwindcss/vite` en `vite.config.js`.
- Las clases utilitarias de Tailwind se usan directo en el `className` de cada componente.
- Si se necesita personalizar colores, fuentes, etc., se hace con `@theme` dentro de `src/index.css` (no en un archivo de configuración aparte).

## Flujo de trabajo con Git

- **`main`**: versión estable, la que se muestra en cada Sprint Review. Protegida — nadie pushea directo.
- **`dev`**: rama de integración del Sprint en curso. También protegida — nadie pushea directo.
- Cada Historia de Usuario se desarrolla en su propia rama, creada desde `dev`:

```bash
  git checkout dev
  git pull origin dev
  git checkout -b feature/HU1-registro-usuario
```

- Al terminar, se abre un Pull Request hacia `dev` (no hacia `main`), asignando a otro integrante como reviewer.
- La promoción de `dev` → `main` la gestiona la persona a cargo de testing, una vez que los tests de integración (en el repo `Infraestructura`) pasan sobre el estado actual de `dev`.
- Después de mergear una feature branch, borrarla (GitHub lo ofrece con un botón automático al cerrar el PR).
- Commits descriptivos, no genéricos (mismo criterio que en `Backend`).

## Troubleshooting

- **`npx tailwindcss init -p` falla con "could not determine executable to run"**: es esperado, Tailwind v4 eliminó ese comando. La instalación correcta es vía `@tailwindcss/vite`, ya configurada en este repo — no hace falta volver a correr eso.
- **Error de Git al instalar un paquete con scope** (ej. intentar instalar `tailwindcss/vite` sin la `@`): revisar que el nombre del paquete lleve el `@` pegado (`@tailwindcss/vite`), sin espacio. Sin la arroba, npm intenta clonarlo como si fuera un repo de GitHub y falla.
- **`type nul >` no funciona para crear un archivo vacío**: ese comando es de `cmd.exe`, no de Git Bash. En Git Bash usar `touch nombre-del-archivo`.
- **Los estilos de Tailwind no se aplican**: confirmar que `src/index.css` tiene `@import "tailwindcss";` (y no las 3 líneas viejas de `@tailwind base/components/utilities`, que son de la v3).