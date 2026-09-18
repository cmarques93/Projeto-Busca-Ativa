import React, { useState, useEffect } from 'react';
import { School, KeyRound, User, Lock, Eye, EyeOff, AlertCircle, Shield, ArrowRight } from 'lucide-react';
import { UserRole, UserSession } from '../types';

interface PublicUserItem {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
}

interface LoginScreenProps {
  onLoginSuccess: (session: UserSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [users, setUsers] = useState<PublicUserItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/users/public');
        if (res.ok) {
          const list: PublicUserItem[] = await res.json();
          const activeList = list.filter(u => u.active !== false);
          setUsers(activeList);
          if (activeList.length > 0) {
            setSelectedUserId(activeList[0].id);
          }
        } else {
          setErrorMessage('Não foi possível carregar a lista de usuários.');
        }
      } catch (err) {
        console.error('Erro ao buscar usuários:', err);
        setErrorMessage('Falha ao conectar com o servidor da escola.');
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedUserId) {
      setErrorMessage('Por favor, selecione seu nome na lista.');
      return;
    }

    if (!pin.trim() || pin.trim().length !== 4) {
      setErrorMessage('Por favor, digite sua senha numérica de 4 dígitos.');
      return;
    }

    setAuthenticating(true);
    try {
      const res = await fetch('/api/auth/login-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          pin: pin.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Senha incorreta.');
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao realizar login.');
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-purple-500 selection:text-white">
      {/* Top Brand Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <School className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-white leading-tight">
              EE Professor Arlindo Silvestre
            </h1>
            <p className="text-[11px] text-slate-400">
              Governo do Estado de São Paulo • SEDUC-SP
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>Portal de Acesso Seguro</span>
        </div>
      </header>

      {/* Center Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
          {/* Card Header */}
          <div className="bg-slate-900 px-6 sm:px-8 pt-7 pb-6 text-white text-center relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />

            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white mx-auto flex items-center justify-center mb-3 shadow-md">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">
              Identificação de Usuário
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Busca Ativa Escolar & Diário Oficial de Frequência
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="p-6 sm:p-8 space-y-5">
            {/* Error Message */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 flex items-start gap-2.5 text-xs animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">{errorMessage}</p>
                  <p className="text-[11px] text-rose-600 mt-0.5">
                    Caso não saiba sua senha, solicite a redefinição com o Administrador.
                  </p>
                </div>
              </div>
            )}

            {/* 1. Nome do Usuário (sem parênteses) */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Selecione o seu nome:</span>
              </label>

              {loadingUsers ? (
                <div className="py-3 px-3.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 text-xs animate-pulse">
                  Carregando lista de servidores...
                </div>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={e => {
                    setSelectedUserId(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full py-3 px-3.5 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 bg-slate-50 hover:bg-white text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-hidden transition-all shadow-2xs cursor-pointer"
                  required
                >
                  {users.map(u => {
                    const cleanName = u.name.replace(/\s*\([^)]*\)/g, '').trim();
                    return (
                      <option key={u.id} value={u.id}>
                        {cleanName}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* 2. Senha de 4 Dígitos */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  <span>Senha de 4 dígitos:</span>
                </span>
                <span className="text-[11px] font-normal text-slate-400 lowercase">4 números</span>
              </label>

              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={pin}
                  onChange={e => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setErrorMessage(null);
                  }}
                  placeholder="••••"
                  className="w-full py-3 px-4 text-center text-2xl font-mono font-bold tracking-widest rounded-xl border border-slate-300 bg-slate-50 hover:bg-white focus:bg-white text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-hidden transition-all shadow-2xs"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  title={showPin ? 'Ocultar dígitos' : 'Mostrar dígitos'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão de Entrada */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={authenticating || !selectedUserId || pin.length !== 4}
                className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  pin.length === 4
                    ? 'bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-300/40 hover:shadow-lg scale-[1.01] active:scale-[0.99]'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                <span>{authenticating ? 'Autenticando...' : 'Acessar o Painel'}</span>
                {!authenticating && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          {/* Footer Card */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-center text-[11px] text-slate-500">
            Acesso restrito aos servidores da EE Professor Arlindo Silvestre.
          </div>
        </div>
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950/40 py-4 px-4 text-center text-[11px] text-slate-500">
        EE Professor Arlindo Silvestre • Em conformidade com a Lei de Diretrizes e Bases da Educação Nacional (LDB 9.394/96) e SEDUC-SP
      </footer>
    </div>
  );
};
