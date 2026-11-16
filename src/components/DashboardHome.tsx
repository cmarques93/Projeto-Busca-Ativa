import React, { useState, useMemo } from 'react';
import {
  School,
  UserCheck,
  DoorOpen,
  AlertOctagon,
  Smartphone,
  ShieldAlert,
  Tablet,
  Sparkles,
  Settings,
  Search,
  Users,
  ArrowRight,
  Edit3,
  Inbox,
  FileText
} from 'lucide-react';
import { MainModuleType } from './Header';
import { SchoolClass, Student, ParentAlert, InterventionCase, UserSession, School as SchoolType, isModuleEnabled } from '../types';

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
    subTabDiario?: 'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas',
    subTabBuscaAtiva?: 'hub' | 'ocorrencias' | 'alertas' | 'casos',
    ocorrenciasSubTab?: string
  ) => void;
  onSelectStudent: (student: Student) => void;
  onOpenStudentRegistration?: () => void;
  onOpenSeducReport?: () => void;
  onOpenFirebaseStatus?: () => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  currentUser,
  currentSchool,
  onOpenSchoolSelector,
  classes,
  students,
  alerts,
  interventions,
  onNavigate,
  onSelectStudent,
  onOpenStudentRegistration,
}) => {
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'admin_escola' || currentUser.role === 'super_admin';
  const isGestao = currentUser.role === 'gestao_paac';
  const isAOE = currentUser.role === 'aoe';
  const isProfessor = currentUser.role === 'professor';

  // Permissões de Módulos liberados para a Escola Atual (Multi-Escola SaaS com Planos Flexíveis)
  const hasDiario = isModuleEnabled(currentSchool, 'diario');
  const hasPortaria = isModuleEnabled(currentSchool, 'portaria');
  const hasBuscaAtiva = isModuleEnabled(currentSchool, 'busca_ativa');
  const hasOcorrencias = isModuleEnabled(currentSchool, 'ocorrencias');
  const hasTablets = isModuleEnabled(currentSchool, 'tablets');
  const hasRelatorios = isModuleEnabled(currentSchool, 'relatorios');

  // Barra de busca de estudantes para Dossiê liberada apenas para Gestão/PAAC e Administrador Geral
  const canAccessDossierSearch = isAdmin || isGestao;

  // Busca rápida de alunos na tela inicial
  const [searchTerm, setSearchTerm] = useState('');

  // Carrega contagens de ocorrências do cache
  const { totalOcorrencias, ocorrenciasSemMediacao, minhasSemMediacao, minhasComDevolutiva } = useMemo(() => {
    try {
      const raw = localStorage.getItem('CACHE_OCORRENCIAS_APP');
      if (raw) {
        const parsed = JSON.parse(raw);
        const registros: any[] = parsed.registros || [];
        const semMediacao = registros.filter(r => !r.mediacao || !r.mediacao.trim()).length;
        const profName = (currentUser.name || '').trim().toLowerCase();
        const minhas = registros.filter(r => (r.professor || '').trim().toLowerCase() === profName);
        const minhasSem = minhas.filter(r => !r.mediacao || !r.mediacao.trim()).length;
        const minhasCom = minhas.filter(r => !!r.mediacao && !!r.mediacao.trim()).length;
        return {
          totalOcorrencias: registros.length,
          ocorrenciasSemMediacao: semMediacao,
          minhasSemMediacao: minhasSem,
          minhasComDevolutiva: minhasCom,
        };
      }
    } catch {}
    return {
      totalOcorrencias: 0,
      ocorrenciasSemMediacao: 0,
      minhasSemMediacao: 0,
      minhasComDevolutiva: 0,
    };
  }, [currentUser.name]);

  // Filtro de alunos para a barra de pesquisa
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return [];
    const term = searchTerm.toLowerCase().trim();
    return students
      .filter(s => s.name.toLowerCase().includes(term) || (s.ra && s.ra.toLowerCase().includes(term)))
      .slice(0, 6);
  }, [students, searchTerm]);

  // Formatação da data atual por extenso
  const dataHojeExtenso = useMemo(() => {
    return new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header de Boas-Vindas e Identificação Limpa do SigaEscola */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-7 shadow-lg border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <School className="w-3.5 h-3.5 text-indigo-400" />
                <span>{currentSchool?.name || currentUser.schoolName || 'Unidade Escolar'}</span>
                {(currentUser.role === 'super_admin' || currentUser.isUniversal) && onOpenSchoolSelector && (
                  <button
                    type="button"
                    onClick={onOpenSchoolSelector}
                    className="ml-1 text-[10px] text-indigo-200 hover:text-white underline cursor-pointer"
                  >
                    (Trocar Escola)
                  </button>
                )}
              </span>
              <span className="text-slate-400 text-xs">•</span>
              <span className="capitalize text-slate-300 text-xs font-medium">{dataHojeExtenso}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex flex-wrap items-center gap-2.5">
              <span>SigaEscola</span>
              <span className="text-xs sm:text-sm font-semibold text-slate-300 font-normal px-2.5 py-0.5 rounded-lg bg-white/10 border border-white/10">
                Portal Integrado de Busca Ativa & Gestão Escolar
              </span>
            </h1>

            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Olá, <strong className="text-white font-bold">{currentUser.name}</strong>. Selecione abaixo a funcionalidade que deseja acessar.
            </p>
          </div>

          {/* Badge do Perfil Logado */}
          <div className="shrink-0 flex items-center gap-2.5 bg-slate-800/90 border border-slate-700/80 px-4 py-2.5 rounded-2xl shadow-inner">
            <div
              className={`w-3 h-3 rounded-full ${
                isAdmin
                  ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]'
                  : isGestao
                  ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                  : isAOE
                  ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]'
                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
              }`}
            />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Perfil Ativo</p>
              <p className="text-sm font-extrabold text-white">{currentUser.roleLabel}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Barra de Busca Rápida de Alunos para Dossiê (Apenas Gestão/PAAC e Administrador Geral) */}
      {canAccessDossierSearch && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Localizar estudante por nome completo ou RA para ver dossiê..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-auto">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap mr-1">
                {classes.length} turmas • {students.length} estudantes
              </span>
              {onOpenStudentRegistration && (
                <button
                  type="button"
                  onClick={onOpenStudentRegistration}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title="Cadastrar nova turma ou matricular novos estudantes (individual ou lote)"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>+ Cadastrar Turma / Estudante</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('diario', 'turmas')}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Abrir gestão de turmas e lista de estudantes para editar ou excluir"
              >
                <Settings className="w-3.5 h-3.5 text-slate-600" />
                <span>Gerenciar Turmas & Excluir Alunos</span>
              </button>
            </div>
          </div>

          {/* Resultados rápidos de pesquisa */}
          {filteredStudents.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredStudents.map(student => (
                <button
                  key={student.id}
                  onClick={() => {
                    onSelectStudent(student);
                    setSearchTerm('');
                  }}
                  className="text-left p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-xs text-slate-800 truncate group-hover:text-indigo-900">
                      {student.name}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold text-slate-700">{student.classId}</span>
                      <span>•</span>
                      <span>RA: {student.ra || 'S/N'}</span>
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                    <span>Dossiê</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Navegação Apenas por Cards: Funcionalidades Principais por Perfil */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-black text-slate-900">
            Funcionalidades Principais
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Clique em um card para abrir o módulo ou acessar seus sub-menus
          </p>
        </div>

        {/* ========================================================================= */}
        {/* A. PERFIL: PROFESSOR                                                      */}
        {/* ========================================================================= */}
        {isProfessor && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Lançamento de Frequência & Ausências */}
            {hasDiario && (
              <div
                onClick={() => onNavigate('diario', 'ausencias')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                      <UserCheck className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                      Diário de Classe
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-indigo-600 transition-colors">
                    Lançamento de Frequência & Ausências
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Lançar faltas, presenças e atestados médicos dos estudantes nas suas aulas e disciplinas.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                  <span>Acessar Diário</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 2: Ocorrências Escolares (Leva ao Hub de Cards de Ocorrências do Professor) */}
            {(hasOcorrencias || hasBuscaAtiva) && (
              <div
                onClick={() => onNavigate('busca_ativa', undefined, 'hub')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-amber-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-2xs">
                      <AlertOctagon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                      4 Sub-menus
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-amber-600 transition-colors">
                    Ocorrências Escolares
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Nova Ocorrência, Meus Registros (Edição), Minhas Devolutivas da Gestão e Tutorados.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-600">
                  <span>Ver Sub-menus</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 3: Agendamento de Tablets */}
            {hasTablets && (
              <div
                onClick={() => onNavigate('tablets')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-sky-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-sky-600 group-hover:text-white transition-all shadow-2xs">
                      <Tablet className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200">
                      Tecnologia
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-sky-600 transition-colors">
                    Agendar Carrinho de Tablets
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Reserve kits de tablets para suas aulas por turma, horário e disciplina na grade semanal.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-sky-600">
                  <span>Abrir Grade</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 4: Meus Alunos Tutorados */}
            {(hasBuscaAtiva || hasOcorrencias) && (
              <div
                onClick={() => onNavigate('busca_ativa', undefined, 'ocorrencias', 'tutorados')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-purple-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-2xs">
                      <Users className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                      Tutoria
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-purple-600 transition-colors">
                    Meus Alunos Tutorados
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Acompanhar o histórico de ocorrências e assiduidade dos estudantes sob sua tutoria docente.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600">
                  <span>Ver Tutorados</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* B. PERFIL: GESTÃO / PAAC                                                  */}
        {/* ========================================================================= */}
        {isGestao && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Diário & Portaria (Hub com 4 sub-menus) */}
            {(hasDiario || hasPortaria) && (
              <div
                onClick={() => onNavigate('diario', 'hub')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                      <UserCheck className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                      4 Sub-menus
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-indigo-600 transition-colors">
                    Diário & Portaria
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Chamada por Turma, Portaria (Entradas & Saídas), Diário do Professor e Relação de Turmas.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                  <span>Acessar Módulo</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 2: Busca Ativa & Ocorrências (Hub com 3 sub-menus) */}
            {(hasBuscaAtiva || hasOcorrencias) && (
              <div
                onClick={() => onNavigate('busca_ativa', undefined, 'hub')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-amber-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-2xs">
                      <AlertOctagon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                      3 Sub-menus
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-amber-600 transition-colors">
                    Busca Ativa & Ocorrências
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Triagem de Ocorrências com parecer, Notificações WhatsApp e Casos Críticos com IA.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-600">
                  <span>Acessar Módulo</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 3: Agendamento de Tablets */}
            {hasTablets && (
              <div
                onClick={() => onNavigate('tablets')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-sky-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-sky-600 group-hover:text-white transition-all shadow-2xs">
                      <Tablet className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200">
                      Equipamentos
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-sky-600 transition-colors">
                    Agendamento de Tablets
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Grade semanal de alocação de equipamentos e disponibilidade de kits de tablets.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-sky-600">
                  <span>Ver Grade</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 4: Relatórios Pedagógicos SEDUC */}
            {hasRelatorios && (
              <div
                onClick={() => onNavigate('relatorios')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-2xs">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      SEDUC
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-emerald-600 transition-colors">
                    Relatórios Pedagógicos
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Demonstrativos de infrequência escolar, análise por turma e contingência oficial SEDUC.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
                  <span>Consultar Relatórios</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 5: Cadastro de Turmas & Estudantes (Gestão) */}
            <div
              onClick={() => onNavigate('diario', 'turmas')}
              className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-purple-400 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-2xs">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                    Cadastros & Exclusão
                  </span>
                </div>
                <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-purple-600 transition-colors">
                  Turmas & Estudantes (Cadastros)
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Cadastrar novas turmas, incluir novos estudantes (individual ou lote), editar dados e excluir estudantes.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600">
                <span>Gerenciar Turmas e Alunos</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* C. PERFIL: AOE (ORGANIZAÇÃO ESCOLAR / PORTARIA)                           */}
        {/* ========================================================================= */}
        {isAOE && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Portaria */}
            {hasPortaria && (
              <div
                onClick={() => onNavigate('diario', 'portaria')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-2xs">
                      <DoorOpen className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                      Portaria
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-blue-600 transition-colors">
                    Controle de Portaria
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Registrar entrada de alunos atrasados e saídas antecipadas autorizadas pelos responsáveis.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
                  <span>Abrir Portaria</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 2: Consulta de Frequência */}
            {hasDiario && (
              <div
                onClick={() => onNavigate('diario', 'chamada')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                      <UserCheck className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                      Frequência
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-indigo-600 transition-colors">
                    Consulta de Frequência
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Verificar presenças e faltas do dia para averiguação de estudantes em trânsito no pátio.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                  <span>Ver Frequência</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 3: Relação de Turmas & Salas */}
            {(hasDiario || hasBuscaAtiva) && (
              <div
                onClick={() => onNavigate('diario', 'turmas')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-slate-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-slate-700 group-hover:text-white transition-all shadow-2xs">
                      <Users className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-300">
                      Localização
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-slate-800 transition-colors">
                    Relação de Turmas & Salas
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Localizar em qual sala ou turma o estudante está matriculado para atendimento na secretaria.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Ver Turmas</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}

            {/* Card 4: Grade de Tablets */}
            {hasTablets && (
              <div
                onClick={() => onNavigate('tablets')}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-sky-400 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-sky-600 group-hover:text-white transition-all shadow-2xs">
                      <Tablet className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200">
                      Apoio
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-sky-600 transition-colors">
                    Grade de Tablets
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Verificar agendamentos do dia para conferência e entrega dos carrinhos aos professores.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-sky-600">
                  <span>Ver Agendamentos</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* D. PERFIL: ADMINISTRADOR MASTER & ESCOLAR                                 */}
        {/* ========================================================================= */}
        {isAdmin && (
          <div className="space-y-4">
            {/* Card Destaque: Gerenciador do Sistema */}
            <div
              onClick={() => onNavigate('system_manager')}
              className="group bg-linear-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-lg border border-purple-800/80 hover:border-purple-400 transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-400/40 text-purple-300 flex items-center justify-center group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-xs shrink-0">
                  <Settings className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30">
                      Painel Administrativo
                    </span>
                    <span className="text-xs text-purple-300 font-semibold">• Configurações & Cadastros</span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-1 group-hover:text-purple-200 transition-colors">
                    ⚙️ Gerenciador Central do Sistema
                  </h3>
                  <p className="text-xs text-purple-200/90 max-w-2xl mt-1 leading-relaxed">
                    Cadastre e gerencie Unidades Escolares, Turmas, Estudantes, Operadores & Senhas PIN, Ocorrências e Banco de Dados.
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md group-hover:translate-x-1 transition-transform">
                <span>Abrir Gerenciador</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Grid dos Módulos Principais Liberados */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Diário & Portaria */}
              {(hasDiario || hasPortaria) && (
                <div
                  onClick={() => onNavigate('diario', 'hub')}
                  className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                        4 Sub-menus
                      </span>
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 mt-3 group-hover:text-indigo-600 transition-colors">
                      Diário & Portaria
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">Chamada, Portaria, Ausências do Professor e Turmas.</p>
                  </div>
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                    <span>Acessar Sub-menus</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              )}

              {/* Busca Ativa & Ocorrências */}
              {(hasBuscaAtiva || hasOcorrencias) && (
                <div
                  onClick={() => onNavigate('busca_ativa', undefined, 'hub')}
                  className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-amber-400 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shadow-2xs">
                        <AlertOctagon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        3 Sub-menus
                      </span>
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 mt-3 group-hover:text-amber-600 transition-colors">
                      Busca Ativa & Ocorrências
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">Ocorrências, Notificações WhatsApp e Casos com IA.</p>
                  </div>
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-600">
                    <span>Acessar Sub-menus</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              )}

              {/* Agendamento de Tablets */}
              {hasTablets && (
                <div
                  onClick={() => onNavigate('tablets')}
                  className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-sky-400 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-all shadow-2xs">
                        <Tablet className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                        Tablets
                      </span>
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 mt-3 group-hover:text-sky-600 transition-colors">
                      Agendamento de Tablets
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">Grade semanal de carrinhos e kits de tecnologia.</p>
                  </div>
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-sky-600">
                    <span>Ver Grade</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              )}

              {/* Relatórios SEDUC */}
              {hasRelatorios && (
                <div
                  onClick={() => onNavigate('relatorios')}
                  className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-2xs">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        SEDUC
                      </span>
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 mt-3 group-hover:text-emerald-600 transition-colors">
                      Relatórios Pedagógicos
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">Demonstrativos de assiduidade e contingência.</p>
                  </div>
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
                    <span>Abrir Relatórios</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
