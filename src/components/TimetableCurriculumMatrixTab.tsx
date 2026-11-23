import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle2,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  AnnualTimetableCriteria,
  GradeCurriculumEntry,
  SchoolClass,
  TimetableWorkspace,
} from '../types';
import {
  deriveInitialGradeCurriculumFromMatrix,
  extractGradeSeriesFromClass,
  groupClassesByGradeSeries,
  normalizeTeacherKey,
  normalizeText,
  syncGradeCurriculumToMatrix,
} from '../utils/timetableEngine';

const COMMON_GRADE_SERIES_SUGGESTIONS = [
  '6º Ano',
  '7º Ano',
  '8º Ano',
  '9º Ano',
  '1ª Série do EM',
  '2ª Série do EM',
  '3ª Série do EM',
  '1º Ano',
  '2º Ano',
  '3º Ano',
  '4º Ano',
  '5º Ano',
];

const COMMON_DISCIPLINE_SUGGESTIONS = [
  'Língua Portuguesa',
  'Matemática',
  'História',
  'Geografia',
  'Ciências',
  'Biologia',
  'Física',
  'Química',
  'Língua Inglesa',
  'Arte',
  'Educação Física',
  'Filosofia',
  'Sociologia',
  'Redação e Leitura',
  'Tecnologia e Inovação',
  'Projeto de Vida',
  'Educação Financeira',
  'Orientação de Estudos',
  'Práticas Experimentais',
  'Eletiva',
  'Tutoria',
];

interface TimetableCurriculumMatrixTabProps {
  workspace: TimetableWorkspace;
  criteria: AnnualTimetableCriteria;
  classes: SchoolClass[];
  canEditMatrix: boolean;
  onUpdateWorkspace: (nextWorkspace: TimetableWorkspace, message: string, undoLabel: string) => void;
  onOpenTeamTab: () => void;
}

