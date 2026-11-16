import React, { useState, useEffect, useMemo } from 'react';
import { School, KeyRound, User, Lock, Eye, EyeOff, AlertCircle, Shield, ArrowRight, Building2, Search, X, ArrowLeft, Settings, CheckCircle2 } from 'lucide-react';
import { UserRole, UserSession, School as SchoolType } from '../types';
import { storageService } from '../data/storageService';
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

interface LoginScreenProps {
  onLoginSuccess: (session: UserSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [schools, setSchools] = useState<SchoolType[]>(() => storageService.getSchools());
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(() => storageService.getActiveSchoolId());
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const [users, setUsers] = useState<PublicUserItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modo separado para o Painel Master Global (não vinculado como operador de uma escola)
  const [isMasterMode, setIsMasterMode] = useState<boolean>(false);

  // Carrega escolas atualizadas do Firestore
  useEffect(() => {
    firestoreService.getSchools().then(cloudSchools => {
      if (cloudSchools && cloudSchools.length > 0) {
        setSchools(cloudSchools);
        storageService.setSchools(cloudSchools);
      }
    }).catch(err => console.warn('Erro ao carregar escolas no login:', err));
  }, []);

  // Filtra as escolas em tempo real com base no texto digitado (nome, município ou CIE)
  const filteredSchools = useMemo(() => {
    if (!schoolSearchQuery.trim()) return schools;
    const q = schoolSearchQuery.toLowerCase().trim();
    return schools.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.city && s.city.toLowerCase().includes(q)) ||
      (s.codeCie && s.codeCie.toLowerCase().includes(q)) ||
      (s.network && s.network.toLowerCase().includes(q))
    );
  }, [schools, schoolSearchQuery]);

  // Se a escola selecionada não estiver na lista filtrada, seleciona a primeira da busca
  useEffect(() => {
    if (filteredSchools.length > 0 && !filteredSchools.some(s => s.id === selectedSchoolId)) {
      setSelectedSchoolId(filteredSchools[0].id);
      storageService.setActiveSchoolId(filteredSchools[0].id);
    }
  }, [filteredSchools, selectedSchoolId]);

  // Função auxiliar para garantir que apenas operadores da escola selecionada apareçam na lista
  const filterSchoolOperators = (list: PublicUserItem[], targetSchoolId: string): PublicUserItem[] => {
    return list.filter(u =>
      u.active !== false &&
      !u.isUniversal &&
      u.role !== 'super_admin' &&
      u.id !== 'usr-master' &&
      (u.schoolId || DEFAULT_SCHOOL_ID) === targetSchoolId
    );
  };

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setErrorMessage(null);

      // 1. Imediatamente exibe o cache local / base garantida da escola selecionada
      try {
        const rawUsers = storageService.getUsers(selectedSchoolId);
        const localList = Array.isArray(rawUsers) ? filterSchoolOperators(rawUsers, selectedSchoolId) : [];
        if (localList.length > 0) {
          setUsers(localList);
          setSelectedUserId(prev => (localList.some(u => u.id === prev) ? prev : localList[0].id));
          setLoadingUsers(false);
        } else {
          setUsers([]);
          setSelectedUserId('');
        }
      } catch (e) {
        console.warn('Cache local de usuários vazio:', e);
      }

      // 2. Busca do Firestore filtrando por escola
      try {
        const cloudUsers = await firestoreService.getUsers(selectedSchoolId);
        if (cloudUsers && cloudUsers.length > 0) {
          const activeList = filterSchoolOperators(cloudUsers, selectedSchoolId);
          if (activeList.length > 0) {
            setUsers(activeList);
            storageService.setUsers(cloudUsers);
            setSelectedUserId(prev => {
              const stillExists = activeList.some(u => u.id === prev);
              return stillExists ? prev : activeList[0].id;
            });
            setLoadingUsers(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar usuários da nuvem Firestore:', err);
      }

      // 3. Fallback: API proxy com schoolId
      try {
        const res = await fetch(`/api/users/public?schoolId=${encodeURIComponent(selectedSchoolId)}`);
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const list: PublicUserItem[] = await res.json();
          const activeList = filterSchoolOperators(list, selectedSchoolId);
          if (activeList.length > 0) {
            setUsers(activeList);
            setSelectedUserId(prev => {
              const stillExists = activeList.some(u => u.id === prev);
              return stillExists ? prev : activeList[0].id;
            });
            setLoadingUsers(false);
            return;
          }
        }
      } catch (err) {
        console.warn('API backend /api/users/public indisponível:', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [selectedSchoolId]);

  const activeSchool = schools.find(s => s.id === selectedSchoolId) || schools[0];

  // Login de Operador da Unidade Escolar
  const handleSchoolLogin = async (e: React.FormEvent) => {
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

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        storageService.recordUserLogin(selectedUserId);
        storageService.setActiveSchoolId(selectedSchoolId);
        onLoginSuccess({
          ...data.user,
          schoolId: selectedSchoolId,
          schoolName: activeSchool?.name || 'Unidade Escolar'
        });
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
      console.warn('Falha na requisição de login à API, validando credencial localmente:', err);
    }

    // Validação local via storageService (com consulta direta ao Firestore se necessário)
    let verification = storageService.verifyPin(selectedUserId, pin.trim());
    if (!verification.success) {
      try {
        const cloudUsers = await firestoreService.getUsers(selectedSchoolId);
        if (cloudUsers && cloudUsers.length > 0) {
          storageService.setUsers(cloudUsers);
          verification = storageService.verifyPin(selectedUserId, pin.trim());
        }
      } catch (e) {
        console.warn('Erro ao consultar Firestore para autenticação:', e);
      }
    }

    if (verification.success && verification.user) {
      storageService.recordUserLogin(selectedUserId);
      storageService.setActiveSchoolId(selectedSchoolId);
      onLoginSuccess({
        ...verification.user,
        schoolId: selectedSchoolId,
        schoolName: activeSchool?.name || 'Unidade Escolar'
      });
    } else {
      setErrorMessage(verification.error || 'Senha numérica de 4 dígitos incorreta.');
    }
    setAuthenticating(false);
  };

  // Login Exclusivo do Painel Master Global (Não vinculado a uma escola específica)
  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!pin.trim() || pin.trim().length !== 4) {
      setErrorMessage('Por favor, digite a Senha Master de 4 dígitos.');
      return;
    }

    setAuthenticating(true);
    const masterUserId = 'usr-master';

    try {
      const res = await fetch('/api/auth/login-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: masterUserId,
          pin: pin.trim(),
        }),
      });

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        storageService.recordUserLogin(masterUserId);
        onLoginSuccess({
          ...data.user,
          id: 'usr-master',
          role: 'super_admin',
          roleLabel: 'Painel Master Global',
          isUniversal: true,
          schoolId: selectedSchoolId || DEFAULT_SCHOOL_ID,
          schoolName: activeSchool?.name || 'EE Professor Arlindo Silvestre'
        });
        setAuthenticating(false);
        return;
      }
    } catch (err) {
      console.warn('Validando credencial Master localmente:', err);
    }

    let verification = storageService.verifyPin(masterUserId, pin.trim());
    if (!verification.success) {
      try {
        const allCloudUsers = await firestoreService.getUsers();
        if (allCloudUsers && allCloudUsers.length > 0) {
          storageService.setUsers(allCloudUsers);
          verification = storageService.verifyPin(masterUserId, pin.trim());
        }
      } catch (e) {
        console.warn('Erro ao consultar Firestore para Master:', e);
      }
    }

    if (verification.success && verification.user) {
      storageService.recordUserLogin(masterUserId);
      onLoginSuccess({
        ...verification.user,
        id: 'usr-master',
        role: 'super_admin',
        roleLabel: 'Painel Master Global',
        isUniversal: true,
        schoolId: selectedSchoolId || DEFAULT_SCHOOL_ID,
        schoolName: activeSchool?.name || 'EE Professor Arlindo Silvestre'
      });
    } else {
      setErrorMessage('Credencial Master incorreta. Verifique os 4 dígitos.');
    }
    setAuthenticating(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-purple-500 selection:text-white">
      {/* Top Brand Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <School className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-black text-indigo-400">
                SigaEscola
              </span>
              <span className="text-slate-500 hidden sm:inline">•</span>
              <h1 className="text-xs sm:text-sm font-bold text-white leading-tight">
                {isMasterMode ? 'Painel Master • Gestão Global' : (activeSchool?.name || 'Sistema de Gestão & Busca Ativa')}
              </h1>
            </div>
            <p className="text-[11px] text-slate-400">
              {isMasterMode
                ? 'Administração Central de Unidades Escolares e Licenciamento de Módulos'
                : (activeSchool?.city || activeSchool?.network || 'Portal Educacional Integrado')}
            </p>
          </div>
        </div>

        {/* Botão de alternância para o Painel Master Global (separado das escolas) */}
        <button
          type="button"
          onClick={() => {
            setIsMasterMode(!isMasterMode);
            setPin('');
            setErrorMessage(null);
          }}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
            isMasterMode
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              : 'bg-slate-900 hover:bg-indigo-950/80 text-indigo-300 border-slate-800 hover:border-indigo-500/40'
          }`}
          title={isMasterMode ? 'Voltar ao acesso das unidades escolares' : 'Acesso exclusivo ao Painel Master Global'}
        >
          {isMasterMode ? (
            <>
              <ArrowLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span>Acesso das Escolas</span>
            </>
          ) : (
            <>
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Painel Master</span>
            </>
          )}
        </button>
      </header>

      {/* Center Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {!isMasterMode ? (
          /* =================================================================== */
          /* MODO PADRÃO: ACESSO DA UNIDADE ESCOLAR (PROFESSORES, AOE, GESTÃO)   */
          /* =================================================================== */
          <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in fade-in duration-200">
            {/* Card Header */}
            <div className="bg-slate-900 px-6 sm:px-8 pt-7 pb-6 text-white text-center relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
              <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />

              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white mx-auto flex items-center justify-center mb-3 shadow-md">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center justify-center gap-2">
                <span>SigaEscola</span>
                <span className="text-slate-400 font-normal">|</span>
                <span className="text-sm text-slate-200 font-semibold">Identificação</span>
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Portal Integrado de Busca Ativa & Gestão Escolar
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSchoolLogin} className="p-6 sm:p-8 space-y-4">
              {/* Error Message */}
              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 flex items-start gap-2.5 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">{errorMessage}</p>
                    <p className="text-[11px] text-rose-600 mt-0.5">
                      Caso não saiba sua senha, solicite a redefinição com o Administrador da escola.
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Seleção da Unidade Escolar com Filtro por Digitação */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>1. Unidade Escolar:</span>
                  </span>
                  <span className="text-[10px] text-indigo-600 font-extrabold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {filteredSchools.length} de {schools.length} {schools.length === 1 ? 'Escola' : 'Escolas'}
                  </span>
                </label>

                {/* Campo para filtrar a escola digitando o nome */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Digitar nome da escola para filtrar..."
                    value={schoolSearchQuery}
                    onChange={e => setSchoolSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  {schoolSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSchoolSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Limpar filtro"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Seletor da Escola Filtrada */}
                <select
                  value={selectedSchoolId}
                  onChange={e => {
                    const newSchoolId = e.target.value;
                    setSelectedSchoolId(newSchoolId);
                    storageService.setActiveSchoolId(newSchoolId);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-white focus:bg-white text-slate-900 text-xs sm:text-sm font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs cursor-pointer"
                >
                  {filteredSchools.length > 0 ? (
                    filteredSchools.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `(${s.city})` : ''}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      Nenhuma escola encontrada com "{schoolSearchQuery}"
                    </option>
                  )}
                </select>
              </div>

              {/* 2. Operador / Usuário Cadastrado nesta Escola */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-600" />
                    <span>2. Operador / Usuário:</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    {users.length} {users.length === 1 ? 'operador cadastrado' : 'operadores cadastrados'}
                  </span>
                </label>

                {loadingUsers ? (
                  <div className="py-3 px-3.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 text-xs animate-pulse">
                    Carregando operadores cadastrados nesta unidade...
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-2.5 px-3 border border-amber-200 rounded-xl bg-amber-50 text-amber-800 text-xs font-medium">
                    Nenhum operador vinculado a esta escola. Acesse o Painel Master para auxiliar na configuração desta unidade.
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

              {/* 3. Senha de 4 Dígitos */}
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
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Acesso restrito aos servidores da unidade escolar.</span>
              <button
                type="button"
                onClick={() => {
                  setIsMasterMode(true);
                  setPin('');
                  setErrorMessage(null);
                }}
                className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer hover:underline"
              >
                <Shield className="w-3 h-3" />
                <span>Painel Master</span>
              </button>
            </div>
          </div>
        ) : (
          /* =================================================================== */
          /* MODO PAINEL MASTER GLOBAL: SEPARADO DE QUALQUER ESCOLA              */
          /* =================================================================== */
          <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border-2 border-indigo-500/40 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Master Card Header */}
            <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-6 sm:px-8 pt-7 pb-6 text-white text-center relative overflow-hidden border-b border-indigo-500/30">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white mx-auto flex items-center justify-center mb-3 shadow-lg border border-indigo-400/40">
                <Shield className="w-6 h-6" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[10px] font-extrabold uppercase tracking-wider mb-1.5">
                <Settings className="w-3 h-3" />
                <span>Administração Global • SaaS</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                SigaEscola • Painel Master
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Gerenciamento Central de Unidades Escolares e Módulos
              </p>
            </div>

            <form onSubmit={handleMasterLogin} className="p-6 sm:p-8 space-y-5">
              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 flex items-start gap-2.5 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">{errorMessage}</p>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs text-slate-600">
                <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Credencial Independente de Escola</span>
                </div>
                <p className="leading-relaxed text-[11px] text-slate-600">
                  Este acesso não pertence ao quadro de operadores de nenhuma escola. Ele permite cadastrar novas Unidades Escolares, liberar ou bloquear sistemas por escola e prestar suporte técnico em qualquer unidade.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Senha do Painel Master (4 dígitos):</span>
                  </span>
                  <span className="text-[11px] font-normal text-slate-400 lowercase">PIN Master</span>
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

              <div className="space-y-2.5 pt-1">
                <button
                  type="submit"
                  disabled={authenticating || pin.length !== 4}
                  className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    pin.length === 4
                      ? 'bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-300/40 hover:shadow-lg'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>{authenticating ? 'Verificando Credencial Master...' : 'Entrar no Painel Master Global'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMasterMode(false);
                    setPin('');
                    setErrorMessage(null);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar ao Acesso da Unidade Escolar</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950/40 py-4 px-4 text-center text-[11px] text-slate-500">
        {activeSchool?.name || 'SigaEscola'} • Em conformidade com a Lei de Diretrizes e Bases da Educação Nacional (LDB 9.394/96) e Diretrizes Educacionais
      </footer>
    </div>
  );
};
