import { useCallback } from "react";
import { Link } from "react-router-dom";
import EditorDeVinculos from "./EditorDeVinculos";
import {
  asociarProveedor,
  desasociarProveedor,
  obtenerProveedores,
  obtenerProveedoresDeProducto,
} from "../services/proveedores";

/**
 * A quién se le compra este producto (HU-20), en su ficha de stock.
 *
 * Va en el detalle y no en el formulario de edición del catálogo: asociar un
 * proveedor no es editar la ficha, y el detalle es la pantalla adonde llevan
 * las tarjetas de reposición, que es justo cuando hace falta saber a quién
 * pedirle.
 */
export default function ProveedoresDelProducto({ productoId, puedeEditar }) {
  const cargarVinculados = useCallback(
    () => obtenerProveedoresDeProducto(productoId),
    [productoId],
  );
  const asociar = useCallback(
    (proveedorId) => asociarProveedor(productoId, proveedorId),
    [productoId],
  );
  const quitar = useCallback(
    (proveedorId) => desasociarProveedor(productoId, proveedorId),
    [productoId],
  );

  return (
    <section aria-labelledby="titulo-proveedores-del-producto" className="mt-8">
      <h2
        id="titulo-proveedores-del-producto"
        className="text-xl font-extrabold text-(--color-texto)"
      >
        Proveedores
      </h2>
      <p className="mt-1 text-sm text-(--color-texto-apagado)">
        A quién le comprás este producto.
      </p>

      <EditorDeVinculos
        id="proveedorAAsociar"
        cargarVinculados={cargarVinculados}
        cargarOpciones={obtenerProveedores}
        asociar={asociar}
        quitar={quitar}
        puedeEditar={puedeEditar}
        etiquetaSelect="Agregar proveedor"
        textoVacio="Este producto todavía no tiene proveedores asociados."
        sinOpciones={
          <p className="text-sm text-(--color-texto-apagado)">
            Todavía no cargaste proveedores.{" "}
            <Link to="/proveedores" className="font-bold text-(--color-primario) underline">
              Cargar proveedores
            </Link>
          </p>
        }
        renderElemento={(proveedor) => (
          <>
            <p className="font-bold text-(--color-texto)">{proveedor.nombre}</p>
            {(proveedor.telefono || proveedor.correo) && (
              <p className="flex flex-wrap gap-x-3 text-sm">
                {proveedor.telefono && (
                  <a
                    href={`tel:${proveedor.telefono.replace(/[^\d+]/g, "")}`}
                    className="text-(--color-primario) underline"
                  >
                    {proveedor.telefono}
                  </a>
                )}
                {proveedor.correo && (
                  <a
                    href={`mailto:${proveedor.correo}`}
                    className="break-all text-(--color-primario) underline"
                  >
                    {proveedor.correo}
                  </a>
                )}
              </p>
            )}
          </>
        )}
      />
    </section>
  );
}
