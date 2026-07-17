import logo from '../assets/ico.png';

export function Footer() {
  return (
    <footer className="mt-auto hidden border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 md:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
        <div className="flex items-center gap-2">
          <img src={logo} alt="MCom" className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">MCom &copy; {new Date().getFullYear()}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Desenvolvido por <a href="https://www.linkedin.com/in/kevyntargino/" target="_blank" rel="noopener noreferrer" className="text-dourado-600 hover:text-dourado-800 transition-colors">Kevyn Targino</a>
        </p>
      </div>
    </footer>
  );
}