export const TimetableCurriculumMatrixTab: React.FC<TimetableCurriculumMatrixTabProps> = ({
  workspace,
  criteria,
  classes,
  canEditMatrix,
  onUpdateWorkspace,
  onOpenTeamTab,
}) => {
  // Matriz padronizada por Ano/Série (deriva automaticamente se houver dados legados)
  const gradeCurriculum = useMemo<GradeCurriculumEntry[]>(() => {
    if (workspace.gradeCurriculum && workspace.gradeCurriculum.length > 0) {
      return workspace.gradeCurriculum;
    }
    return deriveInitialGradeCurriculumFromMatrix(workspace, classes);
  }, [workspace, classes]);

  // Agrupa automaticamente todas as turmas reais da escola por Ano/Série
  const detectedSeriesGroups = useMemo(
    () => groupClassesByGradeSeries(classes),
    [classes]
  );

  const classesBySeriesNorm = useMemo(() => {
    const map = new Map<string, SchoolClass[]>();
    for (const grp of detectedSeriesGroups) {
      map.set(normalizeText(grp.gradeSeries), grp.classes);
    }
    return map;
  }, [detectedSeriesGroups]);

  // Lista unificada de Anos/Séries (turmas detectadas + séries pré-cadastradas)
  const allGradeSeries = useMemo(() => {
    const map = new Map<string, { label: string; classes: SchoolClass[] }>();
    for (const grp of detectedSeriesGroups) {
      map.set(normalizeText(grp.gradeSeries), {
        label: grp.gradeSeries,
        classes: grp.classes,
      });
    }
    for (const entry of gradeCurriculum) {
      const k = normalizeText(entry.gradeSeries);
      if (k && !map.has(k)) {
        map.set(k, { label: entry.gradeSeries, classes: [] });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
    );
  }, [detectedSeriesGroups, gradeCurriculum]);

  const [selectedSeries, setSelectedSeries] = useState<string>(() => {
    return allGradeSeries[0]?.label || '6º Ano';
  });
  const [customSeriesInput, setCustomSeriesInput] = useState('');
  const [showAddSeries, setShowAddSeries] = useState(false);

  // Formulário simples: Disciplina + Aulas/Semana
  const [newDiscipline, setNewDiscipline] = useState('');
  const [newWeeklyLessons, setNewWeeklyLessons] = useState<number>(2);
  const [copySourceSeries, setCopySourceSeries] = useState('');
  const [expandedAssignments, setExpandedAssignments] = useState<Record<string, boolean>>({});

  // Mantém seleção válida caso a lista mude
  const activeSeriesLabel = useMemo(() => {
    if (allGradeSeries.some(s => normalizeText(s.label) === normalizeText(selectedSeries))) {
      return (
        allGradeSeries.find(s => normalizeText(s.label) === normalizeText(selectedSeries))?.label ||
        selectedSeries
      );
    }
    if (selectedSeries.trim()) return selectedSeries;
    return allGradeSeries[0]?.label || '6º Ano';
  }, [allGradeSeries, selectedSeries]);

  const activeSeriesClasses = useMemo(
    () => classesBySeriesNorm.get(normalizeText(activeSeriesLabel)) || [],
    [classesBySeriesNorm, activeSeriesLabel]
  );

  const activeEntries = useMemo(() => {
    const norm = normalizeText(activeSeriesLabel);
    return gradeCurriculum
      .filter(e => normalizeText(e.gradeSeries) === norm)
      .sort((a, b) => a.discipline.localeCompare(b.discipline, 'pt-BR'));
  }, [gradeCurriculum, activeSeriesLabel]);

  const totalWeeklyPerClass = useMemo(
    () => activeEntries.reduce((sum, e) => sum + (e.weeklyLessons || 0), 0),
    [activeEntries]
  );

  const totalSchoolLessonsForSeries = totalWeeklyPerClass * Math.max(1, activeSeriesClasses.length);

  // Mapa atual de professor atribuído por (classId|disciplineNorm)
  const assignedTeacherMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of workspace.matrix || []) {
      if (m.teacherName?.trim()) {
        map.set(`${m.classId}|${normalizeText(m.discipline)}`, m.teacherName.trim());
      }
    }
    return map;
  }, [workspace.matrix]);

  // Professores da Equipe filtrados por disciplina habilitada
  const getEligibleTeachersForDiscipline = (discipline: string) => {
    const dNorm = normalizeText(discipline);
    const allTeam = (workspace.teachers || []).filter(t => Boolean(t.name?.trim()));
    const qualified = allTeam.filter(t =>
      (t.disciplines || []).some(d => normalizeText(d) === dNorm)
    );
    return {
      qualified: qualified.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      allTeam: allTeam.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    };
  };

  const commitGradeCurriculum = (
    nextCurriculum: GradeCurriculumEntry[],
    message: string,
    undoLabel: string,
    overrideMatrix?: TimetableWorkspace['matrix']
  ) => {
    const syncedMatrix =
      overrideMatrix ||
      syncGradeCurriculumToMatrix(
        { ...workspace, gradeCurriculum: nextCurriculum },
        classes,
        nextCurriculum,
        criteria
      );
    onUpdateWorkspace(
      {
        ...workspace,
        gradeCurriculum: nextCurriculum,
        matrix: syncedMatrix,
      },
      message,
      undoLabel
    );
  };

  const handleAddSeries = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customSeriesInput.trim();
    if (!clean) return;
    setSelectedSeries(clean);
    setCustomSeriesInput('');
    setShowAddSeries(false);
  };

  const handleAddDiscipline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditMatrix) return;
    const cleanDisc = newDiscipline.trim();
    if (!cleanDisc) return;

    const seriesNorm = normalizeText(activeSeriesLabel);
    const discNorm = normalizeText(cleanDisc);
    const lessons = Math.max(1, Math.min(20, Number(newWeeklyLessons) || 1));

    const existingIdx = gradeCurriculum.findIndex(
      entry =>
        normalizeText(entry.gradeSeries) === seriesNorm &&
        normalizeText(entry.discipline) === discNorm
    );

    let nextCurriculum: GradeCurriculumEntry[];
    if (existingIdx >= 0) {
      nextCurriculum = gradeCurriculum.map((entry, idx) =>
        idx === existingIdx ? { ...entry, weeklyLessons: lessons } : entry
      );
    } else {
      nextCurriculum = [
        ...gradeCurriculum,
        {
          id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          gradeSeries: activeSeriesLabel,
          discipline: cleanDisc,
          weeklyLessons: lessons,
        },
      ];
    }

    setNewDiscipline('');
    const turmasMsg =
      activeSeriesClasses.length > 0
        ? ` Aplicado automaticamente para todas as ${activeSeriesClasses.length} turma(s) de ${activeSeriesLabel}.`
        : ` Será aplicado automaticamente assim que as turmas de ${activeSeriesLabel} forem cadastradas.`;

    commitGradeCurriculum(
      nextCurriculum,
      `${cleanDisc} (${lessons} aula(s)/sem) salva em ${activeSeriesLabel}.${turmasMsg}`,
      `Matriz ${activeSeriesLabel}: ${cleanDisc}`
    );
  };

  const handleUpdateLessons = (entryId: string, nextLessons: number) => {
    if (!canEditMatrix) return;
    const safeLessons = Math.max(1, Math.min(20, Number(nextLessons) || 1));
    const target = gradeCurriculum.find(e => e.id === entryId);
    if (!target || target.weeklyLessons === safeLessons) return;

    const nextCurriculum = gradeCurriculum.map(e =>
      e.id === entryId ? { ...e, weeklyLessons: safeLessons } : e
    );
    commitGradeCurriculum(
      nextCurriculum,
      `Carga de ${target.discipline} (${target.gradeSeries}) atualizada para ${safeLessons} aula(s)/sem.`,
      `Alterar carga ${target.discipline}`
    );
  };

  const handleRemoveEntry = (entry: GradeCurriculumEntry) => {
    if (!canEditMatrix) return;
    const nextCurriculum = gradeCurriculum.filter(e => e.id !== entry.id);
    commitGradeCurriculum(
      nextCurriculum,
      `${entry.discipline} removida da matriz de ${entry.gradeSeries}.`,
      `Remover ${entry.discipline} de ${entry.gradeSeries}`
    );
  };

  const handleCopyFromSeries = () => {
    if (!canEditMatrix || !copySourceSeries) return;
    const srcNorm = normalizeText(copySourceSeries);
    const dstNorm = normalizeText(activeSeriesLabel);
    if (srcNorm === dstNorm) return;

    const sourceItems = gradeCurriculum.filter(e => normalizeText(e.gradeSeries) === srcNorm);
    if (sourceItems.length === 0) return;

    const existingDiscs = new Set(
      gradeCurriculum
        .filter(e => normalizeText(e.gradeSeries) === dstNorm)
        .map(e => normalizeText(e.discipline))
    );

    const cloned = sourceItems
      .filter(item => !existingDiscs.has(normalizeText(item.discipline)))
      .map((item, idx) => ({
        id: `gc-copy-${Date.now()}-${idx}`,
        gradeSeries: activeSeriesLabel,
        discipline: item.discipline,
        weeklyLessons: item.weeklyLessons,
      }));

    if (cloned.length === 0) return;
    const nextCurriculum = [...gradeCurriculum, ...cloned];
    setCopySourceSeries('');
    commitGradeCurriculum(
      nextCurriculum,
      `${cloned.length} disciplina(s) copiada(s) de ${copySourceSeries} para ${activeSeriesLabel}!`,
      `Copiar matriz de ${copySourceSeries} para ${activeSeriesLabel}`
    );
  };

  const handleAssignClassTeacher = (classId: string, discipline: string, teacherName: string) => {
    if (!canEditMatrix) return;
    const synced = syncGradeCurriculumToMatrix(workspace, classes, gradeCurriculum, criteria);
    const dNorm = normalizeText(discipline);
    const updatedMatrix = synced.map(item => {
      if (item.classId === classId && normalizeText(item.discipline) === dNorm) {
        return { ...item, teacherName };
      }
      return item;
    });
    const clsName = classes.find(c => c.id === classId)?.name || classId;
    commitGradeCurriculum(
      gradeCurriculum,
      teacherName
        ? `Professor(a) ${teacherName} vinculado(a) a ${discipline} (${clsName}).`
        : `Vínculo de professor removido em ${discipline} (${clsName}).`,
      `Vincular docente em ${clsName}`,
      updatedMatrix
    );
  };

  const handleAutoAssignAllTeachersForSeries = () => {
    if (!canEditMatrix) return;
    const synced = syncGradeCurriculumToMatrix(workspace, classes, gradeCurriculum, criteria);
    const seriesNorm = normalizeText(activeSeriesLabel);
    let assignedCount = 0;

    // Distribui de forma equilibrada entre professores habilitados da Equipe para cada disciplina da série
    const counterByDisc = new Map<string, number>();
    const updatedMatrix = synced.map(item => {
      const clsObj = classes.find(c => c.id === item.classId);
      const itemSeries = item.gradeSeries || (clsObj ? extractGradeSeriesFromClass(clsObj) : '');
      if (normalizeText(itemSeries) !== seriesNorm) return item;

      const { qualified } = getEligibleTeachersForDiscipline(item.discipline);
      if (qualified.length === 0) return item;

      const dNorm = normalizeText(item.discipline);
      const currentAssignedKey = normalizeTeacherKey(item.teacherName);
      const alreadyQualified =
        currentAssignedKey &&
        qualified.some(q => normalizeTeacherKey(q.name) === currentAssignedKey);
      if (alreadyQualified) return item;

      const idx = counterByDisc.get(dNorm) || 0;
      counterByDisc.set(dNorm, idx + 1);
      assignedCount += 1;
      return {
        ...item,
        teacherName: qualified[idx % qualified.length].name,
      };
    });

    commitGradeCurriculum(
      gradeCurriculum,
      assignedCount > 0
        ? `${assignedCount} vínculo(s) docente(s) preenchido(s) automaticamente pela Equipe em ${activeSeriesLabel}!`
        : 'Nenhum vínculo pendente com professor habilitado na Equipe. Cadastre as disciplinas na aba Equipe.',
      `Auto-vincular docentes em ${activeSeriesLabel}`,
      updatedMatrix
    );
  };

  const otherSeriesWithEntries = useMemo(() => {
    const activeNorm = normalizeText(activeSeriesLabel);
    const counts = new Map<string, { label: string; count: number }>();
    for (const e of gradeCurriculum) {
      const k = normalizeText(e.gradeSeries);
      if (!k || k === activeNorm) continue;
      const prev = counts.get(k);
      if (prev) prev.count += 1;
      else counts.set(k, { label: e.gradeSeries, count: 1 });
    }
    return Array.from(counts.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
    );
  }, [gradeCurriculum, activeSeriesLabel]);

  return (
    <div className="space-y-5">
      {/* Cabeçalho Explicativo */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-teal-600" />
              <span>Matriz Curricular por Ano / Série</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Cadastre a carga semanal uma única vez por Ano/Série (ex.: <strong>6º Ano</strong> ou{' '}
              <strong>1ª Série do EM</strong>). O sistema identifica automaticamente todas as turmas
              cadastradas na escola para aquele ano letivo e replica a carga para todas elas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 tabular-nums">
            <span>
              <strong className="text-slate-900">{detectedSeriesGroups.length}</strong> ano(s)/série(s) com turmas
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>
              <strong className="text-slate-900">{classes.length}</strong> turma(s) cadastrada(s)
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>
              <strong className="text-teal-700">{gradeCurriculum.length}</strong> disciplina(s) na matriz
            </span>
          </div>
        </div>

        {!canEditMatrix && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              Modo de visualização. O cadastro e edição da Matriz Curricular são exclusivos do{' '}
              <strong>Painel Master</strong> e do <strong>Administrador Geral da escola</strong>.
            </span>
          </div>
        )}

        {/* Seletor de Ano/Série (Agrupado Automaticamente pelas Turmas da Escola) */}
        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700">
              Selecione o Ano / Série para configurar a Carga Semanal:
            </span>
            {canEditMatrix && (
              <button
                type="button"
                onClick={() => setShowAddSeries(prev => !prev)}
                className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar outro Ano/Série</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {allGradeSeries.map(series => {
              const isSelected =
                normalizeText(series.label) === normalizeText(activeSeriesLabel);
              const discCount = gradeCurriculum.filter(
                e => normalizeText(e.gradeSeries) === normalizeText(series.label)
              ).length;
              return (
                <button
                  key={series.label}
                  type="button"
                  onClick={() => setSelectedSeries(series.label)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 border ${
                    isSelected
                      ? 'bg-teal-600 text-white border-teal-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{series.label}</span>
                  <span
                    className={`text-[11px] font-semibold tabular-nums ${
                      isSelected ? 'text-teal-100' : 'text-slate-500'
                    }`}
                  >
                    {series.classes.length}{' '}
                    {series.classes.length === 1 ? 'turma' : 'turmas'}
                    {discCount > 0 ? ` · ${discCount} disc.` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {showAddSeries && canEditMatrix && (
            <form
              onSubmit={handleAddSeries}
              className="flex flex-wrap items-center gap-2 pt-2"
            >
              <input
                type="text"
                list="grade-series-suggestions"
                value={customSeriesInput}
                onChange={e => setCustomSeriesInput(e.target.value)}
                placeholder="Ex: 1ª Série do EM, 6º Ano, EJA 1..."
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white w-64"
              />
              <datalist id="grade-series-suggestions">
                {COMMON_GRADE_SERIES_SUGGESTIONS.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Abrir Ano/Série
              </button>
              <button
                type="button"
                onClick={() => setShowAddSeries(false)}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Área Principal do Ano/Série Selecionado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Coluna Esquerda: Cadastro Rápido de Disciplina */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h4 className="text-sm font-black text-slate-900">
                Carga Semanal — {activeSeriesLabel}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {activeSeriesClasses.length > 0 ? (
                  <>
                    <strong className="text-teal-700 tabular-nums">
                      {activeSeriesClasses.length}{' '}
                      {activeSeriesClasses.length === 1 ? 'turma identificada' : 'turmas identificadas'}
                    </strong>
                    :{' '}
                    {activeSeriesClasses.map(c => c.name).join(' · ')}
                  </>
                ) : (
                  'Nenhuma turma cadastrada neste ano/série ainda. Ao cadastrar as turmas da escola, esta carga será aplicada automaticamente.'
                )}
              </p>
            </div>

            {canEditMatrix ? (
              <form onSubmit={handleAddDiscipline} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Disciplina
                  </label>
                  <input
                    type="text"
                    required
                    list="common-disciplines-list"
                    value={newDiscipline}
                    onChange={e => setNewDiscipline(e.target.value)}
                    placeholder="Ex: História, Matemática, Física..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <datalist id="common-disciplines-list">
                    {COMMON_DISCIPLINE_SUGGESTIONS.map(d => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Aulas por semana (por turma)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={newWeeklyLessons}
                    onChange={e =>
                      setNewWeeklyLessons(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                    }
                    className="w-full px-3 py-2 text-sm font-bold tabular-nums border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  {activeSeriesClasses.length > 1 && (
                    <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      Total na escola: {newWeeklyLessons} × {activeSeriesClasses.length} turmas ={' '}
                      <strong>{newWeeklyLessons * activeSeriesClasses.length} aulas/semana</strong>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Salvar Disciplina em {activeSeriesLabel}</span>
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500">
                Consulte a carga semanal cadastrada ao lado.
              </p>
            )}

            {/* Copiar de outro Ano/Série */}
            {canEditMatrix && otherSeriesWithEntries.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copiar disciplinas de outro Ano/Série</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={copySourceSeries}
                    onChange={e => setCopySourceSeries(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  >
                    <option value="">Selecionar origem...</option>
                    {otherSeriesWithEntries.map(s => (
                      <option key={s.label} value={s.label}>
                        {s.label} ({s.count} disc.)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!copySourceSeries}
                    onClick={handleCopyFromSeries}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Resumo da Carga */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Carga semanal por turma</span>
              <strong className="text-slate-900 text-sm font-black tabular-nums">
                {totalWeeklyPerClass} aulas
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Turmas em {activeSeriesLabel}</span>
              <strong className="text-slate-900 tabular-nums">
                {activeSeriesClasses.length}
              </strong>
            </div>
            {activeSeriesClasses.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-600">Total semanal na escola</span>
                <strong className="text-teal-700 font-black tabular-nums">
                  {totalSchoolLessonsForSeries} aulas
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: Lista de Disciplinas do Ano/Série + Vínculo Docente Opcional por Turma */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-slate-900">
                Disciplinas de {activeSeriesLabel}
              </h4>
              <p className="text-xs text-slate-500">
                {activeEntries.length} disciplina(s) · {totalWeeklyPerClass} aulas/sem por turma
              </p>
            </div>

            {canEditMatrix && activeEntries.length > 0 && activeSeriesClasses.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoAssignAllTeachersForSeries}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  title="Vincula automaticamente os professores cadastrados na aba Equipe para cada disciplina"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-vincular Professores da Equipe</span>
                </button>
              </div>
            )}
          </div>

          {activeEntries.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-bold text-slate-700">
                Nenhuma disciplina cadastrada para {activeSeriesLabel}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Adicione as disciplinas e a quantidade de aulas semanais no formulário ao lado.
                Todas as turmas de {activeSeriesLabel} receberão essa carga automaticamente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeEntries.map(entry => {
                const { qualified, allTeam } = getEligibleTeachersForDiscipline(entry.discipline);
                const isExpanded = Boolean(expandedAssignments[entry.id]);
                const assignedCount = activeSeriesClasses.filter(cls =>
                  Boolean(assignedTeacherMap.get(`${cls.id}|${normalizeText(entry.discipline)}`))
                ).length;

                return (
                  <div key={entry.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">
                            {entry.discipline}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs text-slate-600 tabular-nums">
                            {activeSeriesClasses.length > 0
                              ? `${entry.weeklyLessons * activeSeriesClasses.length} aulas/sem em ${activeSeriesClasses.length} ${
                                  activeSeriesClasses.length === 1 ? 'turma' : 'turmas'
                                }`
                              : `${entry.weeklyLessons} aula(s)/sem por turma`}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                          <span>
                            Docentes habilitados na Equipe:{' '}
                            <strong
                              className={
                                qualified.length > 0 ? 'text-emerald-700' : 'text-amber-700'
                              }
                            >
                              {qualified.length > 0
                                ? qualified.map(q => q.name).join(', ')
                                : 'Nenhum marcado ainda'}
                            </strong>
                          </span>
                          {qualified.length === 0 && canEditMatrix && (
                            <button
                              type="button"
                              onClick={onOpenTeamTab}
                              className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                            >
                              Configurar na Equipe
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] text-slate-500 font-semibold">
                            Aulas/sem:
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            disabled={!canEditMatrix}
                            value={entry.weeklyLessons}
                            onChange={e =>
                              handleUpdateLessons(entry.id, Number(e.target.value))
                            }
                            className="w-16 px-2 py-1 text-xs font-bold tabular-nums text-center border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                          />
                        </div>

                        {activeSeriesClasses.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedAssignments(prev => ({
                                ...prev,
                                [entry.id]: !prev[entry.id],
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Users className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="tabular-nums">
                              Turmas ({assignedCount}/{activeSeriesClasses.length})
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {canEditMatrix && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEntry(entry)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title={`Remover ${entry.discipline} de ${activeSeriesLabel}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Vínculo rápido de professor por turma deste Ano/Série */}
                    {isExpanded && activeSeriesClasses.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {activeSeriesClasses.map(cls => {
                          const currentTeacher =
                            assignedTeacherMap.get(`${cls.id}|${normalizeText(entry.discipline)}`) ||
                            '';
                          const optionsList = qualified.length > 0 ? qualified : allTeam;
                          return (
                            <div
                              key={cls.id}
                              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200"
                            >
                              <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                {cls.name}
                              </span>
                              <select
                                disabled={!canEditMatrix}
                                value={currentTeacher}
                                onChange={e =>
                                  handleAssignClassTeacher(cls.id, entry.discipline, e.target.value)
                                }
                                className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
                              >
                                <option value="">Selecionar docente...</option>
                                {optionsList.map(t => (
                                  <option key={t.id} value={t.name}>
                                    {t.name}
                                  </option>
                                ))}
                                {currentTeacher &&
                                  !optionsList.some(
                                    t =>
                                      normalizeTeacherKey(t.name) ===
                                      normalizeTeacherKey(currentTeacher)
                                  ) && (
                                    <option value={currentTeacher}>{currentTeacher}</option>
                                  )}
                              </select>
                              {currentTeacher && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
