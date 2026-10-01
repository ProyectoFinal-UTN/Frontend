import { Link } from "react-router-dom";

/**
 * "Acá no hay nada que puedas hacer todavía", con la salida a mano.
 *
 * Es el estado de una pantalla que cargó bien pero no puede ofrecer su acción:
 * faltan datos que configurar (HU-12, HU-13) o el rol no tiene el permiso
 * (HU-32). No es un error —nada falló— así que va en gris y no en rojo, y no
 * lleva `role="alert"`: no interrumpe al lector de pantalla, se lee cuando
 * llega, como el resto del contenido.
 *
 * Vivía duplicado en `RegistrarMovimiento` y `Transferencias`. HU-32 sumaba una
 * tercera copia en las guardas de ruta, así que se promovió acá.
 *
 * @param {string} mensaje  Qué falta, en criollo.
 * @param {string} [a]      Adónde ir a resolverlo. Sin esto no se muestra link.
 * @param {string} [accion] El texto del link.
 * @param {string} [testId] Para que el E2E de roles pueda afirmar por ausencia.
 */
export default function Bloqueado({ mensaje, a, accion, testId }) {
  return (
    <div
      data-testid={testId}
      className="rounded-(--radius) bg-(--color-apagado) px-4 py-8 text-center"
    >
      <p className="font-bold text-(--color-texto)">{mensaje}</p>
      {/*
        El link es opcional: cuando a alguien le falta un permiso no hay ninguna
        pantalla adonde mandarlo a dárselo a sí mismo. Ofrecerle un botón que no
        resuelve nada es peor que no ofrecerle ninguno.
      */}
      {a && accion && (
        <Link
          to={a}
          className="mt-3 inline-block text-sm font-bold text-(--color-primario) underline"
        >
          {accion}
        </Link>
      )}
    </div>
  );
}
