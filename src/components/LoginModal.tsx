import React, { useState, useEffect } from 'react';
import { KeyRound, User, Lock, X, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { UserRole, UserSession } from '../types';
import { storageService } from '../data/storageService';
import { firestoreService } from '../lib/firestoreService';

interface PublicUserItem {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession;
  onSelectRole?: (role: UserRole, customName?: string) => void;
  onLoginSuccess: (session: UserSession) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectRole,
  onLoginSuccess,
}) => {
  const [users, setUsers] = useState<PublicUserItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load public users list for the select box
  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      setErrorMessage(null);
      setPin('');

      // 1. Carrega imediatamente do cache local para não demorar
      try {
        const rawUsers = storageService.getUsers();
        const localList = Array.isArray(rawUsers) ? rawUsers.filter(u => u.active !== false) : [];
        if (localList.length > 0) {
          setUsers(localList);
          const matching = localList.find(
            u => u.username === currentUser.username || u.name === currentUser.name
          );
          setSelectedUserId(matching ? matching.id : localList[0].id);
          setLoadingUsers(false);
        }
      } catch (e) {
        console.warn('Cache local vazio no modal:', e);
      }

      // 2. Busca lista oficial e sincronizada do Firestore
      try {
        const cloudUsers = await firestoreService.getUsers();
        if (cloudUsers && cloudUsers.length > 0) {
          const activeList = cloudUsers.filter(u => u.active !== false);
          if (activeList.length > 0) {
            setUsers(activeList);
            storageService.setUsers(cloudUsers);
            const matching = activeList.find(
              u => u.username === currentUser.username || u.name === currentUser.name
            );
            setSelectedUserId(matching ? matching.id : activeList[0].id);
            setLoadingUsers(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar usuários da nuvem no modal:', err);
      }

      // 3. Fallback: API proxy ou fallback seguro
      try {
        const res = await fetch('/api/users/public');
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const list: PublicUserItem[] = await res.json();
          const activeList = list.filter(u => u.active !== false);
          if (activeList.length > 0) {
            setUsers(activeList);
            const matching = activeList.find(
              u => u.username === currentUser.username || u.name === currentUser.name
            );
            setSelectedUserId(matching ? matching.id : activeList[0].id);
            setLoadingUsers(false);
            return;
          }
        }
      } catch (e) {
        console.warn('Backend API indisponível no modal:', e);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedUserId) {
      setErrorMessage('Por favor, selecione seu nome na caixa de seleção.');
      return;
    }

    if (!pin.trim() || pin.trim().length !== 4) {
      setErrorMessage('Por favor, digite sua senha de 4 dígitos numéricos.');
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

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        onLoginSuccess(data.user);
        if (onSelectRole) {
          onSelectRole(data.user.role, data.user.name);
        }
        onClose();
        setAuthenticating(false);
        return;
      }

      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.error) {
          setErrorMessage(data.error);
          setAuthenticating(false);
          return;
        }
      }
    } catch (err) {
      console.warn('API indisponível, validando credencial localmente:', err);
    }

    const verification = storageService.verifyPin(selectedUserId, pin.trim());
    if (verification.success && verification.user) {
      onLoginSuccess(verification.user);
      if (onSelectRole) {
        onSelectRole(verification.user.role, verification.user.name);
      }
      onClose();
    } else {
      setErrorMessage(verification.error || 'Senha de 4 dígitos incorreta.');
    }
    setAuthenticating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-sm">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Identificação de Usuário</h2>
              <p className="text-xs text-slate-300">EE Professor Arlindo Silvestre • SEDUC-SP</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleLogin} className="p-6 space-y-5 flex-1 text-xs">
          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs">{errorMessage}</p>
                <p className="text-[11px] text-rose-600 mt-0.5">
                  Caso não saiba sua senha, solicite a redefinição com o Administrador da escola.
                </p>
              </div>
            </div>
          )}

          {/* 1. Seleção do Nome (Caixa de Seleção sem tipo entre parênteses) */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              <span>Selecione o seu nome:</span>
            </label>

            {loadingUsers ? (
              <div className="py-3 px-3.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 animate-pulse text-xs">
                Carregando lista de servidores...
              </div>
            ) : (
              <select
                value={selectedUserId}
                onChange={e => {
                  setSelectedUserId(e.target.value);
                  setErrorMessage(null);
                }}
                className="w-full py-2.5 px-3.5 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-hidden shadow-xs cursor-pointer"
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

          {/* 2. Senha de 4 Dígitos Numéricos */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-600" />
                <span>Senha de 4 Dígitos:</span>
              </span>
              <span className="text-[10px] font-normal text-slate-500 lowercase">4 números</span>
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
                className="w-full py-3 px-4 text-center text-xl font-mono font-bold tracking-widest rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-hidden shadow-xs"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                title={showPin ? 'Ocultar dígitos' : 'Mostrar dígitos'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={authenticating || !selectedUserId || pin.length !== 4}
              className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer ${
                pin.length === 4
                  ? 'bg-purple-600 hover:bg-purple-700 ring-2 ring-purple-400/30'
                  : 'bg-slate-400 cursor-not-allowed opacity-75'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>{authenticating ? 'Verificando...' : 'Entrar no Sistema'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
