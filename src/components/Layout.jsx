export default function Layout({ children }) {
  return (
    <div className="min-h-screen">
      {/* Acá va el header/nav común a todas las pantallas */}
      <main>{children}</main>
    </div>
  );
}