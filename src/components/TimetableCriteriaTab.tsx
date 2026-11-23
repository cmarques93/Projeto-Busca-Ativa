import React, { useMemo, useState } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  ShieldCheck,
  Laptop,
  Layers,
  Users,
  BookOpen,
  Link2,
  Ban,
} from 'lucide-react';
import {
  AnnualTimetableCriteria,
  ExclusiveGroupCriteria,
  SchoolClass,
  SimultaneityRuleMode,
  TimetableWorkspace,
} from '../types';
import {
  createDefaultAnnualCriteria,
  getAllCatalogDisciplines,
  groupClassesByGradeSeries,
  normalizeText,
} from '../utils/timetableEngine';

const STANDARD_STRUCTURAL_FIXED_TERMS = [
  'INTERVALO',
  'ALMOÇO',
  'TUTORIA',
  'ELETIVA',
  'CLUBE',
];

interface TimetableCriteriaTabProps {
  workspace: TimetableWorkspace;
  criteria: AnnualTimetableCriteria;
  classes: SchoolClass[];
  canEdit: boolean;
  onChangeYear: (year: number) => void;
  onCreateYear: (year: number) => void;
  onSaveCriteria: (updated: AnnualTimetableCriteria) => void;
  onOpenMatrixTab?: () => void;
}

