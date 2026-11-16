import React, { useState, useEffect, useMemo } from 'react';
import { KeyRound, User, Lock, X, AlertCircle, Eye, EyeOff, Shield, ArrowLeft } from 'lucide-react';
import { UserRole, UserSession } from '../types';
import { storageService, validateMasterPassword } from '../data/storageService';
import { firestoreService } from '../lib/firestoreService';
import { DEFAULT_SCHOOL_ID } from '../data/fallbackData';

interface PublicUserItem {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
  schoolId?: string;
  isUniversal?: boolean;
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
  const [isMasterMode, setIsMasterMode] = useState<boolean>(false);

  const masterValidation = useMemo(() => validateMasterPassword(pin), [pin]);

  const filterSchoolOperators = (list: PublicUserItem[], targetSchoolId: string): PublicUserItem[] => {
    return list.filter(
      u =>
        u.active !== false &&
        !u.isUniversal &&
        u.role !== 'super_admin' &&
        u.id !== 'usr-master' &&
        (u.schoolId || DEFAULT_SCHOOL_ID) === targetSchoolId
    );
  };

  // Load public users list for the select box
  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      setErrorMessage(null);
      setPin('');
      setIsMasterMode(false);

      const targetSchoolId = currentUser.schoolId || storageService.getActiveSchoolId();

