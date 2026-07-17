import React, { useEffect, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import logo from '../assets/ico.png';

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

      // Sucesso: A API retornou o status 200, o token e os dados do usuário.
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
    <div className="app-page">
      <main className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-6">
      
      {/* Cabeçalho */}
      <div className="mb-7 text-center sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="MCom" className="mx-auto h-16 w-16 object-contain" />
        <h1 className="mt-3 text-xl font-bold text-gray-950 dark:text-white">Portal do Voluntário</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Acesso ao Portal do Voluntário
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        {/* Card Principal */}
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:px-7">
          <form className="space-y-6" onSubmit={handleLogin}>
            
            {/* Mensagem de Erro */}
            {erro && (
              <div role="alert" aria-live="assertive" className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 flex items-center">
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
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={carregando}
                  className="block w-full rounded-md border border-gray-300 bg-white py-2.5 pl-10 pr-3 placeholder-gray-400 transition disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 sm:text-sm"
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
                  name="password"
                  type={mostrarSenha ? "text" : "password"}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={carregando}
                  className="block w-full rounded-md border border-gray-300 bg-white py-2.5 pl-10 pr-10 placeholder-gray-400 transition disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 sm:text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  disabled={carregando}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={mostrarSenha}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
                >
                  {mostrarSenha ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Link Esqueci a Senha */}
            <div className="flex items-center justify-center">
              <button type="button" className="text-sm font-medium text-gray-500 hover:text-black transition-colors">
                Esqueci minha senha
              </button>
            </div>

            {/* Botão Entrar com estado de loading */}
            <button
              type="submit"
              disabled={carregando}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-dourado-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-dourado-800 disabled:cursor-not-allowed disabled:opacity-70"
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
        </div>

      </div>
      </main>
      <Footer />
    </div>
  );
}
