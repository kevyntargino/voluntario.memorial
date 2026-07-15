import React, { useEffect, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  
  // Estados para gerenciar feedback visual da API
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const { navigate } = useNavigation();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro(''); // Limpa erros anteriores
    
    // Validação inicial no frontend (evita chamadas desnecessárias à API)
    if (!email || !senha) {
      setErro('Por favor, preencha e-mail e senha.');
      return;
    }
    
    setCarregando(true);

    try {
      // Faz a requisição POST para a sua API Node/Express
      // (Lembre-se de ajustar a URL base conforme o endereço onde sua API estiver rodando)
      const resposta = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, senha }), // Envia os dados exigidos pelo backend
      });

      const dados = await resposta.json();

      // Se o status da resposta não for OK (ex: 400, 401, 500)
      if (!resposta.ok) {
        // Exibe a mensagem de erro vinda diretamente do backend ("E-mail ou senha incorretos.")
        setErro(dados.erro || 'Ocorreu um erro inesperado ao fazer login.');
        return;
      }

      // Sucesso: A API retornou o status 200, o token e os dados do usuário
      console.log(dados.mensagem);

      // Salva o Token JWT e as informações do usuário no localStorage do navegador
      login(dados.token, dados.usuario);
      navigate('/', { replace: true });

    } catch (erroNaRequisicao) {
      console.error('Erro na chamada da API:', erroNaRequisicao);
      setErro('Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
    } finally {
      // Independente de sucesso ou falha, finaliza o estado de carregamento
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
      
      {/* Cabeçalho */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <h2 className="text-4xl font-bold font-serif text-black tracking-tight">
          MCom
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Acesso ao Portal do Voluntário
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Card Principal */}
        <div className="bg-white py-8 px-4 shadow-xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            
            {/* Mensagem de Erro */}
            {erro && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 flex items-center">
                {erro}
              </div>
            )}

            {/* Campo E-mail */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={carregando}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50/50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black sm:text-sm transition-all disabled:opacity-50"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-gray-700 mb-1">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="senha"
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={carregando}
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg bg-gray-50/50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black sm:text-sm transition-all disabled:opacity-50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  disabled={carregando}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
                >
                  {mostrarSenha ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Link Esqueci a Senha */}
            <div className="flex items-center justify-end">
              <button type="button" className="text-sm font-medium text-gray-500 hover:text-black transition-colors">
                Esqueci minha senha
              </button>
            </div>

            {/* Botão Entrar com estado de loading */}
            <button
              type="submit"
              disabled={carregando}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {carregando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divisor e Cadastro */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-400">Novo por aqui?</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                className="w-full flex justify-center py-2.5 px-4 border border-gray-200 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all"
              >
                Criar uma conta
              </button>
            </div>
          </div>
        </div>

        {/* Link Área Administrativa */}
        <div className="mt-6 text-center">
          <button type="button" className="text-xs font-semibold text-gray-400 hover:text-black transition-colors uppercase tracking-widest">
            Acesso Administrativo
          </button>
        </div>
      </div>
    </div>
  );
}
