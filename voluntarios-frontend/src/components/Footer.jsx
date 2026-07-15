import logo from '../assets/logo.png';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 shadow-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <img src={logo} alt="MCom" className="h-7 w-7 object-contain" />
          <span className="text-sm font-bold text-gray-800">MCom</span>
        </div>
        <p className="text-sm text-gray-500">
          &copy; {new Date().getFullYear()} MCom. Todos os direitos reservados.
        </p>
        <p className="text-sm text-gray-500">
          Desenvolvido por <a href="https://www.linkedin.com/in/kevyntargino/" target="_blank" rel="noopener noreferrer" className="text-dourado-600 hover:text-dourado-800 transition-colors">Kevyn Targino</a>
        </p>
      </div>
    </footer>
  );
}
