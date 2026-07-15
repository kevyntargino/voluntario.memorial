export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 shadow-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center">
        <p className="text-sm text-gray-500">
          &copy; {new Date().getFullYear()} MCom. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
