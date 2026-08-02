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

## Variables de entorno

Este proyecto **no necesita `.env`** en condiciones normales. Gracias al proxy de desarrollo (y a Nginx en producción), el frontend nunca necesita saber la URL real del backend ni manejar secretos.

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

## Convenciones de Git

- Rama principal: `main`, protegida (requiere al menos un review antes de mergear).
- Mismo criterio que en `Backend`: commits descriptivos, no genéricos.

## Troubleshooting

- **`npx tailwindcss init -p` falla con "could not determine executable to run"**: es esperado, Tailwind v4 eliminó ese comando. La instalación correcta es vía `@tailwindcss/vite`, ya configurada en este repo — no hace falta volver a correr eso.
- **Error de Git al instalar un paquete con scope** (ej. intentar instalar `tailwindcss/vite` sin la `@`): revisar que el nombre del paquete lleve el `@` pegado (`@tailwindcss/vite`), sin espacio. Sin la arroba, npm intenta clonarlo como si fuera un repo de GitHub y falla.
- **`type nul >` no funciona para crear un archivo vacío**: ese comando es de `cmd.exe`, no de Git Bash. En Git Bash usar `touch nombre-del-archivo`.
- **Los estilos de Tailwind no se aplican**: confirmar que `src/index.css` tiene `@import "tailwindcss";` (y no las 3 líneas viejas de `@tailwind base/components/utilities`, que son de la v3).