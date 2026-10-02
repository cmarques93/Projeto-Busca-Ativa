import React from 'react';
import {
  School,
  RefreshCw,
  BellRing,
  UserCheck,
  ShieldAlert,
  Sparkles,
  Database,
  DoorOpen,
  FileSpreadsheet,
  KeyRound,
  Shield,
  FileText,
  ShieldCheck,
  Users,
  LogOut,
  Smartphone,
  AlertOctagon,
  Tablet,
  Settings,
  Calendar,
  Layers
} from 'lucide-react';
import { UserRole, UserSession } from '../types';

export type MainTabType =
  | 'classes'
  | 'attendance'
  | 'gate'
  | 'alerts'
  | 'interventions'
  | 'reports'
  | 'teacher_absence'
  | 'access_management'
  | 'system_manager'
  | 'ocorrencias'
  | 'tablets';

export type MainModuleType =
  | 'diario'
  | 'busca_ativa'
  | 'tablets'
  | 'relatorios'
  | 'system_manager';

interface HeaderProps {
  schoolName: string;
  totalStudents: number;
  criticalStudentsCount: number;
  todayAlertsCount: number;
  activeInterventionsCount: number;
  averageAttendance: number;
  activeTab: MainTabType;
  setActiveTab: (tab: MainTabType) => void;
  activeModule?: MainModuleType;
  setActiveModule?: (mod: MainModuleType) => void;
  currentUser: UserSession;
  onOpenLoginModal: () => void;
  onLogout?: () => void;
  onOpenSeducReport?: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onResetData: () => void;
  onOpenStudentRegistration?: () => void;
  onOpenWhatsAppIntegration?: () => void;
  onOpenGoogleSheets?: () => void;
  onSyncData: () => void;
  isSyncing: boolean;
  syncMessage?: string | null;
  onOpenFirebaseStatus?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  schoolName,
  totalStudents,
  criticalStudentsCount,
  todayAlertsCount,
  activeInterventionsCount,
  averageAttendance,
  activeTab,
  setActiveTab,
  activeModule = 'diario',
  setActiveModule,
  currentUser,
  onOpenLoginModal,
  onLogout,
  onOpenSeducReport,
  onRefresh,
  isRefreshing,
  onResetData,
  onSyncData,
  isSyncing,
  syncMessage,
  onOpenFirebaseStatus,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isGestao = currentUser.role === 'gestao_paac';
  const isAOE = currentUser.role === 'aoe';
  const isProfessor = currentUser.role === 'professor';

  // Helper para alternar módulo
  const handleSelectModule = (mod: MainModuleType) => {
    if (setActiveModule) {
      setActiveModule(mod);
    } else {
      // Fallback
      if (mod === 'diario') setActiveTab(isProfessor ? 'teacher_absence' : 'attendance');
      else if (mod === 'busca_ativa') setActiveTab('ocorrencias');
      else if (mod === 'tablets') setActiveTab('tablets');
      else if (mod === 'relatorios') setActiveTab('reports');
      else if (mod === 'system_manager') setActiveTab('system_manager');
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* 1. Faixa Institucional Superior */}
      <div className="bg-slate-900 text-slate-200 px-4 py-1.5 text-xs font-medium flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">Governo do Estado de São Paulo • SEDUC</span>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="text-slate-300 hidden sm:inline">Busca Ativa Escolar & Diário Oficial</span>
        </div>

        {/* Informações do Usuário Ativo e Ações Rápidas */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] hidden md:inline">Operador:</span>
            <span className="text-[11px] font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {currentUser.name}
            </span>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                isAdmin
                  ? 'bg-purple-900/90 text-purple-200 border-purple-400/60'
                  : isGestao
                  ? 'bg-indigo-900/80 text-indigo-200 border-indigo-500/50'
                  : isAOE
                  ? 'bg-blue-900/80 text-blue-200 border-blue-500/50'
                  : 'bg-emerald-900/80 text-emerald-200 border-emerald-500/50'
              }`}
            >
              {currentUser.roleLabel}
            </span>
          </div>

          <button
            onClick={onOpenLoginModal}
            className="flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-0.5 rounded font-semibold cursor-pointer transition-colors border border-slate-700"
            title="Selecionar outro usuário e digitar senha PIN de 4 dígitos"
          >
            <KeyRound className="w-3 h-3 text-indigo-400" />
            <span className="hidden sm:inline">Alternar Usuário</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1 text-[11px] bg-rose-950/60 hover:bg-rose-900 text-rose-200 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors border border-rose-800/80"
              title="Sair da sessão atual"
            >
              <LogOut className="w-3 h-3" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Barra Principal: Identificação da Escola + Indicadores Essenciais */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <School className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                {schoolName || 'EE Professor Arlindo Silvestre'}
              </h1>
              <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-200/60">
                2026
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Gestão de Frequência, Prevenção à Evasão e Mediação Escolar
            </p>
          </div>
        </div>

        {/* Indicadores Vitais Compactos & Status da Nuvem */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Frequência Geral */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 flex items-center gap-1.5 shadow-2xs">
            <span className="text-slate-500 font-medium text-[11px]">Assiduidade:</span>
            <span className={`font-bold font-mono ${averageAttendance >= 85 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {averageAttendance}%
            </span>
          </div>

          {/* Alunos Críticos */}
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-rose-700 font-medium text-[11px]">Críticos:</span>
            <span className="font-bold font-mono text-rose-800">{criticalStudentsCount}</span>
          </div>

          {/* Alertas Hoje (Gestão/Admin) */}
          {(isGestao || isAdmin) && todayAlertsCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 flex items-center gap-1.5 shadow-2xs">
              <BellRing className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-amber-700 font-medium text-[11px]">Alertas:</span>
              <span className="font-bold font-mono text-amber-800">{todayAlertsCount}</span>
            </div>
          )}

