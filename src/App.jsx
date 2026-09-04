import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RutaProtegida from "./components/RutaProtegida";
import Configuracion from "./pages/Configuracion";
import EscanearProducto from "./pages/EscanearProducto";
import Inicio from "./pages/Inicio";
import Invitacion from "./pages/Invitacion";
import Login from "./pages/Login";
import Productos from "./pages/Productos";
import Registro from "./pages/Registro";
import RegistrarMovimiento from "./pages/RegistrarMovimiento";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/registro" element={<Registro />} />
        <Route path="/login" element={<Login />} />
        {/* Sin RutaProtegida: quien recibe el link puede no tener cuenta. */}
        <Route path="/invitacion/:id" element={<Invitacion />} />
        <Route
          path="/"
          element={
            <RutaProtegida>
              <Inicio />
            </RutaProtegida>
          }
        />
        <Route
          path="/configuracion"
          element={
            <RutaProtegida>
              <Configuracion />
            </RutaProtegida>
          }
        />
        <Route
          path="/productos"
          element={
            <RutaProtegida>
              <Productos />
            </RutaProtegida>
          }
        />
        <Route
          path="/productos/escanear"
          element={
            <RutaProtegida>
              <EscanearProducto />
            </RutaProtegida>
          }
        />
        <Route
          path="/movimientos/nuevo"
          element={
            <RutaProtegida>
              <RegistrarMovimiento />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
