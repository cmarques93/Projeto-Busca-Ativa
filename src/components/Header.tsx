import React from 'react';
import {
  School,
  RefreshCw,
  BellRing,
  UserCheck,
  ShieldAlert,
  Sparkles,
  Database,
  UserPlus,
  MessageCircle,
  DoorOpen,
  FileSpreadsheet,
  KeyRound,
  Shield,
  FileText
} from 'lucide-react';
import { UserRole, UserSession } from '../types';

export type MainTabType = 'attendance' | 'gate' | 'alerts' | 'interventions' | 'reports' | 'teacher_absence';

interface HeaderProps {
  schoolName: string;
  totalStudents: number;
  criticalStudentsCount: number;
  todayAlertsCount: number;
  activeInterventionsCount: number;
  averageAttendance: number;
  activeTab: MainTabType;
  setActiveTab: (tab: MainTabType) => void;
  currentUser: UserSession;
  onOpenLoginModal: () => void;
  onOpenSeducReport: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onResetData: () => void;
  onOpenStudentRegistration: () => void;
  onOpenWhatsAppIntegration: () => void;
  onOpenGoogleSheets: () => void;
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
  currentUser,
  onOpenLoginModal,
  onOpenSeducReport,
  onRefresh,
  isRefreshing,
  onResetData,
  onOpenStudentRegistration,
  onOpenWhatsAppIntegration,
  onOpenGoogleSheets,
}) => {
  const isGestao = currentUser.role === 'gestao_paac';
  const isAOE = currentUser.role === 'aoe';
  const isProfessor = currentUser.role === 'professor';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top institutional strip */}
      <div className="bg-slate-900 text-slate-200 px-4 py-1.5 text-xs font-medium flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">Governo do Estado de São Paulo • SEDUC</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">Sistema de Busca Ativa & Diário Eletrônico</span>
        </div>

        {/* User Session & Role Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px] hidden sm:inline">Operador:</span>
            <span className="text-[11px] font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {currentUser.name}
            </span>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                isGestao
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
            className="flex items-center gap-1 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors shadow-2xs"
            title="Trocar perfil de acesso (AOE, Gestão/PAAC, Professor)"
          >
            <KeyRound className="w-3 h-3" />
            <span>Alternar Perfil</span>
          </button>

          <button
            onClick={onResetData}
            className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer hidden md:inline"
            title="Restaurar dados de demonstração da escola"
          >
            Restaurar Base
          </button>
        </div>
      </div>

      {/* Main branding & actions bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <School className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {schoolName || 'EE Professor Arlindo Silvestre'}
              </h1>
              <span className="bg-indigo-50 text-indigo-700 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-indigo-200/60">
                Busca Ativa 2026
              </span>
            </div>
            <p className="text-xs text-slate-500">
              EE Professor Arlindo Silvestre • Gestão de Frequência, Prevenção à Evasão e Contingência SEDUC
            </p>
          </div>
        </div>

        {/* Global Action Buttons and Badges */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs">
          {/* Google Sheets Database Button */}
          <button
            onClick={onOpenGoogleSheets}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            title="Conectar, criar e sincronizar a Planilha Oficial do Google Drive"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>Planilha Google</span>
          </button>

          {/* Contingency report button for management */}
          {isGestao && (
            <button
              onClick={onOpenSeducReport}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              title="Gerar e compartilhar relatório diário de ausências aos professores em caso de instabilidade no SEDUC"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Relatório SEDUC p/ Professores</span>
            </button>
          )}

          {/* Quick Actions (Management only) */}
          {isGestao && (
            <>
              <button
                onClick={onOpenStudentRegistration}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                title="Cadastrar estudantes individualmente ou importar planilha CSV"
              >
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <span className="hidden sm:inline">Cadastrar Estudantes</span>
              </button>

              <button
                onClick={onOpenWhatsAppIntegration}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                title="Integração de envio de mensagens via WhatsApp"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span className="hidden sm:inline">Integração WhatsApp</span>
              </button>
            </>
          )}

          {/* Metric Badges */}
          <div className="hidden sm:flex bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 items-center gap-1.5">
            <span className="text-slate-500">Frequência Geral:</span>
            <span className={`font-bold ${averageAttendance >= 85 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {averageAttendance}%
            </span>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-rose-700">Crítico:</span>
            <span className="font-bold text-rose-800">{criticalStudentsCount}</span>
          </div>

          {isGestao && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-amber-700">Alertas:</span>
              <span className="font-bold text-amber-800">{todayAlertsCount}</span>
            </div>
          )}

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            title="Sincronizar com banco de dados"
            aria-label="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary Navigation Tabs - Strictly Filtered by User Role */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 sm:space-x-2 border-t border-slate-100 overflow-x-auto">
        {/* PROFESSOR: Acesso restrito apenas ao motivo das ausências */}
        {isProfessor && (
          <button
            onClick={() => setActiveTab('teacher_absence')}
            className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'teacher_absence'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Consulta de Ausências & Atestados da Turma</span>
          </button>
        )}

        {/* AOE e GESTÃO: Lançamento de Frequência Diária */}
        {(isGestao || isAOE) && (
          <button
            onClick={() => setActiveTab('attendance')}
            className={`py-3 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'attendance'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Lançamento Diário de Frequência</span>
          </button>
        )}

        {/* AOE e GESTÃO: Controle de Portaria / Entradas e Saídas fora do horário oficial */}
        {(isGestao || isAOE) && (
          <button
            onClick={() => setActiveTab('gate')}
            className={`py-3 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'gate'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <DoorOpen className="w-4 h-4 text-blue-600" />
            <span>Portaria (Entradas & Saídas Fora do Horário)</span>
          </button>
        )}

        {/* GESTÃO / PAAC: Acesso total - Alertas aos Responsáveis */}
        {isGestao && (
          <button
            onClick={() => setActiveTab('alerts')}
            className={`py-3 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'alerts'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <BellRing className="w-4 h-4" />
            <span>Alertas aos Responsáveis</span>
            {todayAlertsCount > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-1.5 py-0.2 rounded-full">
                {todayAlertsCount}
              </span>
            )}
          </button>
        )}

        {/* GESTÃO / PAAC: Casos de Busca Ativa */}
        {isGestao && (
          <button
            onClick={() => setActiveTab('interventions')}
            className={`py-3 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'interventions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Casos de Busca Ativa & IA</span>
            {activeInterventionsCount > 0 && (
              <span className="bg-rose-100 text-rose-800 text-[11px] font-bold px-1.5 py-0.2 rounded-full">
                {activeInterventionsCount}
              </span>
            )}
          </button>
        )}

        {/* GESTÃO / PAAC: Relatórios Mensais */}
        {isGestao && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-3 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'reports'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Relatórios Pedagógicos Mensais</span>
          </button>
        )}
      </div>
    </header>
  );
};