          {/* Relatório SEDUC Rápido para Professores (Gestão/Admin) */}
          {(isGestao || isAdmin) && onOpenSeducReport && (
            <button
              onClick={onOpenSeducReport}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
              title="Gerar relatório diário de ausências aos professores (Contingência SEDUC)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Relatório SEDUC</span>
            </button>
          )}

          {/* Nuvem Firebase Direct Pill */}
          <button
            onClick={onOpenFirebaseStatus}
            className="px-2 py-1 rounded-lg border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer font-bold text-[11px] flex items-center gap-1.5 shadow-2xs"
            title="Status da Nuvem Firebase"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Nuvem</span>
          </button>

          {/* Botão Sincronizar Nuvem */}
          <button
            onClick={onSyncData}
            disabled={isSyncing}
            className="px-2.5 py-1 rounded-lg border border-indigo-300 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer font-bold text-[11px] flex items-center gap-1 shadow-2xs disabled:opacity-50"
            title="Sincronizar base com a nuvem"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing || isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
          {syncMessage && (
            <span className="text-[11px] text-indigo-700 font-medium">{syncMessage}</span>
          )}
        </div>
      </div>

      {/* 3. Navegação Consolidada: 4 Módulos Essenciais + Gerenciador Admin */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 sm:space-x-2 border-t border-slate-100 overflow-x-auto no-scrollbar">
        {/* MÓDULO 1: DIÁRIO & PORTARIA */}
        <button
          onClick={() => handleSelectModule('diario')}
          className={`py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeModule === 'diario'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          title="Lançamento diário de frequência, controle de portaria e atestados"
        >
          <UserCheck className="w-4 h-4 text-indigo-600" />
          <span>📋 Diário & Portaria</span>
        </button>

        {/* MÓDULO 2: BUSCA ATIVA & OCORRÊNCIAS */}
        <button
          onClick={() => handleSelectModule('busca_ativa')}
          className={`py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeModule === 'busca_ativa'
              ? 'border-amber-600 text-amber-700 bg-amber-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          title="Gestão de ocorrências disciplinares, alertas WhatsApp aos pais e casos de busca ativa"
        >
          <AlertOctagon className="w-4 h-4 text-amber-600" />
          <span>🚨 Busca Ativa & Ocorrências</span>
          {(activeInterventionsCount > 0 || todayAlertsCount > 0) && (
            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full font-mono">
              {activeInterventionsCount + todayAlertsCount}
            </span>
          )}
        </button>

        {/* MÓDULO 3: AGENDAMENTO DE TABLETS */}
        <button
          onClick={() => handleSelectModule('tablets')}
          className={`py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeModule === 'tablets'
              ? 'border-sky-600 text-sky-700 bg-sky-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          title="Grade semanal de reservas de tablets e recursos tecnológicos"
        >
          <Tablet className="w-4 h-4 text-sky-600" />
          <span>📱 Agendamento de Tablets</span>
        </button>

        {/* MÓDULO 4: RELATÓRIOS & ESTRATÉGICO */}
        <button
          onClick={() => handleSelectModule('relatorios')}
          className={`py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeModule === 'relatorios'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          title="Relatórios pedagógicos mensais da SEDUC e acompanhamento estatístico"
        >
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>📊 Relatórios & Estratégico</span>
        </button>

        {/* MÓDULO 5: GERENCIADOR DO SISTEMA (ADMINISTRADOR MASTER) */}
        {isAdmin && (
          <button
            onClick={() => handleSelectModule('system_manager')}
            className={`py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ml-auto ${
              activeModule === 'system_manager'
                ? 'border-purple-600 text-purple-700 bg-purple-50/40'
                : 'border-transparent text-purple-950/80 hover:text-purple-900 hover:border-purple-300'
            }`}
            title="Painel Master de configurações e cadastros (Turmas, Estudantes, Grade de Horários, Ocorrências, Tablets, Usuários e Nuvem)"
          >
            <Settings className="w-4 h-4 text-purple-600" />
            <span>⚙️ Gerenciador (Admin)</span>
          </button>
        )}
      </div>
    </header>
  );
};
