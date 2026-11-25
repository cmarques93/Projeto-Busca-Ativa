import React, { useMemo } from 'react';
import {
  School,
  RefreshCw,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  ArrowLeft,
  Home,
  Building2,
  Shield,
  Download,
  Upload,
  BookOpen,
  UserCheck,
  DoorOpen,
  ShieldAlert,
  AlertOctagon,
  Tablet,
  CalendarDays,
  BarChart3,
  Settings,
  Users
} from 'lucide-react';
import { UserSession, School as SchoolType, isModuleEnabled } from '../types';

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
  | 'ocorrencias'
  | 'tablets'
  | 'grade_calendario'
  | 'relatorios'
  | 'system_manager';

export type DiarioSubTabType = 'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas';
export type BuscaAtivaSubTabType = 'hub' | 'alertas' | 'casos';

interface HeaderProps {
  schoolName: string;
  currentUser: UserSession;
  currentSchool?: SchoolType;
  activeModule?: MainModuleType;
  subTabDiario?: DiarioSubTabType;
  onNavigate?: (
    module: MainModuleType,
    subTabDiario?: DiarioSubTabType,
    subTabBuscaAtiva?: BuscaAtivaSubTabType,
    ocorrenciasSubTab?: string
  ) => void;
  onOpenLoginModal: () => void;
  onLogout?: () => void;
  onOpenSeducReport?: () => void;
  onOpenSchoolSelector?: () => void;
  onOpenMasterPanel?: () => void;
  onExportOfflineBackup?: () => void;
  onOpenRestoreBackup?: () => void;
  onOpenUserManual?: () => void;
  onSyncData: () => void;
  isSyncing: boolean;
  syncMessage?: string | null;
  onGoBack?: () => void;
  onGoHome?: () => void;
  canGoBack?: boolean;
  previousSectionLabel?: string;
  breadcrumb?: string;
}