      // 1. Carrega imediatamente do cache local para não demorar
      try {
        const rawUsers = storageService.getUsers(targetSchoolId);
        const localList = Array.isArray(rawUsers) ? filterSchoolOperators(rawUsers, targetSchoolId) : [];
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
        const cloudUsers = await firestoreService.getUsers(targetSchoolId);
        if (cloudUsers && cloudUsers.length > 0) {
          const activeList = filterSchoolOperators(cloudUsers, targetSchoolId);
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
        const res = await fetch(`/api/users/public?schoolId=${encodeURIComponent(targetSchoolId)}`);
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const list: PublicUserItem[] = await res.json();
          const activeList = filterSchoolOperators(list, targetSchoolId);
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

    const targetUserId = isMasterMode ? 'usr-master' : selectedUserId;

    if (!targetUserId) {
      setErrorMessage('Por favor, selecione seu nome na caixa de seleção.');
      return;
    }

    if (isMasterMode) {
      if (!masterValidation.isValid) {
        setErrorMessage('A senha do perfil Master deve ter entre 8 e 16 caracteres, contendo Maiúscula, Minúscula, Número e Caractere Especial.');
        return;
      }
    } else if (!pin.trim() || pin.trim().length !== 4) {
      setErrorMessage('Por favor, digite sua senha de 4 dígitos numéricos.');
      return;
    }

    setAuthenticating(true);
    try {
      const res = await fetch('/api/auth/login-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserId,
          pin: pin.trim(),
        }),
      });

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        storageService.recordUserLogin(targetUserId);
        const currentActiveSchool = storageService.getActiveSchool(currentUser.schoolId);
        onLoginSuccess({
          ...data.user,
          ...(isMasterMode ? { id: 'usr-master', role: 'super_admin' as UserRole, roleLabel: 'Painel Master Global', isUniversal: true } : {}),
          schoolId: currentUser.schoolId || currentActiveSchool.id,
          schoolName: currentUser.schoolName || currentActiveSchool.name
        });
        if (onSelectRole && !isMasterMode) {
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

    let verification = storageService.verifyPin(targetUserId, pin.trim());
    if (!verification.success) {
      try {
        const cloudUsers = await firestoreService.getUsers(isMasterMode ? undefined : currentUser.schoolId);
        if (cloudUsers && cloudUsers.length > 0) {
          storageService.setUsers(cloudUsers);
          verification = storageService.verifyPin(targetUserId, pin.trim());
        }
      } catch (e) {
        console.warn('Erro ao consultar Firestore no modal:', e);
      }
    }

    if (verification.success && verification.user) {
      storageService.recordUserLogin(targetUserId);
      const currentActiveSchool = storageService.getActiveSchool(currentUser.schoolId);
      onLoginSuccess({
        ...verification.user,
        ...(isMasterMode ? { id: 'usr-master', role: 'super_admin' as UserRole, roleLabel: 'Painel Master Global', isUniversal: true } : {}),
        schoolId: currentUser.schoolId || currentActiveSchool.id,
        schoolName: currentUser.schoolName || currentActiveSchool.name
      });
      if (onSelectRole && !isMasterMode) {
        onSelectRole(verification.user.role, verification.user.name);
      }
      onClose();
    } else {
      setErrorMessage(verification.error || (isMasterMode ? 'Senha Master incorreta.' : 'Senha de 4 dígitos incorreta.'));
    }
    setAuthenticating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ${isMasterMode ? 'bg-indigo-600' : 'bg-purple-600'}`}>
              {isMasterMode ? <Shield className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-1.5">
                <span className="text-indigo-400">SigaEscola</span>
                <span>•</span>
                <span>{isMasterMode ? 'Painel Master Global' : 'Alternar Usuário'}</span>
              </h2>
              <p className="text-xs text-slate-300">
                {isMasterMode ? 'Liberação de Módulos e Auxílio de Cadastros' : (currentUser.schoolName || storageService.getActiveSchool().name)}
              </p>
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
                {!isMasterMode && (
                  <p className="text-[11px] text-rose-600 mt-0.5">
                    Caso não saiba sua senha, solicite a redefinição com o Administrador da escola.
                  </p>
                )}
              </div>
            </div>
          )}

          {!isMasterMode ? (
            /* 1. Seleção do Nome do Operador da Escola */
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
          ) : (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-indigo-950 space-y-1">
              <p className="font-extrabold flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-indigo-600" />
                <span>Acesso ao Painel Master Global</span>
              </p>
              <p className="text-[11px] text-indigo-800 leading-relaxed">
                Insira a senha forte (8 a 16 caracteres) do Painel Master para liberar sistemas e realizar ajustes de cadastros como auxílio.
              </p>
            </div>
          )}

          {/* 2. Senha (4 Dígitos para Operadores | Senha Forte 8-16 para Master) */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-600" />
                <span>{isMasterMode ? 'Senha Forte do Painel Master:' : 'Senha de 4 Dígitos:'}</span>
              </span>
              <span className="text-[10px] font-normal text-slate-500 lowercase">
                {isMasterMode ? '8 a 16 caracteres' : '4 números'}
              </span>
            </label>

            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode={isMasterMode ? 'text' : 'numeric'}
                maxLength={isMasterMode ? 16 : 4}
                value={pin}
                onChange={e => {
                  const val = isMasterMode
                    ? e.target.value.slice(0, 16)
                    : e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                  setErrorMessage(null);
                }}
                placeholder={isMasterMode ? 'Ex: Master@2026' : '••••'}
                className={`w-full py-3 px-4 text-center font-mono font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-hidden shadow-xs ${
                  isMasterMode ? 'text-base tracking-wider' : 'text-xl tracking-widest'
                }`}
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                title={showPin ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsMasterMode(!isMasterMode);
                setPin('');
                setErrorMessage(null);
              }}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              {isMasterMode ? (
                <>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Operadores da Escola</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  <span>Painel Master</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  authenticating ||
                  (isMasterMode ? !masterValidation.isValid : (!selectedUserId || pin.length !== 4))
                }
                className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer ${
                  (isMasterMode ? masterValidation.isValid : pin.length === 4)
                    ? isMasterMode
                      ? 'bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-400/30'
                      : 'bg-purple-600 hover:bg-purple-700 ring-2 ring-purple-400/30'
                    : 'bg-slate-400 cursor-not-allowed opacity-75'
                }`}
              >
                {isMasterMode ? <Shield className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                <span>{authenticating ? 'Verificando...' : (isMasterMode ? 'Acessar Master' : 'Entrar no Sistema')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
