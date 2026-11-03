import React from 'react';
import {
  School,
  RefreshCw,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  ArrowLeft,
  Home,
  CheckCircle2
} from 'lucide-react';
import { UserSession } from '../types';

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
  | 'inicio'
  | 'diario'
  | 'busca_ativa'
  | 'tablets'
  | 'relatorios'
  | 'system_manager';

interface HeaderProps {
  schoolName: string;
  currentUser: UserSession;
  activeModule?: MainModuleType;
  onOpenLoginModal: () => void;
  onLogout?: () => void;
  onOpenSeducReport?: () => void;
  onSyncData: () => void;
  isSyncing: boolean;
  syncMessage?: string | null;
  onGoBack?: () => void;
  onGoHome?: () => void;
  canGoBack?: boolean;
  breadcrumb?: string;
}

export const Header: React.FC<HeaderProps> = ({
  schoolName,
  currentUser,
  activeModule = 'inicio',
  onOpenLoginModal,
  onLogout,
  onOpenSeducReport,
  onSyncData,
  isSyncing,
  syncMessage,
  onGoBack,
  onGoHome,
  canGoBack = true,
  breadcrumb,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isGestao = currentUser.role === 'gestao_paac';
  const isAOE = currentUser.role === 'aoe';

  const isNotHome = activeModule !== 'inicio';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* 1. Faixa Institucional Superior (Fixa no topo com nome personalizado SigaEscola) */}
      <div className="bg-slate-900 text-slate-200 px-4 py-1.5 text-xs font-medium flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-black tracking-wider uppercase text-[11px] border border-indigo-400/40">
            SigaEscola
          </span>
          <span className="text-slate-500 hidden sm:inline">•</span>
          <span className="font-semibold text-white">Sistema de Gestão Escolar & Busca Ativa</span>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="text-slate-300 hidden sm:inline">Portal Integrado de Acompanhamento, Frequência & Mediação</span>
        </div>

        {/* Informações do Usuário Ativo e Ações de Sessão */}
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
            title="Selecionar outro usuário e digitar senha PIN"
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

      {/* 2. Barra Principal: Identificação da Escola + Ações Funcionais (Sem poluição de métricas duplicadas) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <School className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-black text-indigo-700 leading-tight">
                SigaEscola
              </span>
              <span className="text-slate-300 font-light hidden sm:inline">•</span>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {schoolName || 'EE Professor Arlindo Silvestre'}
              </h1>
              <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-200/60">
                2026
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Portal Integrado • Frequência, Prevenção à Evasão, Tablets & Mediação Escolar
            </p>
          </div>
        </div>

        {/* Ações Funcionais Permitidas no Topo: Relatório SEDUC e Sincronizar Único */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Relatório Oficial de Acompanhamento (Gestão / Admin) */}
          {(isGestao || isAdmin) && onOpenSeducReport && (
            <button
              onClick={onOpenSeducReport}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              title="Gerar Relatório Oficial de Acompanhamento Escolar (Frequência, Ocorrências, Mediação e Assinaturas)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Relatório de Acompanhamento</span>
            </button>
          )}

          {/* Botão Funcional Único de Sincronizar Banco de Dados */}
          <button
            onClick={onSyncData}
            disabled={isSyncing}
            className="px-3 py-1.5 rounded-xl border border-indigo-300 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer font-bold text-xs flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            title="Sincronizar base de dados com a nuvem"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
          {syncMessage && (
            <span className="text-xs text-indigo-700 font-bold bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
              {syncMessage}
            </span>
          )}
        </div>
      </div>

      {/* 3. Barra de Navegação Contextual (Botões "Voltar à Tela Anterior" e "Tela de Início") */}
      {isNotHome && (
        <div className="bg-slate-50 border-t border-slate-200 px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            {canGoBack && onGoBack && (
              <button
                onClick={onGoBack}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs cursor-pointer transition-colors border border-slate-300 shadow-2xs"
                title="Voltar à tela anterior"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-700" />
                <span>Voltar</span>
              </button>
            )}

            {onGoHome && (
              <button
                onClick={onGoHome}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition-colors shadow-2xs"
                title="Ir para a Tela Inicial"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Tela de Início</span>
              </button>
            )}

            {breadcrumb && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 font-medium ml-2">
                <span className="text-slate-400">/</span>
                <span className="font-bold text-slate-800">{breadcrumb}</span>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-500 font-semibold hidden md:block">
            Navegação por Cards • SigaEscola
          </div>
        </div>
      )}
    </header>
  );
};
