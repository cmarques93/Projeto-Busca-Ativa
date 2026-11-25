import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  DoorOpen,
  AlertOctagon,
  ShieldAlert,
  Tablet,
  BarChart3,
  Settings,
  Users,
  ArrowRight,
  CalendarDays,
  Clock
} from 'lucide-react';
import { MainModuleType, DiarioSubTabType, BuscaAtivaSubTabType } from './Header';
import { SchoolClass, Student, ParentAlert, InterventionCase, UserSession, School as SchoolType, isModuleEnabled } from '../types';
import { storageService } from '../data/storageService';
import { lerCacheOcorrencias } from '../lib/sheetsSyncService';
import { ProfessorMultiplicaModal } from './ProfessorMultiplicaModal';
import {
  formatMultiplicaSummary,
  getEffectiveSchoolPeriods,
  normalizeTeacherKey
} from '../utils/timetableEngine';

interface DashboardHomeProps {
  currentUser: UserSession;
  currentSchool?: SchoolType;
  onOpenSchoolSelector?: () => void;
  classes: SchoolClass[];
  students: Student[];
  alerts: ParentAlert[];
  interventions: InterventionCase[];
  averageAttendance?: number;
  criticalStudentsCount?: number;
  onNavigate: (
    module: MainModuleType,
    subTabDiario?: DiarioSubTabType,
    subTabBuscaAtiva?: BuscaAtivaSubTabType,
    ocorrenciasSubTab?: string
  ) => void;
  onSelectStudent: (student: Student) => void;
  onOpenStudentRegistration?: () => void;
  onOpenSeducReport?: () => void;
  onOpenFirebaseStatus?: () => void;
  syncVersion?: number;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  currentUser,
  currentSchool,
  classes,
  students,
  onNavigate,
  syncVersion = 0,
}) => {
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'admin_escola' || currentUser.role === 'super_admin';
  const isGestao = currentUser.role === 'gestao_paac';
  const isAOE = currentUser.role === 'aoe';
  const isProfessor = currentUser.role === 'professor';

  // Permissões de Módulos liberados para a Escola Atual
  const hasDiario = isModuleEnabled(currentSchool, 'diario');
  const hasPortaria = isModuleEnabled(currentSchool, 'portaria');
  const hasBuscaAtiva = isModuleEnabled(currentSchool, 'busca_ativa');
  const hasOcorrencias = isModuleEnabled(currentSchool, 'ocorrencias');
  const hasTablets = isModuleEnabled(currentSchool, 'tablets');
  const hasGradeCalendario = isModuleEnabled(currentSchool, 'grade_calendario');
  const hasRelatorios = isModuleEnabled(currentSchool, 'relatorios');

  // Auto-edição de Horários Multiplica no perfil do Professor
  const [showMultiplicaModal, setShowMultiplicaModal] = useState(false);
  const [multiplicaVersion, setMultiplicaVersion] = useState(0);

  const myMultiplicaSummary = useMemo(() => {
    if (!isProfessor && !isGestao) return '';
    try {
      const sId = currentSchool?.id || currentUser.schoolId || storageService.getActiveSchoolId();
      const ws = storageService.getTimetableWorkspace(sId);
      const periods = getEffectiveSchoolPeriods(ws);
      const uKey = normalizeTeacherKey(currentUser.name);
      const profile = (ws.teachers || []).find(
        t =>
          (currentUser.id && (t.userId === currentUser.id || t.id === currentUser.id)) ||
          normalizeTeacherKey(t.name) === uKey
      );
      return formatMultiplicaSummary(profile, periods);
    } catch {
      return '';
    }
  }, [isProfessor, isGestao, currentSchool?.id, currentUser.schoolId, currentUser.id, currentUser.name, multiplicaVersion, syncVersion]);

  // Contagem dinâmica de ocorrências pendentes de mediação para a Gestão
  const ocorrenciasSemMediacao = useMemo(() => {
    try {
      const sId = currentSchool?.id || currentUser.schoolId || storageService.getActiveSchoolId();
      const cached = lerCacheOcorrencias(sId);
      if (cached && Array.isArray(cached.registros)) {
        return cached.registros.filter((r: any) => !r.mediacao || !String(r.mediacao).trim()).length;
      }
    } catch {}
    return 0;
  }, [currentSchool?.id, currentUser.schoolId, syncVersion]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Saudação limpa e direta (sem repetição do cabeçalho principal) */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1 border-b border-slate-200/80">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
          Olá, {currentUser.name}
        </h2>
        {(isAdmin || isGestao || isAOE) && (
          <p className="text-xs text-slate-500 font-medium tabular-nums">
            {classes.length} {classes.length === 1 ? 'turma' : 'turmas'} · {students.length} {students.length === 1 ? 'estudante' : 'estudantes'}
          </p>
        )}
      </div>

      {/* ========================================================================= */}
      {/* A. PERFIL: PROFESSOR                                                      */}
      {/* ========================================================================= */}
      {isProfessor && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hasDiario && (
            <button
              type="button"
              onClick={() => onNavigate('diario', 'ausencias')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-indigo-700 transition-colors">
                  Lançamento de Frequência &amp; Ausências
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Lançar faltas, presenças e atestados médicos dos estudantes nas suas aulas e disciplinas.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600">
                <span>Acessar Diário</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasOcorrencias && (
            <button
              type="button"
              onClick={() => onNavigate('ocorrencias', undefined, undefined, 'hub')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-amber-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-amber-700 transition-colors">
                  Ocorrências Escolares
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Nova Ocorrência, Meus Registros, Devolutivas da Gestão e acompanhamento de Tutorados.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-amber-700">
                <span>Abrir Ocorrências</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasTablets && (
            <button
              type="button"
              onClick={() => onNavigate('tablets')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-sky-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <Tablet className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-sky-700 transition-colors">
                  Agendamento de Equipamentos
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Reserve equipamentos escolares por tipo e horário na grade semanal.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sky-700">
                <span>Abrir Grade</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasOcorrencias && (
            <button
              type="button"
              onClick={() => onNavigate('ocorrencias', undefined, undefined, 'tutorados')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-purple-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-purple-700 transition-colors">
                  Meus Alunos Tutorados
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Acompanhar o histórico de ocorrências e assiduidade dos estudantes sob sua tutoria docente.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-purple-700">
                <span>Ver Tutorados</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasGradeCalendario && (
            <button
              type="button"
              onClick={() => onNavigate('grade_calendario')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-teal-700 transition-colors">
                  Grade Curricular &amp; Calendário
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Consultar horários por turma e professor, Momento de Estudo, ATPCA e calendário letivo anual.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700">
                <span>Consultar Grade</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasGradeCalendario && (
            <button
              type="button"
              onClick={() => setShowMultiplicaModal(true)}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-violet-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-colors">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-violet-700 transition-colors">
                  Meu Horário Multiplica
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {myMultiplicaSummary && myMultiplicaSummary !== 'Não informado'
                    ? myMultiplicaSummary
                    : 'Cadastre ou atualize o dia e horário do seu Multiplica para sincronização na grade.'}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-violet-700">
                <span>Alterar Dia e Horário</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* B. PERFIL: GESTÃO / PAAC                                                  */}
      {/* ========================================================================= */}
      {isGestao && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(hasDiario || hasPortaria) && (
            <button
              type="button"
              onClick={() => onNavigate('diario', 'hub')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-indigo-700 transition-colors">
                  Diário &amp; Portaria
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Chamada por Turma, Portaria (Entradas &amp; Saídas), Diário do Professor e Relação de Turmas.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600">
                <span>Acessar Módulo</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasBuscaAtiva && (
            <button
              type="button"
              onClick={() => onNavigate('busca_ativa', undefined, 'hub')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-rose-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-rose-700 transition-colors">
                  Busca Ativa Escolar
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Ausências &amp; WhatsApp aos Responsáveis e Gestão de Casos Críticos de Infrequência.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-rose-700">
                <span>Acessar Busca Ativa</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasOcorrencias && (
            <button
              type="button"
              onClick={() => onNavigate('ocorrencias', undefined, undefined, 'pendentes')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-amber-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <AlertOctagon className="w-5 h-5" />
                  </div>
                  {ocorrenciasSemMediacao > 0 && (
                    <span className="text-xs font-semibold text-amber-700 tabular-nums">
                      {ocorrenciasSemMediacao} {ocorrenciasSemMediacao === 1 ? 'pendente' : 'pendentes'}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-amber-700 transition-colors">
                  Ocorrências &amp; Mediação
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Triagem disciplinar, mediação escolar, registro de parecer da gestão e tratativas com famílias.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-amber-700">
                <span>Abrir Ocorrências</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasTablets && (
            <button
              type="button"
              onClick={() => onNavigate('tablets')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-sky-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <Tablet className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-sky-700 transition-colors">
                  Agendamento de Equipamentos
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Cadastro com controle de condição, reserva por tipo e trava de plataformas digitais.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sky-700">
                <span>Ver Grade</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasRelatorios && (
            <button
              type="button"
              onClick={() => onNavigate('relatorios')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-emerald-700 transition-colors">
                  Relatórios Pedagógicos
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Frequências, busca ativa, ocorrências, equipamentos, portaria e estudantes transferidos.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
                <span>Consultar Relatórios</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('diario', 'turmas')}
            className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-purple-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-purple-700 transition-colors">
                Turmas &amp; Estudantes
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Cadastrar turmas, incluir novos estudantes (individual ou lote), editar dados e gerenciar matrículas.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-purple-700">
              <span>Gerenciar Turmas e Alunos</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {hasGradeCalendario && (
            <button
              type="button"
              onClick={() => onNavigate('grade_calendario')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-teal-700 transition-colors">
                  Grade Curricular &amp; Calendário Letivo
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Critérios anuais, distribuição automática, ajuste manual, substituições, roteiro AOE e calendário escolar.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700">
                <span>Abrir Grade &amp; Calendário</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* C. PERFIL: AOE (ORGANIZAÇÃO ESCOLAR / PORTARIA)                           */}
      {/* ========================================================================= */}
      {isAOE && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hasPortaria && (
            <button
              type="button"
              onClick={() => onNavigate('diario', 'portaria')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <DoorOpen className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-blue-700 transition-colors">
                  Controle de Portaria
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Registrar entrada de alunos atrasados e saídas antecipadas autorizadas pelos responsáveis.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-700">
                <span>Abrir Portaria</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasDiario && (
            <button
              type="button"
              onClick={() => onNavigate('diario', 'chamada')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-indigo-700 transition-colors">
                  Consulta de Frequência
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Verificar presenças e faltas do dia para averiguação de estudantes em trânsito no pátio.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600">
                <span>Ver Frequência</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {(hasDiario || hasBuscaAtiva) && (
            <button
              type="button"
              onClick={() => onNavigate('diario', 'turmas')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center group-hover:bg-slate-800 group-hover:text-white transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-slate-900 transition-colors">
                  Relação de Turmas &amp; Salas
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Localizar em qual sala ou turma o estudante está matriculado para atendimento na secretaria.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Ver Turmas</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasTablets && (
            <button
              type="button"
              onClick={() => onNavigate('tablets')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-sky-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <Tablet className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-sky-700 transition-colors">
                  Grade de Equipamentos
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Verificar agendamentos do dia e condições dos equipamentos para conferência e entrega aos docentes.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sky-700">
                <span>Ver Agendamentos</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {hasGradeCalendario && (
            <button
              type="button"
              onClick={() => onNavigate('grade_calendario')}
              className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900 mt-4 group-hover:text-teal-700 transition-colors">
                  Grade Curricular &amp; Roteiro AOE
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Horários por turma e professor, prancheta de trocas de sala, roteiro dinâmico AOE e calendário escolar.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700">
                <span>Abrir Roteiro &amp; Grade</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* D. PERFIL: ADMINISTRADOR MASTER & ESCOLAR                                 */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="space-y-4">
          {/* Card Destaque: Gerenciador Central do Sistema */}
          <button
            type="button"
            onClick={() => onNavigate('system_manager')}
            className="group w-full text-left bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-sm border border-slate-800 hover:border-indigo-400 transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-300">
                  Administração · Configurações &amp; Cadastros
                </p>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5 group-hover:text-indigo-200 transition-colors">
                  Gerenciador Central do Sistema
                </h3>
                <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
                  Cadastre e gerencie Unidades Escolares, Turmas, Estudantes, Operadores &amp; Senhas PIN, Ocorrências e Banco de Dados.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 group-hover:bg-indigo-500 text-white font-semibold text-xs transition-colors whitespace-nowrap">
              <span>Abrir Gerenciador</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* Grid dos Módulos Principais Liberados */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(hasDiario || hasPortaria) && (
              <button
                type="button"
                onClick={() => onNavigate('diario', 'hub')}
                className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-base text-slate-900 mt-4 group-hover:text-indigo-700 transition-colors">
                    Diário &amp; Portaria
                  </h4>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Chamada por Turma, Controle de Portaria, Diário do Professor e Relação de Turmas.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600">
                  <span>Acessar Módulo</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}

            {hasBuscaAtiva && (
              <button
                type="button"
                onClick={() => onNavigate('busca_ativa', undefined, 'hub')}
                className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-rose-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-base text-slate-900 mt-4 group-hover:text-rose-700 transition-colors">
                    Busca Ativa Escolar
                  </h4>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Ausências &amp; WhatsApp aos responsáveis e gestão de casos críticos de infrequência.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-rose-700">
                  <span>Acessar Busca Ativa</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}

            {hasOcorrencias && (
              <button
                type="button"
                onClick={() => onNavigate('ocorrencias', undefined, undefined, 'pendentes')}
                className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-amber-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <AlertOctagon className="w-5 h-5" />
                    </div>
                    {ocorrenciasSemMediacao > 0 && (
                      <span className="text-xs font-semibold text-amber-700 tabular-nums">
                        {ocorrenciasSemMediacao} {ocorrenciasSemMediacao === 1 ? 'pendente' : 'pendentes'}
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-base text-slate-900 mt-4 group-hover:text-amber-700 transition-colors">
                    Ocorrências &amp; Mediação
                  </h4>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Registro disciplinar, mediação da gestão e tratativas com as famílias.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-amber-700">
                  <span>Abrir Ocorrências</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}

            {hasTablets && (
              <button
                type="button"
                onClick={() => onNavigate('tablets')}
                className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-sky-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors">
                    <Tablet className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-base text-slate-900 mt-4 group-hover:text-sky-700 transition-colors">
                    Agendamento de Equipamentos
                  </h4>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Cadastro, condição de uso, reservas semanais e trava de plataformas digitais.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sky-700">
                  <span>Ver Grade</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}

            {hasRelatorios && (
              <button
                type="button"
                onClick={() => onNavigate('relatorios')}
                className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-base text-slate-900 mt-4 group-hover:text-emerald-700 transition-colors">
                    Relatórios Pedagógicos
                  </h4>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Frequências, ocorrências, equipamentos, portaria, busca ativa e transferidos.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
                  <span>Abrir Relatórios</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}

            {hasGradeCalendario && (
              <button
                type="button"
                onClick={() => onNavigate('grade_calendario')}
                className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-base text-slate-900 mt-4 group-hover:text-teal-700 transition-colors">
                    Grade Curricular &amp; Calendário
                  </h4>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Critérios anuais, distribuição de aulas, ajuste manual, substituições e calendário letivo.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700">
                  <span>Abrir Módulo</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal de Auto-Edição de Horários Multiplica pelo Professor */}
      {showMultiplicaModal && (
        <ProfessorMultiplicaModal
          currentUser={currentUser}
          onClose={() => setShowMultiplicaModal(false)}
          onSaved={() => setMultiplicaVersion(v => v + 1)}
        />
      )}
    </div>
  );
};
