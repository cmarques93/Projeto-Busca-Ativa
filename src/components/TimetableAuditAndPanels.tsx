import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Users,
  Building2,
  Printer,
  ArrowRight,
  ShieldAlert,
  Play,
  Route
} from 'lucide-react';
import {
  AnnualTimetableCriteria,
  SchoolClass,
  TimetableWorkspace
} from '../types';
import {
  WEEKDAYS,
  auditMatrixProgress,
  auditTeacherConflicts,
  buildTeacherBlocksMap,
  buildTeacherTimetableView,
  formatCellDisplay,
  generateStudyBank,
  getCellColorHex,
  getCellKey,
  getEffectiveSchoolPeriods,
  IntelligenceSuggestion,
  mapCorridorTransitionsAndAoeFlow,
  normalizeTeacherKey,
  simulateGradeIntelligence
} from '../utils/timetableEngine';

interface TimetableAuditAndPanelsProps {
  mode: 'audit' | 'panels';
  workspace: TimetableWorkspace;
  criteria: AnnualTimetableCriteria;
  classes: SchoolClass[];
  canEdit: boolean;
  onApplyManeuver: (suggestion: IntelligenceSuggestion) => void;
}

export const TimetableAuditAndPanels: React.FC<TimetableAuditAndPanelsProps> = ({
  mode,
  workspace,
  criteria,
  classes,
  canEdit,
  onApplyManeuver,
}) => {
  const [auditTab, setAuditTab] = useState<'conferencias' | 'conflitos' | 'estudos' | 'domino'>('conferencias');
  const [panelTab, setPanelTab] = useState<'turmas' | 'professores' | 'aoe_roteiro' | 'aoe_prancheta'>('turmas');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('todas');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('todos');
  const [studyDayFilter, setStudyDayFilter] = useState<string>('todos');
  const [aoeDayFilter, setAoeDayFilter] = useState<string>('todos');

  const matrixAudit = useMemo(
    () => auditMatrixProgress(workspace, classes),
    [workspace, classes]
  );

  const conflictAudit = useMemo(
    () => auditTeacherConflicts(workspace, classes),
    [workspace, classes]
  );

  const studyBank = useMemo(
    () => generateStudyBank(workspace, classes),
    [workspace, classes]
  );

  const intelligenceSuggestions = useMemo(
    () => simulateGradeIntelligence(workspace, classes),
    [workspace, classes]
  );

  const corridorData = useMemo(
    () => mapCorridorTransitionsAndAoeFlow(workspace, classes),
    [workspace, classes]
  );

  const effectivePeriods = useMemo(
    () => getEffectiveSchoolPeriods(workspace),
    [workspace]
  );

  const teacherBlocks = useMemo(
    () => buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods),
    [workspace.teachers, workspace.atpcaRules, effectivePeriods]
  );

  const cellMap = useMemo(() => {
    const map = new Map(workspace.cells.map(c => [getCellKey(c.dayOfWeek, c.periodId, c.classId), c]));
    return map;
  }, [workspace.cells]);

  const teachingPeriods = useMemo(
    () => (workspace.periods || []).filter(p => !p.isBreak && p.number > 0),
    [workspace.periods]
  );

  const teacherTimetableView = useMemo(
    () => buildTeacherTimetableView(workspace, classes),
    [workspace, classes]
  );

  // =========================================================================
  // MODO 1: CONFERÊNCIAS, CONFLITOS, BANCO DE ESTUDOS & INTELIGÊNCIA DOMINÓ
  // =========================================================================
  if (mode === 'audit') {
    const filteredStudy = studyBank.filter(entry => {
      const matchDay = studyDayFilter === 'todos' || String(entry.dayOfWeek) === studyDayFilter;
      const matchProf =
        selectedTeacherFilter === 'todos' ||
        normalizeTeacherKey(entry.teacherName) === normalizeTeacherKey(selectedTeacherFilter);
      return matchDay && matchProf;
    });

    const allAuditRows = [
      ...matrixAudit.note.map(r => ({ ...r, group: 'NOTEBOOK' })),
      ...matrixAudit.ema.map(r => ({ ...r, group: 'SIMULTANEIDADE' })),
      ...matrixAudit.rest.map(r => ({ ...r, group: 'REGULAR' })),
    ];

    return (
      <div className="space-y-4">
        {/* Sub-navegação da Auditoria */}
        <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
          <button
            type="button"
            onClick={() => setAuditTab('conferencias')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              auditTab === 'conferencias'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Conferência de Cargas</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
              {matrixAudit.totalPending} pend.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAuditTab('conflitos')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              auditTab === 'conflitos'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Conflitos & Bloqueios</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                conflictAudit.conflicts.length > 0
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {conflictAudit.conflicts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAuditTab('estudos')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              auditTab === 'estudos'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Banco de Estudos Estratégico</span>
          </button>

          <button
            type="button"
            onClick={() => setAuditTab('domino')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              auditTab === 'domino'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Inteligência de Grade & Dominó</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
              {intelligenceSuggestions.length}
            </span>
          </button>
        </div>

        {/* SUB 1: CONFERÊNCIAS NOTE / EMA / REST */}
        {auditTab === 'conferencias' && (
          <div className="space-y-4">
            {matrixAudit.emaSimultaneityErrors.length > 0 && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs space-y-1">
                <p className="font-black flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Alerta de Simultaneidade ({matrixAudit.emaSimultaneityErrors.length})</span>
                </p>
                {matrixAudit.emaSimultaneityErrors.map((err, i) => (
                  <p key={i} className="font-mono text-[11px]">
                    • {err}
                  </p>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-800 uppercase">
                  Conferência Geral de Aulas (Previstas vs Alocadas na Grade)
                </h4>
                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="text-slate-600">Previstas: {matrixAudit.totalPlanned}</span>
                  <span className="text-emerald-700">Alocadas: {matrixAudit.totalPlaced}</span>
                  <span className="text-amber-700">Pendentes: {matrixAudit.totalPending}</span>
                </div>
              </div>

              {allAuditRows.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">
                  Cadastre a carga semanal por Ano/Série na aba "Matriz Curricular" para acompanhar a conferência automática.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-4">Categoria</th>
                        <th className="py-2.5 px-3">Turma</th>
                        <th className="py-2.5 px-3">Disciplina</th>
                        <th className="py-2.5 px-3">Professor</th>
                        <th className="py-2.5 px-3 text-center">Previstas</th>
                        <th className="py-2.5 px-3 text-center">Na Grade</th>
                        <th className="py-2.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allAuditRows.map(row => (
                        <tr key={row.item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                row.group === 'NOTEBOOK'
                                  ? 'bg-teal-100 text-teal-900'
                                  : row.group === 'SIMULTANEIDADE'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {row.group}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">{row.item.className}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{row.item.discipline}</td>
                          <td className="py-2.5 px-3 text-slate-700">{row.item.teacherName}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">{row.planned}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">{row.placed}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                row.status === 'concluido'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : row.status === 'pendente'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {row.statusLabel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB 2: CONFLITOS_LOG */}
        {auditTab === 'conflitos' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800 uppercase">
                  Auditoria de Choques Simultâneos de Professores e Violações de ATPCA / Multiplica
                </h4>
                <span className="text-xs font-bold text-slate-600">
                  {conflictAudit.conflicts.length} ocorrência(s)
                </span>
              </div>

              {conflictAudit.conflicts.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-black text-emerald-900">
                    Zero conflitos de professores ou violações de bloqueio!
                  </p>
                  <p className="text-xs text-slate-500">
                    Todos os horários atribuídos respeitam os bloqueios de ATPCA, Multiplica e unicidade docente por aula.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {conflictAudit.conflicts.map(c => (
                    <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-rose-50/40">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black uppercase">
                            {c.type === 'choque_turma' ? 'CHOQUE DE PROFESSOR' : 'VIOLAÇÃO ATPCA/MULTIPLICA'}
                          </span>
                          <span className="text-xs font-black text-slate-900">
                            Professor(a): {c.teacherName}
                          </span>
                          <span className="text-xs text-slate-500">
                            • {c.dayLabel} — {c.periodLabel}
                          </span>
                        </div>
                        <p className="text-xs text-rose-900 font-medium mt-1">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* SUB 3: BANCO DE ESTUDOS ESTRATÉGICO */}
        {auditTab === 'estudos' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase">
                  Banco de Estudos Estratégico (Horários Livres p/ Reposição & Trocas)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Professores sem aula e fora de ATPCA/Multiplica, com indicação imediata de suas pendências na matriz.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={studyDayFilter}
                  onChange={e => setStudyDayFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-white"
                >
                  <option value="todos">Todos os Dias</option>
                  {WEEKDAYS.map(w => (
                    <option key={w.id} value={String(w.id)}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedTeacherFilter}
                  onChange={e => setSelectedTeacherFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-white"
                >
                  <option value="todos">Todos os Professores</option>
                  {workspace.teachers.map(t => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.area})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Professor</th>
                    <th className="py-2.5 px-3">Área</th>
                    <th className="py-2.5 px-3">Dia</th>
                    <th className="py-2.5 px-3">Aula</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-4">Onde Pode Repor? (Pendências)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudy.slice(0, 250).map((entry, idx) => (
                    <tr key={`${entry.teacherName}-${entry.dayOfWeek}-${entry.periodId}-${idx}`} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-bold text-slate-900">{entry.teacherName}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                          {entry.area}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{entry.dayLabel}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{entry.periodLabel}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                          {entry.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-[11px] text-slate-600">
                        {entry.pendingOpportunities.length > 0 ? (
                          <span className="text-amber-800 font-semibold">
                            {entry.pendingOpportunities.join(' • ')}
                          </span>
                        ) : (
                          <span className="text-slate-400">Carga completa</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB 4: INTELIGÊNCIA DE GRADE & EFEITO DOMINÓ */}
        {auditTab === 'domino' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-purple-50/60 border-b border-purple-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-black text-purple-950 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Simulador de Inteligência de Grade & Efeito Dominó</span>
                </h4>
                <p className="text-xs text-purple-800 mt-0.5">
                  Analisa horários vagos em turmas com aulas pendentes e calcula Manobras Verticais (internas), Efeito Dominó com Recuo entre turmas ou Substituição por Área.
                </p>
              </div>
              <span className="text-xs font-black text-purple-900 bg-white px-3 py-1 rounded-full border border-purple-200">
                {intelligenceSuggestions.length} análise(s)
              </span>
            </div>

            {intelligenceSuggestions.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <p className="text-sm font-black text-slate-800">
                  Nenhuma pendência em horários vagos!
                </p>
                <p className="text-xs text-slate-500">
                  Todas as turmas com aulas cadastradas na matriz estão completas ou não há horários vagos pendentes.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                {intelligenceSuggestions.map(sug => (
                  <div
                    key={sug.id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            sug.maneuverType === 'direto'
                              ? 'bg-emerald-600 text-white'
                              : sug.maneuverType === 'vertical'
                              ? 'bg-indigo-600 text-white'
                              : sug.maneuverType === 'domino_recuo'
                              ? 'bg-purple-600 text-white'
                              : sug.maneuverType === 'substituto_area'
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {sug.title}
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          {sug.targetClassName} • {sug.gapDayLabel} ({sug.gapPeriodLabel})
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600">
                          Pendência: {sug.pendingTeacher} ({sug.pendingDiscipline})
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{sug.explanation}</p>
                    </div>

                    {canEdit && sug.actionPayload && (
                      <button
                        type="button"
                        onClick={() => onApplyManeuver(sug)}
                        className="shrink-0 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Aplicar Manobra na Grade</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // MODO 2: PAINÉIS CONSOLIDADOS (TURMAS, PROFESSORES & CORREDOR AOE)
  // =========================================================================
  const filteredClasses =
    selectedClassFilter === 'todas'
      ? classes
      : classes.filter(c => c.id === selectedClassFilter);

  const filteredTeachers =
    selectedTeacherFilter === 'todos'
      ? teacherTimetableView.teachers
      : teacherTimetableView.teachers.filter(t => t.teacherName === selectedTeacherFilter);

  const filteredAoeRoutes = corridorData.aoeRoutes.filter(
    r => aoeDayFilter === 'todos' || String(r.dayOfWeek) === aoeDayFilter
  );

  const filteredTransitions = corridorData.transitions.filter(
    t => aoeDayFilter === 'todos' || String(t.dayOfWeek) === aoeDayFilter
  );

  return (
    <div className="space-y-4">
      {/* Sub-navegação dos Painéis */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPanelTab('turmas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              panelTab === 'turmas'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Painel por Turma</span>
          </button>

          <button
            type="button"
            onClick={() => setPanelTab('professores')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              panelTab === 'professores'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Painel por Professor</span>
          </button>

          <button
            type="button"
            onClick={() => setPanelTab('aoe_roteiro')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              panelTab === 'aoe_roteiro'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Route className="w-4 h-4" />
            <span>Roteiro Dinâmico AOE (Dominó Corredor)</span>
            {corridorData.bottleneckCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px]">
                {corridorData.bottleneckCount} gargalo(s)
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setPanelTab('aoe_prancheta')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              panelTab === 'aoe_prancheta'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            <span>Prancheta de Trocas</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Imprimir Painel</span>
        </button>
      </div>

      {/* PAINEL 1: POR TURMA */}
      {panelTab === 'turmas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-700">Filtrar Turma:</span>
            <select
              value={selectedClassFilter}
              onChange={e => setSelectedClassFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50"
            >
              <option value="todas">Todas as Turmas ({classes.length})</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredClasses.map(cls => {
              const pendingForClass = [...matrixAudit.note, ...matrixAudit.ema, ...matrixAudit.rest].filter(
                r => r.item.classId === cls.id && r.diff < 0
              );

              return (
                <div
                  key={cls.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                >
                  <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                    <h4 className="text-sm font-black">{cls.name}</h4>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        pendingForClass.length === 0
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                      }`}
                    >
                      {pendingForClass.length === 0
                        ? 'GRADE COMPLETA'
                        : `PENDENTE (${pendingForClass.reduce((s, r) => s + Math.abs(r.diff), 0)} aulas)`}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                          <th className="py-2 px-2.5 text-left font-black w-24">Aula</th>
                          {WEEKDAYS.map(w => (
                            <th key={w.id} className="py-2 px-2 text-center font-black border-l border-slate-200">
                              {w.short}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {workspace.periods.map(p => (
                          <tr key={p.id} className={p.isBreak ? 'bg-slate-100/80' : ''}>
                            <td className="py-1.5 px-2.5 font-bold text-slate-700 whitespace-nowrap">
                              <div>{p.label}</div>
                              <div className="text-[9px] text-slate-400 font-mono">
                                {p.start}-{p.end}
                              </div>
                            </td>
                            {p.isBreak ? (
                              <td
                                colSpan={5}
                                className="py-1.5 px-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 border-l border-slate-200"
                              >
                                {p.label}
                              </td>
                            ) : (
                              WEEKDAYS.map(w => {
                                const cell = cellMap.get(getCellKey(w.id, p.id, cls.id));
                                const colors = getCellColorHex(cell, workspace.teachers, criteria);
                                return (
                                  <td
                                    key={w.id}
                                    className="py-1.5 px-1.5 text-center border-l border-slate-200 align-middle"
                                    style={{ backgroundColor: colors.bg, color: colors.text }}
                                  >
                                    {cell ? (
                                      <div className="leading-tight">
                                        <div className="font-black truncate max-w-[110px] mx-auto">
                                          {cell.fixedLabel || cell.teacherName?.trim() || 'Sem professor'}
                                        </div>
                                        {!cell.fixedLabel && cell.discipline && (
                                          <div className="text-[9px] opacity-90 truncate max-w-[110px] mx-auto">
                                            ({cell.discipline})
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 text-[10px]">—</span>
                                    )}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {pendingForClass.length > 0 && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900">
                      <strong>Faltam alocar:</strong>{' '}
                      {pendingForClass
                        .map(r => `${r.item.discipline} (${Math.abs(r.diff)})`)
                        .join(' • ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PAINEL 2: POR PROFESSOR */}
      {panelTab === 'professores' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-700">Filtrar Professor:</span>
            <select
              value={selectedTeacherFilter}
              onChange={e => setSelectedTeacherFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50"
            >
              <option value="todos">Todos os Professores ({teacherTimetableView.teachers.length})</option>
              {teacherTimetableView.teachers.map(t => (
                <option key={t.teacherKey} value={t.teacherName}>
                  {t.teacherName} ({t.areas.join(', ')})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredTeachers.map(prof => {
              const tKey = prof.teacherKey;
              const blkInfo = teacherBlocks.get(tKey);
              const pendingProf = [...matrixAudit.note, ...matrixAudit.ema, ...matrixAudit.rest].filter(
                r => normalizeTeacherKey(r.item.teacherName) === tKey && r.diff < 0
              );

              return (
                <div
                  key={prof.teacherKey}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                >
                  <div className="px-4 py-3 bg-indigo-950 text-white flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black">{prof.teacherName}</h4>
                      <span className="text-[10px] text-indigo-200">
                        Áreas: {prof.areas.join(', ')} • {prof.weeklyLessonsCount} aulas/sem • Limite diário: {prof.dailyLimit} aulas
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        pendingProf.length === 0
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                      }`}
                    >
                      {pendingProf.length === 0 ? 'HORÁRIO COMPLETO' : `FALTAM ${pendingProf.reduce((s, r) => s + Math.abs(r.diff), 0)}`}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                          <th className="py-2 px-2.5 text-left font-black w-20">Aula</th>
                          {WEEKDAYS.map(w => (
                            <th key={w.id} className="py-2 px-2 text-center font-black border-l border-slate-200">
                              {w.short}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {teachingPeriods.map(p => (
                          <tr key={p.id}>
                            <td className="py-1.5 px-2.5 font-bold text-slate-700 whitespace-nowrap">
                              {p.label}
                            </td>
                            {WEEKDAYS.map(w => {
                              // Busca aulas do professor nesse dia/aula
                              const lessonsHere = classes
                                .map(c => cellMap.get(getCellKey(w.id, p.id, c.id)))
                                .filter(
                                  c =>
                                    c &&
                                    !c.fixedLabel &&
                                    normalizeTeacherKey(c.teacherName) === tKey
                                );
                              const blockKey = `${w.id}|${p.number}`;
                              const isBlocked = blkInfo?.slots.has(blockKey);

                              if (lessonsHere.length > 0) {
                                const first = lessonsHere[0]!;
                                const colors = getCellColorHex(first, workspace.teachers, criteria);
                                return (
                                  <td
                                    key={w.id}
                                    className="py-1.5 px-1.5 text-center border-l border-slate-200"
                                    style={{ backgroundColor: colors.bg, color: colors.text }}
                                  >
                                    <div className="font-black leading-tight">
                                      {lessonsHere.map(l => l!.className).join(' / ')}
                                    </div>
                                    <div className="text-[9px] opacity-85 truncate max-w-[100px] mx-auto">
                                      {first.discipline}
                                    </div>
                                  </td>
                                );
                              }

                              if (isBlocked) {
                                return (
                                  <td
                                    key={w.id}
                                    className="py-1.5 px-1.5 text-center border-l border-slate-200 bg-rose-200 text-rose-950 font-black text-[10px]"
                                  >
                                    {blkInfo?.reasons.get(blockKey) || 'MULTI/ATPCA'}
                                  </td>
                                );
                              }

                              return (
                                <td
                                  key={w.id}
                                  className="py-1.5 px-1.5 text-center border-l border-slate-200 bg-slate-100 text-slate-500 text-[10px] italic"
                                >
                                  Momento de Estudo
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {pendingProf.length > 0 && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900">
                      <strong>Faltam alocar:</strong>{' '}
                      {pendingProf
                        .map(r => `${r.item.className} - ${r.item.discipline} (${Math.abs(r.diff)})`)
                        .join(' • ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PAINEL 3: ROTEIRO DINÂMICO AOE (DOMINÓ DE CORREDOR) */}
      {panelTab === 'aoe_roteiro' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-blue-50/70 border-b border-blue-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-blue-950 flex items-center gap-2">
                <Route className="w-4 h-4 text-blue-600" />
                <span>Roteiro Dinâmico AOE — Encadeamento de Trocas de Sala</span>
              </h4>
              <p className="text-xs text-blue-800 mt-0.5">
                Calculado com base no estoque de <strong>{criteria.availableAoeAgents} agente(s) AOE</strong> configurado nos Critérios Anuais ({criteria.year}).
              </p>
            </div>
            <select
              value={aoeDayFilter}
              onChange={e => setAoeDayFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-blue-200 rounded-lg bg-white"
            >
              <option value="todos">Todos os Dias</option>
              {WEEKDAYS.map(w => (
                <option key={w.id} value={String(w.id)}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          {filteredAoeRoutes.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Todas as trocas de aula ocorrem de forma autônoma (Geminadas, Momento de Estudo ou mesmo corredor), sem necessidade de acionamento de agente AOE ou sem aulas alocadas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Dia / Troca</th>
                    <th className="py-2.5 px-3">Sala Gatilho</th>
                    <th className="py-2.5 px-3">Cadeia Dominó</th>
                    <th className="py-2.5 px-3">Agente Designado</th>
                    <th className="py-2.5 px-4">Salas Economizadas (Dispensam AOE)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAoeRoutes.map(r => (
                    <tr key={r.id} className={r.isBottleneck ? 'bg-rose-50/70' : 'hover:bg-slate-50'}>
                      <td className="py-2.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                        <div>{r.dayLabel}</div>
                        <div className="text-[10px] text-slate-500">{r.transitionLabel}</div>
                      </td>
                      <td className="py-2.5 px-3 font-black text-indigo-900">{r.triggerRoom}</td>
                      <td className="py-2.5 px-3 text-[11px] font-medium text-slate-700">{r.chainDescription}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            r.isBottleneck
                              ? 'bg-rose-600 text-white'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          }`}
                        >
                          {r.assignedAgent}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-emerald-800 font-semibold">
                        {r.savedRooms.length > 0 ? r.savedRooms.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PAINEL 4: PRANCHETA DE TROCAS COMPLETA */}
      {panelTab === 'aoe_prancheta' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-800 uppercase">
              Prancheta de Mecanismo de Trocas ({filteredTransitions.length} transições)
            </h4>
            <select
              value={aoeDayFilter}
              onChange={e => setAoeDayFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-white"
            >
              <option value="todos">Todos os Dias</option>
              {WEEKDAYS.map(w => (
                <option key={w.id} value={String(w.id)}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                <tr>
                  <th className="py-2 px-4">Dia / Transição</th>
                  <th className="py-2 px-3">Turma</th>
                  <th className="py-2 px-3">Sai</th>
                  <th className="py-2 px-3">Entra (Origem)</th>
                  <th className="py-2 px-4">Classificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransitions.slice(0, 300).map(tr => (
                  <tr key={tr.id} className="hover:bg-slate-50">
                    <td className="py-2 px-4 font-bold text-slate-700 whitespace-nowrap">
                      {tr.dayLabel} • {tr.fromPeriodLabel} → {tr.toPeriodLabel}
                    </td>
                    <td className="py-2 px-3 font-black text-slate-900">{tr.className}</td>
                    <td className="py-2 px-3 text-slate-600">{tr.leavingTeacher}</td>
                    <td className="py-2 px-3 text-slate-800 font-semibold">
                      {tr.enteringTeacher}{' '}
                      <span className="text-[10px] text-slate-400">({tr.enteringOrigin})</span>
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tr.category === 'requer_aoe'
                            ? 'bg-rose-100 text-rose-800'
                            : tr.category === 'corredor_mesmo_ano'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {tr.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
