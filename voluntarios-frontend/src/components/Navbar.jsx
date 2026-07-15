import React, { useState } from 'react';
import { Menu, X, LogOut, User, UsersRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';

export default function Navbar() {
  const [menuAberto, setMenuAberto] = useState(false);
  const { usuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const podeGerenciarEquipe = usuario?.permissoes?.some((permissao) => ['LIDER_EQUIPE', 'ADMINISTRADOR'].includes(permissao));
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-white/60 bg-white/85 shadow-sm backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Logo / Título */}
          <div className="flex items-center">
            <button type="button" onClick={() => navigate('/')} className="font-serif text-2xl font-bold text-dourado-600">
              MCom
            </button>
          </div>

          {/* Links de Navegação - Desktop */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <button type="button" onClick={() => navigate('/')} className="font-sans text-gray-600 hover:text-dourado-600 transition-colors font-medium">
              Início
            </button>
            <button type="button" onClick={() => navigate('/escalas')} className="font-sans text-gray-600 hover:text-dourado-600 transition-colors font-medium">
              Minhas Escalas
            </button>
            {podeGerenciarEquipe && (
              <button type="button" onClick={() => navigate('/minha-equipe')} className="flex items-center gap-2 font-sans text-gray-600 hover:text-dourado-600 transition-colors font-medium">
                <UsersRound size={18} />
                Minha equipe
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => navigate('/admin/escalas')} className="flex items-center gap-2 font-sans text-gray-600 hover:text-dourado-600 transition-colors font-medium">
                <ShieldCheck size={18} />
                Admin escalas
              </button>
            )}
            <button type="button" onClick={() => navigate('/avisos')} className="font-sans text-gray-600 hover:text-dourado-600 transition-colors font-medium">
              Avisos
            </button>
          </div>

          {/* Ações do Usuário - Desktop */}
          <div className="hidden md:flex items-center space-x-4">
            <button type="button" onClick={() => navigate('/perfil')} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-dourado-200 hover:text-dourado-700 focus:outline-none focus:ring-2 focus:ring-dourado-500">
              <User size={20} />
              <span className="max-w-36 truncate">{usuario?.nomeCompleto || 'Perfil'}</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-gray-950 hover:bg-gray-800 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
            >
              <LogOut size={16} />
              <span>Sair</span>
            </button>
          </div>

          {/* Botão Menu Mobile */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setMenuAberto(!menuAberto)}
              className="text-gray-500 hover:text-dourado-600 focus:outline-none p-2"
            >
              {menuAberto ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Mobile Dropdown */}
      {menuAberto && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <button type="button" onClick={() => navigate('/')} className="block w-full px-3 py-2 rounded-md text-left text-base font-medium text-gray-700 hover:text-dourado-600 hover:bg-dourado-50">
              Início
            </button>
            <button type="button" onClick={() => navigate('/perfil')} className="block w-full px-3 py-2 rounded-md text-left text-base font-medium text-gray-700 hover:text-dourado-600 hover:bg-dourado-50">
              Perfil
            </button>
            <button type="button" onClick={() => navigate('/escalas')} className="block w-full px-3 py-2 rounded-md text-left text-base font-medium text-gray-700 hover:text-dourado-600 hover:bg-dourado-50">
              Minhas Escalas
            </button>
            {podeGerenciarEquipe && (
              <button type="button" onClick={() => navigate('/minha-equipe')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-base font-medium text-gray-700 hover:text-dourado-600 hover:bg-dourado-50">
                <UsersRound size={18} />
                Minha equipe
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => navigate('/admin/escalas')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-base font-medium text-gray-700 hover:text-dourado-600 hover:bg-dourado-50">
                <ShieldCheck size={18} />
                Admin escalas
              </button>
            )}
            <button type="button" onClick={() => navigate('/avisos')} className="block w-full px-3 py-2 rounded-md text-left text-base font-medium text-gray-700 hover:text-dourado-600 hover:bg-dourado-50">
              Avisos
            </button>
            <button 
              onClick={handleLogout}
              className="w-full text-left flex items-center space-x-2 px-3 py-2 mt-4 rounded-md text-base font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