export const TimetableCriteriaTab: React.FC<TimetableCriteriaTabProps> = ({
  workspace,
  criteria,
  classes,
  canEdit,
  onChangeYear,
  onCreateYear,
  onSaveCriteria,
  onOpenMatrixTab,
}) => {
  const [draft, setDraft] = useState<AnnualTimetableCriteria>(criteria);
  const [newYearInput, setNewYearInput] = useState<string>(
    String((workspace.activeYear || new Date().getFullYear()) + 1)
  );
  const [newFixedTerm, setNewFixedTerm] = useState('');
  const [newNotebookCustom, setNewNotebookCustom] = useState('');
  const [newPlatformKw, setNewPlatformKw] = useState('');

  // Formulário de Grupos de Simultaneidade (Exclusividade ou Acontecer Juntas)
  const [newGroupMode, setNewGroupMode] = useState<SimultaneityRuleMode>('exclusive');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSelectedDiscs, setNewGroupSelectedDiscs] = useState<string[]>([]);
  const [newGroupCustomKeyword, setNewGroupCustomKeyword] = useState('');
  const [newGroupMax, setNewGroupMax] = useState(1);
  const [newGroupSeries, setNewGroupSeries] = useState<string[]>([]);

  React.useEffect(() => {
    setDraft(criteria);
  }, [criteria]);

  const availableYears = useMemo(
    () =>
      Object.keys(workspace.criteriaByYear || {})
        .map(Number)
        .filter(n => !Number.isNaN(n))
        .sort((a, b) => b - a),
    [workspace.criteriaByYear]
  );

  // Disciplinas cadastradas na Matriz Curricular / Grade da escola
  const catalogDisciplines = useMemo(
    () => getAllCatalogDisciplines(workspace),
    [workspace]
  );

  // Anos/Séries detectados a partir das turmas cadastradas na escola
  const schoolGradeSeries = useMemo(
    () => groupClassesByGradeSeries(classes),
    [classes]
  );

  // Helpers para checkboxes de listas (normalização case-insensitive / sem acento)
  const isTermSelected = (list: string[] | undefined, value: string): boolean => {
    const targetNorm = normalizeText(value);
    return (list || []).some(item => normalizeText(item) === targetNorm);
  };

  const toggleFixedTerm = (term: string) => {
    if (!canEdit) return;
    const clean = term.trim().toUpperCase();
    const targetNorm = normalizeText(clean);
    setDraft(prev => {
      const current = prev.preservedFixedTerms || [];
      const exists = current.some(t => normalizeText(t) === targetNorm);
      return {
        ...prev,
        preservedFixedTerms: exists
          ? current.filter(t => normalizeText(t) !== targetNorm)
          : [...current, clean],
      };
    });
  };

  const toggleNotebookDiscipline = (disc: string) => {
    if (!canEdit) return;
    const clean = disc.trim().toUpperCase();
    const targetNorm = normalizeText(clean);
    setDraft(prev => {
      const currentNote = prev.noteDisciplines || [];
      const exists = currentNote.some(d => normalizeText(d) === targetNorm);
      const nextNote = exists
        ? currentNote.filter(d => normalizeText(d) !== targetNorm)
        : [...currentNote, clean];

      // Mantém platformKeywords sincronizado com disciplinas que usam notebook
      const currentPlat = prev.platformKeywords || [];
      const nextPlat = exists
        ? currentPlat.filter(k => normalizeText(k) !== targetNorm)
        : currentPlat.some(k => normalizeText(k) === targetNorm)
        ? currentPlat
        : [...currentPlat, clean];

      return {
        ...prev,
        noteDisciplines: nextNote,
        platformKeywords: nextPlat,
      };
    });
  };

  const togglePlatformKeyword = (kw: string) => {
    if (!canEdit) return;
    const clean = kw.trim().toUpperCase();
    const targetNorm = normalizeText(clean);
    setDraft(prev => {
      const current = prev.platformKeywords || [];
      const exists = current.some(k => normalizeText(k) === targetNorm);
      return {
        ...prev,
        platformKeywords: exists
          ? current.filter(k => normalizeText(k) !== targetNorm)
          : [...current, clean],
      };
    });
  };

  const handleAddCustomTag = (
    field: 'preservedFixedTerms' | 'noteDisciplines' | 'platformKeywords',
    value: string,
    clearFn: () => void
  ) => {
    const clean = value.trim().toUpperCase();
    if (!clean) return;
    const targetNorm = normalizeText(clean);
    setDraft(prev => {
      const list = prev[field] || [];
      if (list.some(t => normalizeText(t) === targetNorm)) return prev;
      const updated = { ...prev, [field]: [...list, clean] };
      if (field === 'noteDisciplines') {
        const platList = prev.platformKeywords || [];
        if (!platList.some(k => normalizeText(k) === targetNorm)) {
          updated.platformKeywords = [...platList, clean];
        }
      }
      return updated;
    });
    clearFn();
  };

  const handleRemoveTag = (
    field: 'preservedFixedTerms' | 'noteDisciplines' | 'platformKeywords',
    term: string
  ) => {
    const targetNorm = normalizeText(term);
    setDraft(prev => ({
      ...prev,
      [field]: (prev[field] || []).filter(t => normalizeText(t) !== targetNorm),
    }));
  };

  const toggleNewGroupDiscipline = (disc: string) => {
    const norm = normalizeText(disc);
    setNewGroupSelectedDiscs(prev =>
      prev.some(d => normalizeText(d) === norm)
        ? prev.filter(d => normalizeText(d) !== norm)
        : [...prev, disc]
    );
  };

  const toggleNewGroupSeries = (series: string) => {
    const norm = normalizeText(series);
    setNewGroupSeries(prev =>
      prev.some(s => normalizeText(s) === norm)
        ? prev.filter(s => normalizeText(s) !== norm)
        : [...prev, series]
    );
  };

  const handleAddSimultaneityGroup = () => {
    const customKw = newGroupCustomKeyword.trim().toUpperCase();
    const disciplines = [...newGroupSelectedDiscs];
    if (customKw && !disciplines.some(d => normalizeText(d) === normalizeText(customKw))) {
      disciplines.push(customKw);
    }
    if (disciplines.length === 0) return;

    const autoName =
      newGroupName.trim() ||
      (newGroupMode === 'together'
        ? `Aulas Conjuntas — ${disciplines.join(', ')}`
        : `Exclusividade — ${disciplines.join(', ')}`);

    const grp: ExclusiveGroupCriteria = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: autoName,
      keyword: (customKw || disciplines[0]).toUpperCase(),
      disciplines,
      mode: newGroupMode,
      maxSimultaneous:
        newGroupMode === 'together' ? 99 : Math.max(1, Number(newGroupMax) || 1),
      targetGradeSeries:
        newGroupMode === 'together' && newGroupSeries.length > 0
          ? [...newGroupSeries]
          : undefined,
      colorHex: newGroupMode === 'together' ? '#0284c7' : '#059669',
    };

    setDraft(prev => ({
      ...prev,
      exclusiveGroups: [...(prev.exclusiveGroups || []), grp],
    }));

    setNewGroupName('');
    setNewGroupSelectedDiscs([]);
    setNewGroupCustomKeyword('');
    setNewGroupMax(1);
    setNewGroupSeries([]);
  };

  const handleRemoveSimultaneityGroup = (id: string) => {
    setDraft(prev => ({
      ...prev,
      exclusiveGroups: (prev.exclusiveGroups || []).filter(g => g.id !== id),
    }));
  };

  // Termos fixos extras que não estão nem na lista estrutural nem no catálogo de disciplinas
  const extraFixedTerms = useMemo(() => {
    const baseSet = new Set([
      ...STANDARD_STRUCTURAL_FIXED_TERMS.map(normalizeText),
      ...catalogDisciplines.map(normalizeText),
    ]);
    return (draft.preservedFixedTerms || []).filter(t => !baseSet.has(normalizeText(t)));
  }, [draft.preservedFixedTerms, catalogDisciplines]);

  // Disciplinas extras de notebook que não estão no catálogo
  const extraNotebookTerms = useMemo(() => {
    const baseSet = new Set(catalogDisciplines.map(normalizeText));
    return (draft.noteDisciplines || []).filter(t => !baseSet.has(normalizeText(t)));
  }, [draft.noteDisciplines, catalogDisciplines]);

  // Palavras-chave extras de plataforma que não estão no catálogo
  const extraPlatformTerms = useMemo(() => {
    const baseSet = new Set(catalogDisciplines.map(normalizeText));
    return (draft.platformKeywords || []).filter(t => !baseSet.has(normalizeText(t)));
  }, [draft.platformKeywords, catalogDisciplines]);

  return (
    <div className="space-y-5">
      {/* Cabeçalho e Seletor de Ano Letivo / Legislação */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600" />
              <span>Critérios Anuais de Distribuição de Aulas ({draft.year})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure as regras de distribuição conforme a realidade e legislação da escola para cada ano letivo: limites diários, carrinhos de notebooks, simultaneidade (exclusivas ou conjuntas) e horários fixos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={workspace.activeYear}
              onChange={e => onChangeYear(Number(e.target.value))}
              className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-slate-50 text-slate-800 cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>
                  Critérios {y}
                </option>
              ))}
            </select>

            {canEdit && (
              <>
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
                  <input
                    type="number"
                    min={2024}
                    max={2035}
                    value={newYearInput}
                    onChange={e => setNewYearInput(e.target.value)}
                    className="w-16 text-xs font-bold px-2 py-1 bg-white border border-slate-200 rounded text-center tabular-nums"
                    title="Novo ano letivo"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const y = Number(newYearInput);
                      if (y >= 2024 && y <= 2035) onCreateYear(y);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Ano</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setDraft(createDefaultAnnualCriteria(draft.year))}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title="Restaurar critérios padrão para este ano"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Padrão</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSaveCriteria(draft)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Critérios {draft.year}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Referência Legal & Observações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
              Legislação / Resolução de Referência ({draft.year})
            </label>
            <input
              type="text"
              disabled={!canEdit}
              value={draft.legislationRef}
              onChange={e =>
                setDraft(prev => ({ ...prev, legislationRef: e.target.value }))
              }
              placeholder="Ex: Resolução SEDUC nº XX/2026 - Matriz Curricular"
              className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
              Observações Normativas do Ano Letivo
            </label>
            <input
              type="text"
              disabled={!canEdit}
              value={draft.notes || ''}
              onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Anotações sobre mudanças de carga horária ou novas regras do ano..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Regras Numéricas & Grupos de Simultaneidade + Checkboxes de Disciplinas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* COLUNA ESQUERDA: Limites Operacionais & Disciplinas com Notebook */}
        <div className="space-y-5">
          {/* Card 1: Limites Operacionais, Carrinhos e Logística AOE (sem termo NOTE) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Laptop className="w-4 h-4 text-teal-600" />
              <span>Limites Operacionais, Carrinhos e Logística AOE</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-[11px] font-bold text-slate-700 block">
                  Máx. Carrinhos de Notebooks Simultâneos
                </label>
                <p className="text-[10px] text-slate-500 mb-1.5">
                  Quantas turmas podem usar Notebooks/Tablets na mesma aula
                </p>
                <input
                  type="number"
                  min={1}
                  max={20}
                  disabled={!canEdit}
                  value={draft.maxCartsSimultaneous}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      maxCartsSimultaneous: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-full px-3 py-1.5 text-sm font-black border border-slate-300 rounded-lg bg-white tabular-nums"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-[11px] font-bold text-slate-700 block">
                  Máx. Aulas da Mesma Disciplina/Dia
                </label>
                <p className="text-[10px] text-slate-500 mb-1.5">
                  Limite diário por turma na grade curricular (padrão: 2)
                </p>
                <input
                  type="number"
                  min={1}
                  max={6}
                  disabled={!canEdit}
                  value={draft.maxSameSubjectPerDay}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      maxSameSubjectPerDay: Math.max(1, Number(e.target.value) || 2),
                    }))
                  }
                  className="w-full px-3 py-1.5 text-sm font-black border border-slate-300 rounded-lg bg-white tabular-nums"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-[11px] font-bold text-slate-700 block">
                  Limite Padrão de Aulas/Dia por Professor
                </label>
                <p className="text-[10px] text-slate-500 mb-1.5">
                  Teto diário docente padrão na escola (padrão: 7)
                </p>
                <input
                  type="number"
                  min={1}
                  max={12}
                  disabled={!canEdit}
                  value={draft.defaultTeacherDailyLimit}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      defaultTeacherDailyLimit: Math.max(1, Number(e.target.value) || 7),
                    }))
                  }
                  className="w-full px-3 py-1.5 text-sm font-black border border-slate-300 rounded-lg bg-white tabular-nums"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Agentes AOE no Corredor</span>
                </label>
                <p className="text-[10px] text-slate-500 mb-1.5">
                  Quantidade de agentes para o Roteiro Dinâmico AOE (padrão: 2)
                </p>
                <input
                  type="number"
                  min={1}
                  max={10}
                  disabled={!canEdit}
                  value={draft.availableAoeAgents}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      availableAoeAgents: Math.max(1, Number(e.target.value) || 2),
                    }))
                  }
                  className="w-full px-3 py-1.5 text-sm font-black border border-slate-300 rounded-lg bg-white tabular-nums"
                />
              </div>
            </div>

            {/* Toggles de Regras do Algoritmo */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={draft.preferDoubleLessonsNote}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      preferDoubleLessonsNote: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded text-indigo-600"
                />
                <div className="text-xs">
                  <strong className="text-indigo-950 block">
                    Priorizar Aulas Geminadas (Uso de Notebooks / Equipamentos)
                  </strong>
                  <span className="text-[11px] text-indigo-800">
                    Aloca 2 aulas consecutivas no mesmo dia para disciplinas marcadas com uso de notebooks/carrinhos sempre que possível.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={draft.preferDoubleLessonsEma}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      preferDoubleLessonsEma: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded text-emerald-600"
                />
                <div className="text-xs">
                  <strong className="text-emerald-950 block">
                    Priorizar Aulas Geminadas (Grupos de Simultaneidade)
                  </strong>
                  <span className="text-[11px] text-emerald-800">
                    Aloca blocos geminados para disciplinas cadastradas nos grupos de simultaneidade exclusiva ou conjunta.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={draft.enablePreBlockContinuityLock}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      enablePreBlockContinuityLock: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded text-amber-600"
                />
                <div className="text-xs">
                  <strong className="text-amber-950 block">
                    Trava de Continuidade (Pré-Multiplica / ATPCA)
                  </strong>
                  <span className="text-[11px] text-amber-800">
                    Evita alocar 1 aula isolada imediatamente antes de um horário de Multiplica ou ATPCA do professor.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-teal-50/60 border border-teal-200 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={draft.khanThirdCartWhenEduProfFree}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      khanThirdCartWhenEduProfFree: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded text-teal-600"
                />
                <div className="text-xs">
                  <strong className="text-teal-950 block">
                    Permitir +1 Carrinho Extra quando houver disponibilidade
                  </strong>
                  <span className="text-[11px] text-teal-800">
                    Autoriza flexibilizar +1 carrinho simultâneo em horários com folga de equipamentos na escola.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Card 2: Disciplinas que usam Notebook (Checkboxes da Grade Curricular) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-teal-600" />
                  <span>Disciplinas que usam Notebook / Carrinhos</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Marque abaixo as disciplinas cadastradas na Matriz Curricular que consomem carrinhos de notebooks/tablets na distribuição e ativam trava automática no Agendamento de Equipamentos.
                </p>
              </div>
              <span className="text-[11px] font-black text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md tabular-nums shrink-0">
                {(draft.noteDisciplines || []).length} marcada(s)
              </span>
            </div>

            {catalogDisciplines.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-2">
                <p className="text-xs text-slate-600 font-medium">
                  Nenhuma disciplina cadastrada ainda na Matriz Curricular.
                </p>
                {onOpenMatrixTab && (
                  <button
                    type="button"
                    onClick={onOpenMatrixTab}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Ir para Matriz Curricular</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {catalogDisciplines.map(disc => {
                  const checked = isTermSelected(draft.noteDisciplines, disc);
                  return (
                    <label
                      key={disc}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                        checked
                          ? 'bg-teal-50 border-teal-300 text-teal-950'
                          : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
                      } ${canEdit ? 'cursor-pointer' : 'opacity-75'}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={checked}
                        onChange={() => toggleNotebookDiscipline(disc)}
                        className="rounded text-teal-600"
                      />
                      <span className="truncate">{disc}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {extraNotebookTerms.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Outros termos configurados:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {extraNotebookTerms.map(term => (
                    <span
                      key={term}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-[11px] font-bold"
                    >
                      <span>{term}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTag('noteDisciplines', term)}
                          className="text-teal-500 hover:text-rose-600 cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {canEdit && (
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newNotebookCustom}
                  onChange={e => setNewNotebookCustom(e.target.value)}
                  placeholder="Adicionar disciplina/termo extra de notebook..."
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleAddCustomTag('noteDisciplines', newNotebookCustom, () =>
                      setNewNotebookCustom('')
                    )
                  }
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Adicionar
                </button>
              </div>
            )}

            {/* Trava de Plataformas Digitais (Equipamentos) */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <h5 className="text-[11px] font-black text-sky-900 uppercase tracking-wider">
                Disciplinas / Termos com Trava de Plataforma (Agendamento de Equipamentos)
              </h5>
              {catalogDisciplines.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {catalogDisciplines.map(disc => {
                    const checked = isTermSelected(draft.platformKeywords, disc);
                    return (
                      <label
                        key={`plat-${disc}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                          checked
                            ? 'bg-sky-50 border-sky-300 text-sky-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        } ${canEdit ? 'cursor-pointer' : 'opacity-75'}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={checked}
                          onChange={() => togglePlatformKeyword(disc)}
                          className="rounded text-sky-600"
                        />
                        <span>{disc}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {extraPlatformTerms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {extraPlatformTerms.map(k => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[11px] font-bold"
                    >
                      <span>{k}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTag('platformKeywords', k)}
                          className="text-sky-500 hover:text-rose-600 cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPlatformKw}
                    onChange={e => setNewPlatformKw(e.target.value)}
                    placeholder="Outro termo de plataforma (ex: LEIA SP, ALURA...)"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg uppercase"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleAddCustomTag('platformKeywords', newPlatformKw, () =>
                        setNewPlatformKw('')
                      )
                    }
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: Grupos de Simultaneidade (Exclusividade e Acontecer Juntas) + Termos Fixos */}
        <div className="space-y-5">
          {/* Card 3: Grupos de Simultaneidade (Exclusividade & Acontecer Juntas) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>Grupos de Simultaneidade</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Cadastre regras de <strong>Exclusividade</strong> (máximo de turmas no mesmo horário, ex.: laboratório ou quadra) e regras de <strong>Acontecer Juntas</strong> (disciplinas que devem ocorrer no mesmo horário em turmas diferentes por terem mais de um professor).
              </p>
            </div>

            {/* Lista de Grupos Cadastrados */}
            {(draft.exclusiveGroups || []).length === 0 ? (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                Nenhum grupo de simultaneidade cadastrado para {draft.year}.
              </div>
            ) : (
              <div className="space-y-2">
                {(draft.exclusiveGroups || []).map(grp => {
                  const isTogether = grp.mode === 'together';
                  const discList =
                    grp.disciplines && grp.disciplines.length > 0
                      ? grp.disciplines
                      : [grp.keyword];
                  return (
                    <div
                      key={grp.id}
                      className="flex items-start justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                              isTogether
                                ? 'bg-sky-100 text-sky-900 border border-sky-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}
                          >
                            {isTogether ? (
                              <>
                                <Link2 className="w-3 h-3" />
                                <span>Acontecer Juntas</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3 h-3" />
                                <span>Exclusividade (Máx. {grp.maxSimultaneous})</span>
                              </>
                            )}
                          </span>
                          <strong className="text-slate-900 truncate">{grp.name}</strong>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Disciplinas:{' '}
                          <strong className="text-slate-800">{discList.join(', ')}</strong>
                        </div>
                        {isTogether && grp.targetGradeSeries && grp.targetGradeSeries.length > 0 && (
                          <div className="text-[10px] text-sky-800 font-semibold">
                            Séries vinculadas: {grp.targetGradeSeries.join(', ')}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSimultaneityGroup(grp.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0"
                          title="Remover regra"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Formulário para cadastrar novo grupo */}
            {canEdit && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-[11px] font-black uppercase text-slate-700">
                  Nova Regra de Simultaneidade
                </div>

                {/* Seletor de Tipo: Exclusividade vs Acontecer Juntas */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewGroupMode('exclusive')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newGroupMode === 'exclusive'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black">
                      <Ban className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Exclusividade</span>
                    </div>
                    <p className="text-[10px] opacity-80 mt-0.5 leading-snug">
                      Limita quantas turmas podem ter a aula ao mesmo tempo.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewGroupMode('together')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newGroupMode === 'together'
                        ? 'bg-sky-50 border-sky-400 text-sky-950 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black">
                      <Link2 className="w-3.5 h-3.5 text-sky-600" />
                      <span>Acontecer Juntas</span>
                    </div>
                    <p className="text-[10px] opacity-80 mt-0.5 leading-snug">
                      Turmas no mesmo horário (mais de 1 professor p/ mesma disciplina).
                    </p>
                  </button>
                </div>

                {/* Nome + Máximo (se exclusividade) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder={
                      newGroupMode === 'together'
                        ? 'Nome (ex: Educação Física Simultânea)'
                        : 'Nome (ex: Laboratório / Quadra)'
                    }
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    className={`${
                      newGroupMode === 'exclusive' ? 'sm:col-span-2' : 'sm:col-span-3'
                    } px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white`}
                  />
                  {newGroupMode === 'exclusive' && (
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1">
                      <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                        Máx. turmas:
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={newGroupMax}
                        onChange={e => setNewGroupMax(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full text-xs font-black text-center outline-none tabular-nums"
                      />
                    </div>
                  )}
                </div>

                {/* Seleção de Disciplinas da Matriz Curricular */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-600 block">
                    Selecione as Disciplinas da Matriz Curricular:
                  </label>
                  {catalogDisciplines.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-lg bg-white border border-slate-200">
                      {catalogDisciplines.map(disc => {
                        const checked = newGroupSelectedDiscs.some(
                          d => normalizeText(d) === normalizeText(disc)
                        );
                        return (
                          <label
                            key={`grp-disc-${disc}`}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                              checked
                                ? newGroupMode === 'together'
                                  ? 'bg-sky-50 border-sky-300 text-sky-900'
                                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleNewGroupDiscipline(disc)}
                              className="rounded"
                            />
                            <span>{disc}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      Cadastre disciplinas na Matriz Curricular ou informe uma palavra-chave abaixo.
                    </p>
                  )}

                  <input
                    type="text"
                    placeholder="Ou digite uma palavra-chave / disciplina adicional (opcional)"
                    value={newGroupCustomKeyword}
                    onChange={e => setNewGroupCustomKeyword(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>

                {/* Opcional para "Acontecer Juntas": filtrar Anos/Séries específicos */}
                {newGroupMode === 'together' && schoolGradeSeries.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-600 block">
                      Anos/Séries que acontecem juntos (vazio = todas as turmas com a disciplina):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {schoolGradeSeries.map(g => {
                        const checked = newGroupSeries.some(
                          s => normalizeText(s) === normalizeText(g.gradeSeries)
                        );
                        return (
                          <label
                            key={g.gradeSeries}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                              checked
                                ? 'bg-sky-50 border-sky-300 text-sky-900'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleNewGroupSeries(g.gradeSeries)}
                              className="rounded"
                            />
                            <span>
                              {g.gradeSeries} ({g.classes.length}t)
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={
                    newGroupSelectedDiscs.length === 0 && !newGroupCustomKeyword.trim()
                  }
                  onClick={handleAddSimultaneityGroup}
                  className={`w-full py-2 px-3 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    newGroupMode === 'together'
                      ? 'bg-sky-600 hover:bg-sky-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {newGroupMode === 'together'
                      ? 'Adicionar Regra: Acontecer Juntas'
                      : 'Adicionar Regra: Exclusividade'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Card 4: Termos Fixos Preservados (Checkboxes das Disciplinas da Grade + Horários Estruturais) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-700" />
                  <span>Termos Fixos Preservados</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Marque os horários fixos e as disciplinas da grade curricular que nunca devem ser apagados na limpeza seletiva da grade.
                </p>
              </div>
              <span className="text-[11px] font-black text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md tabular-nums shrink-0">
                {(draft.preservedFixedTerms || []).length} marcado(s)
              </span>
            </div>

            {/* Horários Estruturais Fixos */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                Horários Estruturais da Escola:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {STANDARD_STRUCTURAL_FIXED_TERMS.map(term => {
                  const checked = isTermSelected(draft.preservedFixedTerms, term);
                  return (
                    <label
                      key={term}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                        checked
                          ? 'bg-slate-800 border-slate-900 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      } ${canEdit ? 'cursor-pointer' : 'opacity-75'}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={checked}
                        onChange={() => toggleFixedTerm(term)}
                        className="rounded"
                      />
                      <span>{term}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Disciplinas Cadastradas na Matriz Curricular */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                Disciplinas da Grade Curricular:
              </span>
              {catalogDisciplines.length === 0 ? (
                <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-2">
                  <p className="text-xs text-slate-600">
                    Cadastre disciplinas na Matriz Curricular para selecioná-las como fixas aqui.
                  </p>
                  {onOpenMatrixTab && (
                    <button
                      type="button"
                      onClick={onOpenMatrixTab}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Abrir Matriz Curricular</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {catalogDisciplines.map(disc => {
                    const checked = isTermSelected(draft.preservedFixedTerms, disc);
                    return (
                      <label
                        key={`fixed-${disc}`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                          checked
                            ? 'bg-slate-100 border-slate-400 text-slate-950'
                            : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
                        } ${canEdit ? 'cursor-pointer' : 'opacity-75'}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={checked}
                          onChange={() => toggleFixedTerm(disc)}
                          className="rounded text-slate-800"
                        />
                        <span className="truncate">{disc}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {extraFixedTerms.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Outros termos fixos personalizados:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {extraFixedTerms.map(term => (
                    <span
                      key={term}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold"
                    >
                      <span>{term}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTag('preservedFixedTerms', term)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {canEdit && (
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newFixedTerm}
                  onChange={e => setNewFixedTerm(e.target.value)}
                  placeholder="Adicionar outro termo fixo (ex: NIVELAMENTO)..."
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg uppercase"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleAddCustomTag('preservedFixedTerms', newFixedTerm, () =>
                      setNewFixedTerm('')
                    )
                  }
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Adicionar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
