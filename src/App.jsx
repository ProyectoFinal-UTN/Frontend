import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import EscanearProducto from "./pages/EscanearProducto";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/productos/escanear" element={<EscanearProducto />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