interface TopNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  schoolName,
  currentUser,
  currentSchool,
  activeModule = 'inicio',
  subTabDiario = 'hub',
  onNavigate,
  onOpenLoginModal,
  onLogout,
  onOpenSeducReport,
  onOpenSchoolSelector,
  onOpenMasterPanel,
  onExportOfflineBackup,
  onOpenRestoreBackup,
  onOpenUserManual,
  onSyncData,
  isSyncing,
  syncMessage,
  onGoBack,
  onGoHome,
  canGoBack = false,
  previousSectionLabel,
  breadcrumb,
}) => {
  const isUniversalMaster = currentUser.role === 'super_admin' || currentUser.isUniversal === true;
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'admin_escola' || isUniversalMaster;
  const isGestao = currentUser.role === 'gestao_paac';
  const isAOE = currentUser.role === 'aoe';
  const isProfessor = currentUser.role === 'professor';

  const hasDiario = isModuleEnabled(currentSchool, 'diario');
  const hasPortaria = isModuleEnabled(currentSchool, 'portaria');
  const hasBuscaAtiva = isModuleEnabled(currentSchool, 'busca_ativa');
  const hasOcorrencias = isModuleEnabled(currentSchool, 'ocorrencias');
  const hasTablets = isModuleEnabled(currentSchool, 'tablets');
  const hasGradeCalendario = isModuleEnabled(currentSchool, 'grade_calendario');
  const hasRelatorios = isModuleEnabled(currentSchool, 'relatorios');

  const isNotHome = activeModule !== 'inicio';

  const dataHojeExtenso = useMemo(() => {
    return new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  // Lista completa de funcionalidades liberadas para esta escola e para o perfil ativo
  const navItems: TopNavItem[] = useMemo(() => {
    if (isUniversalMaster || !onNavigate) return [];

    const items: TopNavItem[] = [
      {
        id: 'inicio',
        label: 'Início',
        icon: <Home className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'inicio',
        onClick: () => (onGoHome ? onGoHome() : onNavigate('inicio')),
      },
    ];

    if (isProfessor) {
      if (hasDiario) {
        items.push({
          id: 'diario',
          label: 'Frequência',
          icon: <UserCheck className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'diario',
          onClick: () => onNavigate('diario', 'ausencias'),
        });
      }
      if (hasOcorrencias) {
        items.push({
          id: 'ocorrencias',
          label: 'Ocorrências',
          icon: <AlertOctagon className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'ocorrencias',
          onClick: () => onNavigate('ocorrencias', undefined, undefined, 'hub'),
        });
      }
      if (hasTablets) {
        items.push({
          id: 'tablets',
          label: 'Equipamentos',
          icon: <Tablet className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'tablets',
          onClick: () => onNavigate('tablets'),
        });
      }
      if (hasGradeCalendario) {
        items.push({
          id: 'grade_calendario',
          label: 'Grade & Calendário',
          icon: <CalendarDays className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'grade_calendario',
          onClick: () => onNavigate('grade_calendario'),
        });
      }
      return items;
    }

    if (isAOE) {
      if (hasPortaria) {
        items.push({
          id: 'portaria',
          label: 'Portaria',
          icon: <DoorOpen className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'diario' && subTabDiario === 'portaria',
          onClick: () => onNavigate('diario', 'portaria'),
        });
      }
      if (hasDiario) {
        items.push({
          id: 'chamada',
          label: 'Frequência',
          icon: <UserCheck className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'diario' && subTabDiario === 'chamada',
          onClick: () => onNavigate('diario', 'chamada'),
        });
      }
      if (hasDiario || hasBuscaAtiva) {
        items.push({
          id: 'turmas',
          label: 'Turmas',
          icon: <Users className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'diario' && subTabDiario === 'turmas',
          onClick: () => onNavigate('diario', 'turmas'),
        });
      }
      if (hasTablets) {
        items.push({
          id: 'tablets',
          label: 'Equipamentos',
          icon: <Tablet className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'tablets',
          onClick: () => onNavigate('tablets'),
        });
      }
      if (hasGradeCalendario) {
        items.push({
          id: 'grade_calendario',
          label: 'Grade & Roteiro',
          icon: <CalendarDays className="w-3.5 h-3.5 shrink-0" />,
          isActive: activeModule === 'grade_calendario',
          onClick: () => onNavigate('grade_calendario'),
        });
      }
      return items;
    }

    // Gestão / PAAC e Administrador da Unidade Escolar
    if (hasDiario || hasPortaria) {
      items.push({
        id: 'diario',
        label: 'Diário & Portaria',
        icon: <UserCheck className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'diario' && !(isGestao && subTabDiario === 'turmas'),
        onClick: () => onNavigate('diario', 'hub'),
      });
    }
    if (hasBuscaAtiva) {
      items.push({
        id: 'busca_ativa',
        label: 'Busca Ativa',
        icon: <ShieldAlert className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'busca_ativa',
        onClick: () => onNavigate('busca_ativa', undefined, 'hub'),
      });
    }
    if (hasOcorrencias) {
      items.push({
        id: 'ocorrencias',
        label: 'Ocorrências',
        icon: <AlertOctagon className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'ocorrencias',
        onClick: () => onNavigate('ocorrencias', undefined, undefined, 'pendentes'),
      });
    }
    if (hasTablets) {
      items.push({
        id: 'tablets',
        label: 'Equipamentos',
        icon: <Tablet className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'tablets',
        onClick: () => onNavigate('tablets'),
      });
    }
    if (hasGradeCalendario) {
      items.push({
        id: 'grade_calendario',
        label: 'Grade & Calendário',
        icon: <CalendarDays className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'grade_calendario',
        onClick: () => onNavigate('grade_calendario'),
      });
    }
    if (hasRelatorios) {
      items.push({
        id: 'relatorios',
        label: 'Relatórios',
        icon: <BarChart3 className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'relatorios',
        onClick: () => onNavigate('relatorios'),
      });
    }
    if (isGestao) {
      items.push({
        id: 'turmas_gestao',
        label: 'Turmas & Alunos',
        icon: <Users className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'diario' && subTabDiario === 'turmas',
        onClick: () => onNavigate('diario', 'turmas'),
      });
    }
    if (isAdmin && !isUniversalMaster) {
      items.push({
        id: 'system_manager',
        label: 'Gerenciador',
        icon: <Settings className="w-3.5 h-3.5 shrink-0" />,
        isActive: activeModule === 'system_manager',
        onClick: () => onNavigate('system_manager'),
      });
    }

    return items;
  }, [
    isUniversalMaster,
    isProfessor,
    isAOE,
    isGestao,
    isAdmin,
    hasDiario,
    hasPortaria,
    hasBuscaAtiva,
    hasOcorrencias,
    hasTablets,
    hasGradeCalendario,
    hasRelatorios,
    activeModule,
    subTabDiario,
    onNavigate,
    onGoHome,
  ]);

  return (
    <header className="md:sticky md:top-0 z-30 shadow-xs">
      {/* 1. Barra Principal Unificada (Identidade EduScope 360 + Escola + Perfil Ativo + Sessão) */}
      <div className="bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Esquerda: Marca única, subtítulo e identificação da escola */}
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => (!isUniversalMaster && onGoHome ? onGoHome() : undefined)}
              className={`w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0 transition-colors ${
                !isUniversalMaster && onGoHome ? 'hover:bg-indigo-500 cursor-pointer' : 'cursor-default'
              }`}
              title={!isUniversalMaster ? 'Ir para a tela inicial' : 'EduScope 360'}
            >
              <School className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <button
                  type="button"
                  onClick={() => (!isUniversalMaster && onGoHome ? onGoHome() : undefined)}
                  className={`text-lg sm:text-xl font-extrabold tracking-tight text-white whitespace-nowrap leading-tight ${
                    !isUniversalMaster && onGoHome ? 'hover:text-indigo-200 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  EduScope 360
                </button>
                <span className="text-slate-500 hidden sm:inline" aria-hidden="true">-</span>
                <span className="text-xs sm:text-sm font-medium text-indigo-200/90 truncate">
                  Portal Integrado de Gestão Escolar
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-300">
                <span className="font-semibold text-slate-100 truncate">
                  {schoolName || 'Unidade Escolar'}
                </span>
                <span className="text-slate-500 hidden 2xl:inline" aria-hidden="true">·</span>
                <span className="capitalize text-slate-400 hidden 2xl:inline">{dataHojeExtenso}</span>
                {isUniversalMaster && onOpenSchoolSelector && (
                  <>
                    <span className="text-slate-500" aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={onOpenSchoolSelector}
                      className="inline-flex items-center gap-1 text-indigo-300 hover:text-white font-semibold underline underline-offset-2 cursor-pointer transition-colors whitespace-nowrap"
                      title="Alternar para outra unidade escolar cadastrada"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Trocar Escola</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Direita: Utilitários (Backup, Restaurar, Manual) + Perfil Ativo + Controles de Sessão */}
          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 shrink-0">
            {/* Botões de Backup, Restaurar e Manual na primeira faixa */}
            {(((isAdmin || isGestao) && (onExportOfflineBackup || onOpenRestoreBackup)) || onOpenUserManual) && (
              <>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(isAdmin || isGestao) && onExportOfflineBackup && (
                    <button
                      type="button"
                      onClick={onExportOfflineBackup}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-700/90 text-slate-200 bg-slate-800/80 hover:bg-emerald-950/80 hover:text-emerald-200 hover:border-emerald-600/60 transition-colors cursor-pointer font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      title="Baixar arquivo JSON com backup completo dos dados"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Backup</span>
                    </button>
                  )}

                  {(isAdmin || isGestao) && onOpenRestoreBackup && (
                    <button
                      type="button"
                      onClick={onOpenRestoreBackup}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-700/90 text-slate-200 bg-slate-800/80 hover:bg-amber-950/80 hover:text-amber-200 hover:border-amber-600/60 transition-colors cursor-pointer font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      title="Restaurar arquivo JSON de backup diretamente para o Firebase Cloud"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>Restaurar</span>
                    </button>
                  )}

                  {onOpenUserManual && (
                    <button
                      type="button"
                      onClick={onOpenUserManual}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-700/90 text-slate-200 bg-slate-800/80 hover:bg-indigo-950/80 hover:text-indigo-200 hover:border-indigo-500/60 transition-colors cursor-pointer font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      title="Abrir Manual do Usuário detalhado por perfil com exportação em PDF"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-indigo-300" />
                      <span>Manual</span>
                    </button>
                  )}
                </div>

                <div className="hidden sm:block h-6 w-px bg-slate-700/80 shrink-0" aria-hidden="true" />
              </>
            )}

            {isUniversalMaster && onOpenMasterPanel && (
              <button
                type="button"
                onClick={onOpenMasterPanel}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
                title="Abrir Painel Master Global (Gerenciar Escolas e Módulos)"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Central Master</span>
              </button>
            )}

            <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-xl">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white leading-tight truncate max-w-[150px] xl:max-w-[190px]">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-indigo-300/90 leading-tight truncate max-w-[150px] xl:max-w-[190px]">
                  {currentUser.roleLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenLoginModal}
                className="flex items-center gap-1.5 text-xs bg-slate-800/90 hover:bg-slate-700 text-slate-200 px-2.5 py-2 rounded-lg font-semibold cursor-pointer transition-colors border border-slate-700/90 whitespace-nowrap shrink-0"
                title="Selecionar outro usuário e digitar senha PIN"
              >
                <KeyRound className="w-3.5 h-3.5 text-indigo-300" />
                <span className="hidden sm:inline">Alternar</span>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 text-xs bg-rose-950/60 hover:bg-rose-900 text-rose-200 px-2.5 py-2 rounded-lg font-semibold cursor-pointer transition-colors border border-rose-800/70 whitespace-nowrap shrink-0"
                  title="Sair da sessão atual"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Barra Superior de Funcionalidades Liberadas para a Escola + Ações Operacionais */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          {/* Menu de Módulos Liberados */}
          {navItems.length > 0 && (
            <nav
              aria-label="Funcionalidades liberadas"
              className="flex items-center gap-1 overflow-x-auto py-1.5 -mx-1 px-1 min-w-0 flex-1"
            >
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    item.isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <span className={item.isActive ? 'text-indigo-600' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          )}

          {/* Ações Rápidas Institucionais (Relatório Oficial e Sincronizar) */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 border-t border-slate-100 lg:border-t-0 shrink-0">
            {!isUniversalMaster && (isGestao || isAdmin) && onOpenSeducReport && hasRelatorios && (
              <button
                type="button"
                onClick={onOpenSeducReport}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                title="Gerar Relatório Oficial de Acompanhamento Escolar (Frequência, Ocorrências, Mediação e Assinaturas)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Relatório Oficial</span>
              </button>
            )}

            <button
              type="button"
              onClick={onSyncData}
              disabled={isSyncing}
              className="px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 transition-colors cursor-pointer font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Sincronizar base de dados com a nuvem"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>

            {syncMessage && (
              <span className="text-xs text-indigo-700 font-semibold whitespace-nowrap shrink-0 px-1.5">
                {syncMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Barra Contextual de Retorno (Exibida quando o usuário está dentro de um módulo ou possui histórico) */}
      {!isUniversalMaster && (isNotHome || canGoBack) && (
        <div className="bg-slate-50 border-b border-slate-200/90">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3">
            {onGoBack && (canGoBack || isNotHome) && (
              <button
                type="button"
                onClick={onGoBack}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs cursor-pointer transition-colors border border-slate-300 whitespace-nowrap shrink-0"
                title={previousSectionLabel ? `Voltar para ${previousSectionLabel}` : 'Voltar à seção anterior'}
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-600" />
                <span>Voltar</span>
              </button>
            )}

            {breadcrumb && isNotHome && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0 truncate">
                <span className="text-slate-400">Início</span>
                <span aria-hidden="true">/</span>
                <span className="font-semibold text-slate-800 truncate">{breadcrumb}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
