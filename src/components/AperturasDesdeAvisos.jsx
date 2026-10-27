import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { escucharAperturas } from "../services/pushNavegador";

/**
 * Lleva a la pantalla del producto cuando tocan un aviso de reposición con la
 * app ya abierta (HU-18).
 *
 * El service worker enfoca la pestaña y le pide la ruta; acá se navega con
 * React Router, sin recargar. Con la app cerrada no hace falta: el service
 * worker abre una pestaña nueva directo en esa ruta.
 *
 * No dibuja nada. Va en `App`, fuera de `<Routes>`, para estar siempre
 * escuchando sin importar la pantalla.
 */
export default function AperturasDesdeAvisos() {
  const navegar = useNavigate();

  useEffect(() => escucharAperturas((ruta) => navegar(ruta)), [navegar]);

  return null;
}
