import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  Grid3X3,
  Sliders,
  Sparkles,
  Users,
  Laptop,
  Layers,
  Trash2,
  Eye,
  ArrowLeftRight,
  Lock,
  Save,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldAlert,
  Play,
  FileSpreadsheet,
  Upload,
  Undo2,
  Redo2,
  UserCheck,
  Clock
} from 'lucide-react';
import {
  AnnualTimetableCriteria,
  SchoolClass,
  TimetableGridCell,
  TimetablePeriodDef,
  TimetableWorkspace,
  UserSession
} from '../types';
import { storageService } from '../data/storageService';
import { firestoreService } from '../lib/firestoreService';
import {
  WEEKDAYS,
  applyIntelligenceManeuver,
  auditMatrixProgress,
  auditTeacherConflicts,
  buildTeacherBlocksMap,
  buildTeacherTimetableView,
  clearAttributableGrid,
  clearDisciplineFromGrid,
  createDefaultAnnualCriteria,
  distributeMatrixEma,
  distributeMatrixNote,
  distributeMatrixRest,
  getActiveCriteria,
  getAllCatalogDisciplines,
  getCellColorHex,
  getCellKey,
  getEffectiveSchoolPeriods,
  hasInvertedTeacherDiscipline,
  hasPlatformKeyword,
  IntelligenceSuggestion,
  isExclusiveGroupDiscipline,
  isNoteDiscipline,
  normalizeAndEnrichTimetableCells,
  normalizeTeacherKey,
  swapTeacherAndDisciplineInWorkspace,
  syncGradeCurriculumToMatrix
} from '../utils/timetableEngine';
import { SchoolCalendarPanel } from './SchoolCalendarPanel';
import { TimetableCriteriaTab } from './TimetableCriteriaTab';
import { TimetableAuditAndPanels } from './TimetableAuditAndPanels';
import { TimetableImportModal } from './TimetableImportModal';
import { TimetableSubstitutionsTab } from './TimetableSubstitutionsTab';
import { TimetableByTeacherTab } from './TimetableByTeacherTab';
import { TimetableCurriculumMatrixTab } from './TimetableCurriculumMatrixTab';
import { TimetableTeamTab } from './TimetableTeamTab';
import { ProfessorMultiplicaModal } from './ProfessorMultiplicaModal';

function normalizeWorkspaceOnLoad(ws: TimetableWorkspace): { workspace: TimetableWorkspace; changed: boolean } {
  let current = ws;
  let changed = false;
  if (hasInvertedTeacherDiscipline(current)) {
    current = swapTeacherAndDisciplineInWorkspace(current);
    changed = true;
  }
  const enriched = normalizeAndEnrichTimetableCells(current);
  if (enriched.fixedCount > 0) {
    current = enriched.workspace;
    changed = true;
  }
  return { workspace: current, changed };
}

type ActiveTimetableTab =
  | 'grade'
  | 'por_professor'
  | 'matriz'
  | 'equipe'
  | 'criterios'
  | 'auditoria'
  | 'paineis'
  | 'substituicoes'
  | 'calendario';

interface CurriculumCalendarModuleProps {
  currentUser: UserSession;
  classes: SchoolClass[];
  onRefresh?: () => void;
  initialTab?: ActiveTimetableTab | 'matrizes';
}

export const CurriculumCalendarModule: React.FC<CurriculumCalendarModuleProps> = ({
  currentUser,
  classes,
  onRefresh,
  initialTab,
}) => {
  const isAdmin =
    currentUser.role === 'admin' ||
    currentUser.role === 'admin_escola' ||
    currentUser.role === 'super_admin';
  const isGestao = currentUser.role === 'gestao_paac';
  const isProfessor = currentUser.role === 'professor';
  const canEdit = isAdmin || isGestao;
  const canSelfEditMultiplica = isProfessor || isGestao;

  const resolvedInitialTab: ActiveTimetableTab =
    initialTab === 'matrizes'
      ? 'matriz'
      : initialTab || (canEdit ? 'grade' : 'por_professor');

  const [activeTab, setActiveTab] = useState<ActiveTimetableTab>(resolvedInitialTab);
  const [substitutionsInitialSubView, setSubstitutionsInitialSubView] = useState<
    'escalar' | 'areas' | undefined
  >(undefined);
  const [showMyMultiplicaModal, setShowMyMultiplicaModal] = useState(false);

  const [workspace, setWorkspace] = useState<TimetableWorkspace>(() => {
    const initial = storageService.getTimetableWorkspace();
    return normalizeWorkspaceOnLoad(initial).workspace;
  });
  const [undoStack, setUndoStack] = useState<Array<{ workspace: TimetableWorkspace; label: string }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ workspace: TimetableWorkspace; label: string }>>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Controles interativos da Grade Completa
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'todos'>('todos');
  const [highlightEmpty, setHighlightEmpty] = useState<boolean>(false);
  const [swapMode, setSwapMode] = useState<boolean>(false);
  const [swapSourceCell, setSwapSourceCell] = useState<{
    dayOfWeek: number;
    period: TimetablePeriodDef;
    cls: SchoolClass;
  } | null>(null);
  const [selectedRestDiscipline, setSelectedRestDiscipline] = useState<string>('__TODAS__');
  const [disciplineToClear, setDisciplineToClear] = useState<string>('');
  const [confirmClearModal, setConfirmClearModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);

  // Modal de Edição Manual de Célula
  const [editingSlot, setEditingSlot] = useState<{
    dayOfWeek: number;
    period: TimetablePeriodDef;
    cls: SchoolClass;
    mode: 'aula' | 'fixa';
    teacherName: string;
    discipline: string;
    category: 'note' | 'ema' | 'rest' | 'manual';
    fixedLabel: string;
    locked: boolean;
    hasPlatform: boolean;
    platformName: string;
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Carrega workspace mais recente do Firestore ao abrir o módulo (garantindo sempre formato Professor (Disciplina))
  useEffect(() => {
    const sId = storageService.getActiveSchoolId();
    const localWs = storageService.getTimetableWorkspace(sId);
    const localNorm = normalizeWorkspaceOnLoad(localWs);
    if (localNorm.changed) {
      storageService.saveTimetableWorkspace(localNorm.workspace, true, sId);
    }
    setWorkspace(localNorm.workspace);

    firestoreService
      .getTimetableWorkspace(sId)
      .then(cloudWs => {
        if (cloudWs && cloudWs.criteriaByYear && Array.isArray(cloudWs.periods)) {
          const cloudNorm = normalizeWorkspaceOnLoad(cloudWs);
          if (cloudNorm.changed) {
            storageService.saveTimetableWorkspace(cloudNorm.workspace, true, sId);
            setWorkspace(cloudNorm.workspace);
          } else {
            storageService.setTimetableWorkspace(cloudWs, sId);
            setWorkspace(cloudWs);
          }
        }
      })
      .catch(() => {});
  }, []);

  const criteria = useMemo(() => getActiveCriteria(workspace), [workspace]);

  const effectivePeriods = useMemo(
    () => getEffectiveSchoolPeriods(workspace),
    [workspace]
  );

  const catalogDisciplines = useMemo(
    () => getAllCatalogDisciplines(workspace),
    [workspace]
  );

  const cellMap = useMemo(() => {
    const map = new Map<string, TimetableGridCell>();
    for (const c of workspace.cells || []) {
      map.set(getCellKey(c.dayOfWeek, c.periodId, c.classId), c);
    }
    return map;
  }, [workspace.cells]);

  const matrixAudit = useMemo(
    () => auditMatrixProgress(workspace, classes),
    [workspace, classes]
  );

  const conflictAudit = useMemo(
    () => auditTeacherConflicts(workspace, classes),
    [workspace, classes]
  );

  const teacherBlocks = useMemo(
    () => buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods),
    [workspace.teachers, workspace.atpcaRules, effectivePeriods]
  );

  const teacherTimetableSummary = useMemo(
    () => buildTeacherTimetableView(workspace, classes),
    [workspace, classes]
  );

  const restDisciplinesList = useMemo(() => {
    const syncedMatrix = syncGradeCurriculumToMatrix(workspace, classes);
    const set = new Set<string>();
    for (const m of syncedMatrix) {
      if (m.category === 'rest' && m.discipline.trim()) {
        set.add(m.discipline.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [workspace, classes]);

  const allPlacedDisciplinesList = useMemo(() => {
    const set = new Set<string>();
    for (const c of workspace.cells || []) {
      if (!c.fixedLabel && c.discipline?.trim()) set.add(c.discipline.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [workspace.cells]);

  const persistWorkspace = (
    next: TimetableWorkspace,
    feedbackMsg?: string,
    undoLabel?: string,
    options?: { skipHistory?: boolean }
  ) => {
    if (!options?.skipHistory && next !== workspace) {
      setUndoStack(prev => [
        ...prev.slice(-24),
        {
          workspace,
          label: undoLabel || feedbackMsg || 'Alteração na grade',
        },
      ]);
      setRedoStack([]);
    }

    setIsSaving(true);
    try {
      const saved = storageService.saveTimetableWorkspace(
        { ...next, updatedBy: currentUser.name },
        true
      );
      setWorkspace(saved);
      if (feedbackMsg) showToast(feedbackMsg, 'success');
      onRefresh?.();
    } catch (err: any) {
      showToast('Erro ao salvar grade: ' + (err?.message || 'Erro'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [
      ...prev.slice(-24),
      { workspace, label: previous.label },
    ]);
    persistWorkspace(
      previous.workspace,
      `Alteração desfeita (${previous.label}).`,
      undefined,
      { skipHistory: true }
    );
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [
      ...prev.slice(-24),
      { workspace, label: restored.label },
    ]);
    persistWorkspace(
      restored.workspace,
      `Alteração refeita (${restored.label}).`,
      undefined,
      { skipHistory: true }
    );
  };

  // Atalhos de teclado Ctrl+Z / Ctrl+Y para voltar ou refazer alterações
  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        if (redoStack.length > 0) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canEdit, undoStack, redoStack, workspace]);

  // =========================================================================
  // AÇÕES DO GERADOR DE HORÁRIOS (FIÉIS AO SCRIPT)
  // =========================================================================
  const handleRunNoteDistribution = () => {
    const res = distributeMatrixNote(workspace, classes);
    if (res.alreadyComplete) {
      showToast(res.summaryMessage, 'info');
      return;
    }
    persistWorkspace({ ...workspace, cells: res.cells }, res.summaryMessage);
  };

  const handleRunEmaDistribution = () => {
    const res = distributeMatrixEma(workspace, classes);
    if (res.alreadyComplete) {
      showToast(res.summaryMessage, 'info');
      return;
    }
    persistWorkspace({ ...workspace, cells: res.cells }, res.summaryMessage);
  };

  const handleRunRestDistribution = () => {
    const target = selectedRestDiscipline === '__TODAS__' ? undefined : selectedRestDiscipline;
    const res = distributeMatrixRest(workspace, classes, target);
    if (res.alreadyComplete) {
      showToast(res.summaryMessage, 'info');
      return;
    }
    persistWorkspace({ ...workspace, cells: res.cells }, res.summaryMessage);
  };

  const handleConfirmClearAttributable = () => {
    const res = clearAttributableGrid(workspace);
    setConfirmClearModal(false);
    persistWorkspace(
      { ...workspace, cells: res.cells },
      `Limpeza seletiva concluída: ${res.removedCount} aula(s) removida(s). Aulas fixas PEI e células travadas preservadas.`
    );
  };

  const handleClearSingleDiscipline = () => {
    if (!disciplineToClear) return;
    const res = clearDisciplineFromGrid(workspace, disciplineToClear);
    persistWorkspace(
      { ...workspace, cells: res.cells },
      `${res.removedCount} aula(s) de "${disciplineToClear}" removida(s) da grade.`
    );
    setDisciplineToClear('');
  };

  const handleApplyIntelligenceManeuver = (suggestion: IntelligenceSuggestion) => {
    const nextCells = applyIntelligenceManeuver(workspace, suggestion);
    if (!nextCells) {
      showToast('Não foi possível aplicar esta manobra automaticamente. Faça o ajuste manual na grade.', 'error');
      return;
    }
    persistWorkspace(
      { ...workspace, cells: nextCells },
      `Manobra aplicada na grade: ${suggestion.title} (${suggestion.targetClassName}).`
    );
  };

  // =========================================================================
  // AJUSTE MANUAL FLEXÍVEL: CLIQUE NA CÉLULA (EDITAR OU TROCAR DE POSIÇÃO)
  // =========================================================================
  const handleCellClick = (dayOfWeek: number, period: TimetablePeriodDef, cls: SchoolClass) => {
    if (!canEdit || period.isBreak) return;

    // Modo Troca (Swap) entre 2 células
    if (swapMode) {
      if (!swapSourceCell) {
        setSwapSourceCell({ dayOfWeek, period, cls });
        showToast(
          `Origem selecionada: ${cls.name} (${WEEKDAYS.find(w => w.id === dayOfWeek)?.short} ${period.label}). Clique na célula de destino para trocar.`,
          'info'
        );
        return;
      }

      const srcKey = getCellKey(swapSourceCell.dayOfWeek, swapSourceCell.period.id, swapSourceCell.cls.id);
      const dstKey = getCellKey(dayOfWeek, period.id, cls.id);
      if (srcKey === dstKey) {
        setSwapSourceCell(null);
        return;
      }

      const nextMap = new Map<string, TimetableGridCell>(cellMap);
      const srcCell = nextMap.get(srcKey);
      const dstCell = nextMap.get(dstKey);

      nextMap.delete(srcKey);
      nextMap.delete(dstKey);

      if (srcCell) {
        nextMap.set(dstKey, {
          ...srcCell,
          id: dstKey,
          dayOfWeek,
          periodId: period.id,
          periodNumber: period.number,
          periodLabel: period.label,
          classId: cls.id,
          className: cls.name,
        });
      }
      if (dstCell) {
        nextMap.set(srcKey, {
          ...dstCell,
          id: srcKey,
          dayOfWeek: swapSourceCell.dayOfWeek,
          periodId: swapSourceCell.period.id,
          periodNumber: swapSourceCell.period.number,
          periodLabel: swapSourceCell.period.label,
          classId: swapSourceCell.cls.id,
          className: swapSourceCell.cls.name,
        });
      }

      setSwapSourceCell(null);
      persistWorkspace(
        { ...workspace, cells: Array.from(nextMap.values()) },
        `Troca manual realizada entre ${swapSourceCell.cls.name} e ${cls.name}!`
      );
      return;
    }

    // Modo Edição Manual da Célula
    const existing = cellMap.get(getCellKey(dayOfWeek, period.id, cls.id));
    setEditingSlot({
      dayOfWeek,
      period,
      cls,
      mode: existing?.fixedLabel ? 'fixa' : 'aula',
      teacherName: existing?.teacherName || '',
      discipline: existing?.discipline || '',
      category:
        existing?.category && existing.category !== 'fixed'
          ? existing.category
          : 'manual',
      fixedLabel: existing?.fixedLabel || 'TUTORIA',
      locked: Boolean(existing?.locked),
      hasPlatform: Boolean(existing?.hasPlatform),
      platformName: existing?.platformName || '',
    });
  };

  // Aviso em tempo real dentro do Modal de Edição Manual (choque de professor ou bloqueio ATPCA/Multiplica)
  const editingSlotWarnings = useMemo(() => {
    if (!editingSlot || editingSlot.mode !== 'aula' || !editingSlot.teacherName.trim()) {
      return [];
    }
    const warns: string[] = [];
    const tKey = normalizeTeacherKey(editingSlot.teacherName);
    const blockInfo = teacherBlocks.get(tKey);
    const blkKey = `${editingSlot.dayOfWeek}|${editingSlot.period.number}`;
    if (blockInfo?.slots.has(blkKey)) {
      warns.push(
        `Atenção: ${editingSlot.teacherName} possui bloqueio (${blockInfo.reasons.get(blkKey) || 'ATPCA/Multiplica'}) neste horário.`
      );
    }
    for (const c of classes) {
      if (c.id === editingSlot.cls.id) continue;
      const other = cellMap.get(getCellKey(editingSlot.dayOfWeek, editingSlot.period.id, c.id));
      if (other && !other.fixedLabel && normalizeTeacherKey(other.teacherName) === tKey) {
        warns.push(
          `Choque de horário: ${editingSlot.teacherName} já está em ${c.name} (${other.discipline || ''}) neste mesmo horário.`
        );
      }
    }
    return warns;
  }, [editingSlot, teacherBlocks, classes, cellMap]);

  const handleSaveManualCell = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;

    const key = getCellKey(editingSlot.dayOfWeek, editingSlot.period.id, editingSlot.cls.id);
    const nextMap = new Map(cellMap);

    if (editingSlot.mode === 'fixa') {
      const label = editingSlot.fixedLabel.trim().toUpperCase() || 'TUTORIA';
      nextMap.set(key, {
        id: key,
        dayOfWeek: editingSlot.dayOfWeek,
        periodId: editingSlot.period.id,
        periodNumber: editingSlot.period.number,
        periodLabel: editingSlot.period.label,
        classId: editingSlot.cls.id,
        className: editingSlot.cls.name,
        fixedLabel: label,
        category: 'fixed',
        locked: true,
        colorHex: criteria.areaColors?.FIXED || '#e2e8f0',
      });
    } else {
      if (!editingSlot.teacherName.trim() && !editingSlot.discipline.trim()) {
        nextMap.delete(key);
      } else {
        const disc = editingSlot.discipline.trim();
        const inferredCat = isNoteDiscipline(disc, criteria)
          ? 'note'
          : isExclusiveGroupDiscipline(disc, criteria)
          ? 'ema'
          : editingSlot.category;
        const isPlat =
          editingSlot.hasPlatform ||
          inferredCat === 'note' ||
          hasPlatformKeyword(disc, criteria);

        const newCell: TimetableGridCell = {
          id: key,
          dayOfWeek: editingSlot.dayOfWeek,
          periodId: editingSlot.period.id,
          periodNumber: editingSlot.period.number,
          periodLabel: editingSlot.period.label,
          classId: editingSlot.cls.id,
          className: editingSlot.cls.name,
          teacherName: editingSlot.teacherName.trim(),
          discipline: disc,
          category: inferredCat,
          locked: editingSlot.locked,
          hasPlatform: isPlat,
          platformName: isPlat ? (editingSlot.platformName.trim() || disc) : undefined,
        };
        newCell.colorHex = getCellColorHex(newCell, workspace.teachers, criteria).bg;
        nextMap.set(key, newCell);
      }
    }

    setEditingSlot(null);
    persistWorkspace(
      { ...workspace, cells: Array.from(nextMap.values()) },
      `Horário atualizado manualmente em ${editingSlot.cls.name} (${editingSlot.period.label}).`
    );
  };

  const handleClearManualCell = () => {
    if (!editingSlot) return;
    const key = getCellKey(editingSlot.dayOfWeek, editingSlot.period.id, editingSlot.cls.id);
    const nextMap = new Map(cellMap);
    nextMap.delete(key);
    setEditingSlot(null);
    persistWorkspace(
      { ...workspace, cells: Array.from(nextMap.values()) },
      `Célula liberada em ${editingSlot.cls.name} (${editingSlot.period.label}).`
    );
  };

  // =========================================================================
  // CRITÉRIOS ANUAIS (LEGISLAÇÃO)
  // =========================================================================
  const handleChangeCriteriaYear = (year: number) => {
    const nextWs: TimetableWorkspace = {
      ...workspace,
      activeYear: year,
      criteriaByYear: {
        ...workspace.criteriaByYear,
        [year]: workspace.criteriaByYear[year] || createDefaultAnnualCriteria(year),
      },
    };
    const synced = syncGradeCurriculumToMatrix(nextWs, classes);
    persistWorkspace(
      { ...nextWs, matrix: synced },
      `Ano letivo de critérios alterado para ${year}.`
    );
  };

  const handleCreateCriteriaYear = (year: number) => {
    if (workspace.criteriaByYear[year]) {
      handleChangeCriteriaYear(year);
      return;
    }
    const cloned: AnnualTimetableCriteria = {
      ...criteria,
      year,
      legislationRef: `Resolução / Diretrizes Curriculares ${year}`,
      updatedAt: new Date().toISOString(),
    };
    const nextWs: TimetableWorkspace = {
      ...workspace,
      activeYear: year,
      criteriaByYear: {
        ...workspace.criteriaByYear,
        [year]: cloned,
      },
    };
    persistWorkspace(nextWs, `Novo conjunto de critérios criado para o ano ${year}!`);
  };

  const handleSaveAnnualCriteria = (updated: AnnualTimetableCriteria) => {
    const nextWs: TimetableWorkspace = {
      ...workspace,
      activeYear: updated.year,
      criteriaByYear: {
        ...workspace.criteriaByYear,
        [updated.year]: {
          ...updated,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name,
        },
      },
    };
    const syncedMatrix = syncGradeCurriculumToMatrix(nextWs, classes);
    persistWorkspace(
      { ...nextWs, matrix: syncedMatrix },
      `Critérios anuais de ${updated.year} salvos! A matriz e o motor de distribuição já operam com as novas regras.`
    );
  };

  const visibleWeekdays =
    selectedDayFilter === 'todos'
      ? WEEKDAYS
      : WEEKDAYS.filter(w => w.id === selectedDayFilter);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl text-white text-xs sm:text-sm font-semibold flex items-center gap-2 max-w-md ${
            toast.type === 'success'
              ? 'bg-emerald-600'
              : toast.type === 'error'
              ? 'bg-rose-600'
              : 'bg-indigo-600'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Cabeçalho Institucional do Módulo Separado */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Grid3X3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  Grade Curricular, Gerador de Horários & Calendário Letivo
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Critérios {criteria.year}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {criteria.legislationRef} • Distribuição automatizada por critérios anuais + ajuste manual flexível + sincronização com Equipamentos e Diário do Professor.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500 font-semibold">Carga Alocada:</span>
              <strong className="text-indigo-700 font-black">
                {matrixAudit.totalPlaced}/{matrixAudit.totalPlanned}
              </strong>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-semibold">Conflitos:</span>
              <strong
                className={
                  conflictAudit.conflicts.length > 0
                    ? 'text-rose-600 font-black'
                    : 'text-emerald-600 font-black'
                }
              >
                {conflictAudit.conflicts.length}
              </strong>
            </div>

            {canSelfEditMultiplica && (
              <button
                type="button"
                onClick={() => setShowMyMultiplicaModal(true)}
                className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                title="Definir ou alterar o dia e horário do seu Multiplica"
              >
                <Clock className="w-4 h-4" />
                <span>Meu Horário Multiplica</span>
              </button>
            )}

            {canEdit && (
              <>
                <button
                  type="button"
                  disabled={undoStack.length === 0 || isSaving}
                  onClick={handleUndo}
                  title={
                    undoStack.length > 0
                      ? `Voltar alteração: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
                      : 'Nenhuma alteração recente para desfazer'
                  }
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Undo2 className="w-4 h-4" />
                  <span>
                    Voltar{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
                  </span>
                </button>
                {redoStack.length > 0 && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleRedo}
                    title={`Refazer: ${redoStack[redoStack.length - 1].label} (Ctrl+Y)`}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Redo2 className="w-4 h-4" />
                    <span>Refazer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Importar Horário (PDF / Excel)</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    persistWorkspace(
                      workspace,
                      'Grade Curricular salva na nuvem e sincronizada com Equipamentos (Trava de Plataformas) e Diário do Professor!',
                      undefined,
                      { skipHistory: true }
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Salvando...' : 'Salvar & Sincronizar'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navegação Principal do Módulo */}
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('grade')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'grade'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
            <span>Grade Completa & Distribuição</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('por_professor')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'por_professor'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Grade por Professor ({teacherTimetableSummary.teachers.length})</span>
            {teacherTimetableSummary.unassignedCellCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'por_professor'
                    ? 'bg-amber-300 text-slate-950'
                    : 'bg-amber-100 text-amber-900'
                }`}
                title="Aulas sem nome do professor atribuído"
              >
                {teacherTimetableSummary.unassignedCellCount} s/ prof
              </span>
            )}
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('matriz')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                  activeTab === 'matriz'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Matriz Curricular</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('equipe')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                  activeTab === 'equipe'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Equipe</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('criterios')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'criterios'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Critérios Anuais ({criteria.year})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auditoria')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'auditoria'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Conferências, Estudos & Dominó</span>
            {(conflictAudit.conflicts.length > 0 || matrixAudit.totalPending > 0) && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-black">
                {conflictAudit.conflicts.length > 0
                  ? `${conflictAudit.conflicts.length} conf.`
                  : `${matrixAudit.totalPending} pend.`}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paineis')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'paineis'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Painéis (Turmas, Profs & AOE)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('substituicoes')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'substituicoes'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Substituições PEI</span>
            {(workspace.substitutions || []).filter(s => s.status === 'confirmada').length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'substituicoes'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {(workspace.substitutions || []).filter(s => s.status === 'confirmada').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calendario')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'calendario'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Calendário Letivo</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ABA 1: GRADE COMPLETA (DISTRIBUIÇÃO AUTOMÁTICA + AJUSTE MANUAL)       */}
      {/* ===================================================================== */}
      {activeTab === 'grade' && (
        <div className="space-y-4">
          {/* Barra de Comandos do Motor Gerador + Ferramentas Manuais */}
          {canEdit && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 mr-1">
                  Distribuição Automática:
                </span>

                <button
                  type="button"
                  onClick={handleRunNoteDistribution}
                  className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title={`Distribuir aulas que usam Notebooks respeitando o limite de ${criteria.maxCartsSimultaneous} carrinhos simultâneos`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>1. Aulas com Notebooks ({criteria.maxCartsSimultaneous} carrinhos)</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunEmaDistribution}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Distribuir grupos de simultaneidade (exclusivas e aulas conjuntas)"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>2. Grupos de Simultaneidade</span>
                </button>

                <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-xl p-1">
                  <select
                    value={selectedRestDiscipline}
                    onChange={e => setSelectedRestDiscipline(e.target.value)}
                    className="text-xs font-bold bg-white border border-indigo-200 rounded-lg px-2 py-1 text-slate-800 cursor-pointer"
                  >
                    <option value="__TODAS__">Demais Disciplinas: Todas Pendentes</option>
                    {restDisciplinesList.map(d => (
                      <option key={d} value={d}>
                        Apenas: {d}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleRunRestDistribution}
                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>3. Demais Disciplinas</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                {/* Ferramentas Flexíveis de Ajuste Manual & Visualização */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSwapMode(prev => !prev);
                      setSwapSourceCell(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                      swapMode
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>
                      {swapMode ? 'Modo Trocar Ativo (Clique Origem → Destino)' : 'Trocar 2 Células'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHighlightEmpty(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                      highlightEmpty
                        ? 'bg-rose-600 text-white border-rose-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{highlightEmpty ? 'Ocultar Destaque Vagos' : 'Destacar Vagos'}</span>
                  </button>

                  <select
                    value={String(selectedDayFilter)}
                    onChange={e =>
                      setSelectedDayFilter(
                        e.target.value === 'todos' ? 'todos' : Number(e.target.value)
                      )
                    }
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    <option value="todos">Semana Completa (Seg–Sex)</option>
                    {WEEKDAYS.map(w => (
                      <option key={w.id} value={String(w.id)}>
                        Somente {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Limpeza Seletiva */}
                <div className="flex flex-wrap items-center gap-2">
                  {allPlacedDisciplinesList.length > 0 && (
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                      <select
                        value={disciplineToClear}
                        onChange={e => setDisciplineToClear(e.target.value)}
                        className="text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700"
                      >
                        <option value="">Limpar disciplina...</option>
                        {allPlacedDisciplinesList.map(d => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!disciplineToClear}
                        onClick={handleClearSingleDiscipline}
                        className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Limpar
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setConfirmClearModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    title="Limpa aulas atribuíveis preservando TUTORIA, ELETIVA, CLUBE, EDU PROFISSIONAL e células travadas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Grade (Preservar Fixas)</span>
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3 pt-1">
                <span>
                  <strong>Dica de Ajuste Manual:</strong> Clique em qualquer célula para atribuir/alterar professor e disciplina, marcar aula fixa PEI, travar célula (🔒) ou ativar trava de Plataforma Digital.
                </span>
              </div>
            </div>
          )}

          {/* Alerta se houver aulas sem nome do professor na grade */}
          {teacherTimetableSummary.unassignedCellCount > 0 && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{teacherTimetableSummary.unassignedCellCount} aula(s)</strong> estão somente com a disciplina (sem nome do professor, ex.: Projeto de Vida, Arte). Vincule o professor para que o nome sempre apareça na grade e nas substituições.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('por_professor')}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black cursor-pointer"
              >
                Vincular Professores na Grade por Professor
              </button>
            </div>
          )}

          {/* Matriz Interativa GRADE_COMPLETA */}
          {classes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
              Cadastre ao menos uma turma na Gestão de Turmas para montar a Grade Curricular.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 z-20 bg-slate-900 text-white">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-black w-20 sticky left-0 bg-slate-900 z-30">
                        Dia
                      </th>
                      <th className="py-2.5 px-3 text-left font-black w-28 border-l border-slate-700">
                        Horário / Aula
                      </th>
                      {classes.map(cls => (
                        <th
                          key={cls.id}
                          className="py-2.5 px-2 text-center font-black border-l border-slate-700 min-w-[128px]"
                        >
                          {cls.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {visibleWeekdays.map(wd => (
                      <React.Fragment key={wd.id}>
                        {workspace.periods.map((p, pIdx) => (
                          <tr
                            key={`${wd.id}-${p.id}`}
                            className={
                              p.isBreak
                                ? 'bg-slate-100/90'
                                : pIdx === 0
                                ? 'border-t-2 border-slate-400'
                                : ''
                            }
                          >
                            {pIdx === 0 && (
                              <td
                                rowSpan={workspace.periods.length}
                                className="py-2 px-2.5 font-black text-slate-800 bg-slate-50 border-r border-slate-300 align-middle text-center sticky left-0 z-10"
                              >
                                <span className="text-xs tracking-wider">{wd.short}</span>
                              </td>
                            )}

                            <td className="py-1.5 px-2.5 font-bold text-slate-700 whitespace-nowrap bg-slate-50/70 border-r border-slate-200">
                              <div className="text-[11px]">{p.label}</div>
                              <div className="text-[9px] text-slate-400 font-mono">
                                {p.start} - {p.end}
                              </div>
                            </td>

                            {p.isBreak ? (
                              <td
                                colSpan={classes.length}
                                className="py-1.5 px-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500"
                              >
                                {p.label} ({p.start} – {p.end})
                              </td>
                            ) : (
                              classes.map(cls => {
                                const key = getCellKey(wd.id, p.id, cls.id);
                                const cell = cellMap.get(key);
                                const hasConflict = conflictAudit.conflictCellIds.has(key);
                                const isSwapSelected =
                                  swapSourceCell &&
                                  swapSourceCell.dayOfWeek === wd.id &&
                                  swapSourceCell.period.id === p.id &&
                                  swapSourceCell.cls.id === cls.id;
                                const colors = getCellColorHex(cell, workspace.teachers, criteria);
                                const isEmpty = !cell;

                                return (
                                  <td
                                    key={cls.id}
                                    onClick={() => handleCellClick(wd.id, p, cls)}
                                    className={`p-1.5 border-l border-slate-200 text-center align-middle transition-all relative ${
                                      canEdit ? 'cursor-pointer hover:brightness-95' : ''
                                    } ${
                                      isSwapSelected
                                        ? 'ring-2 ring-amber-500 ring-inset bg-amber-100!'
                                        : hasConflict
                                        ? 'ring-2 ring-rose-600 ring-inset'
                                        : isEmpty && highlightEmpty
                                        ? 'bg-rose-500! text-white!'
                                        : ''
                                    }`}
                                    style={
                                      !isEmpty && !isSwapSelected
                                        ? { backgroundColor: colors.bg, color: colors.text }
                                        : undefined
                                    }
                                    title={
                                      cell
                                        ? `${cls.name} • ${wd.label} ${p.label}: ${
                                            cell.fixedLabel || `${cell.teacherName} (${cell.discipline})`
                                          }${hasConflict ? ' [CONFLITO DETECTADO]' : ''}`
                                        : `Horário vago em ${cls.name} (${wd.short} ${p.label}) — Clique para editar`
                                    }
                                  >
                                    {cell ? (
                                      <div className="leading-tight space-y-0.5">
                                        <div className="font-black text-[11px] truncate max-w-[124px] mx-auto flex items-center justify-center gap-1">
                                          {cell.locked && (
                                            <Lock className="w-2.5 h-2.5 shrink-0 opacity-80" />
                                          )}
                                          {cell.fixedLabel ? (
                                            <span className="truncate">{cell.fixedLabel}</span>
                                          ) : cell.teacherName?.trim() ? (
                                            <span className="truncate">{cell.teacherName}</span>
                                          ) : (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-950 text-[9px] font-black uppercase">
                                              Sem professor
                                            </span>
                                          )}
                                        </div>
                                        {!cell.fixedLabel && cell.discipline && (
                                          <div className="text-[10px] font-semibold opacity-90 truncate max-w-[124px] mx-auto">
                                            ({cell.discipline})
                                          </div>
                                        )}
                                        <div className="flex items-center justify-center gap-1 flex-wrap">
                                          {cell.hasPlatform && (
                                            <span className="inline-block px-1 py-0.2 rounded bg-black/20 text-[8px] font-black uppercase">
                                              Plataforma
                                            </span>
                                          )}
                                          {hasConflict && (
                                            <span className="inline-block px-1 py-0.2 rounded bg-rose-700 text-white text-[8px] font-black uppercase">
                                              Conflito
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <span
                                        className={`text-[10px] font-bold ${
                                          highlightEmpty ? 'text-white' : 'text-slate-300'
                                        }`}
                                      >
                                        {highlightEmpty ? 'VAGO' : '—'}
                                      </span>
                                    )}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legenda de Cores */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-700">
                <span className="uppercase text-slate-500">Legenda:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: criteria.areaColors?.NOTE || '#45818e' }} />
                  Notebooks / Carrinhos
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: criteria.areaColors?.EMA || '#6aa84f' }} />
                  Simultaneidade
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded border border-slate-300" style={{ backgroundColor: criteria.areaColors?.LGG || '#fff2cc' }} />
                  LGG
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded border border-slate-300" style={{ backgroundColor: criteria.areaColors?.MAT || '#f4cccc' }} />
                  MAT
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded border border-slate-300" style={{ backgroundColor: criteria.areaColors?.CHS || '#fce5cd' }} />
                  CHS
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded border border-slate-300" style={{ backgroundColor: criteria.areaColors?.CNT || '#d1eaf0' }} />
                  CNT
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: criteria.areaColors?.PROJETO_DE_VIDA || '#674ea7' }} />
                  Projeto de Vida
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded border border-slate-300 bg-slate-200" />
                  Horário Fixo
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 1B: GRADE CURRICULAR SEPARADA POR PROFESSOR (FONTE SUBSTITUIÇÕES) */}
      {/* ===================================================================== */}
      {activeTab === 'por_professor' && (
        <TimetableByTeacherTab
          workspace={workspace}
          criteria={criteria}
          classes={classes}
          canEdit={canEdit}
          onUpdateWorkspace={(nextWs, msg, undoLabel) =>
            persistWorkspace(nextWs, msg, undoLabel)
          }
          onOpenSubstitutions={subTab => {
            setSubstitutionsInitialSubView(subTab || 'escalar');
            setActiveTab('substituicoes');
          }}
        />
      )}

      {/* ===================================================================== */}
      {/* ABA 2: MATRIZ CURRICULAR (POR ANO/SÉRIE — AUTOMÁTICO P/ TURMAS)       */}
      {/* ===================================================================== */}
      {activeTab === 'matriz' && canEdit && (
        <TimetableCurriculumMatrixTab
          workspace={workspace}
          criteria={criteria}
          classes={classes}
          canEditMatrix={isAdmin}
          onUpdateWorkspace={(nextWs, msg, undoLabel) =>
            persistWorkspace(nextWs, msg, undoLabel)
          }
          onOpenTeamTab={() => setActiveTab('equipe')}
        />
      )}

      {/* ===================================================================== */}
      {/* ABA 2B: EQUIPE (PROFESSOR E PAAC + DISCIPLINAS + HORÁRIOS MULTIPLICA) */}
      {/* ===================================================================== */}
      {activeTab === 'equipe' && canEdit && (
        <TimetableTeamTab
          workspace={workspace}
          classes={classes}
          canEdit={canEdit}
          onUpdateWorkspace={(nextWs, msg, undoLabel) =>
            persistWorkspace(nextWs, msg, undoLabel)
          }
          onOpenMatrixTab={() => setActiveTab('matriz')}
        />
      )}

      {/* ===================================================================== */}
      {/* ABA 3: CRITÉRIOS ANUAIS (LEGISLAÇÃO CADASTRÁVEL POR ANO)              */}
      {/* ===================================================================== */}
      {activeTab === 'criterios' && (
        <TimetableCriteriaTab
          workspace={workspace}
          criteria={criteria}
          classes={classes}
          canEdit={canEdit}
          onChangeYear={handleChangeCriteriaYear}
          onCreateYear={handleCreateCriteriaYear}
          onSaveCriteria={handleSaveAnnualCriteria}
          onOpenMatrixTab={canEdit ? () => setActiveTab('matriz') : undefined}
        />
      )}

      {/* ===================================================================== */}
      {/* ABA 4: CONFERÊNCIAS, CONFLITOS, BANCO DE ESTUDOS & DOMINÓ             */}
      {/* ===================================================================== */}
      {activeTab === 'auditoria' && (
        <TimetableAuditAndPanels
          mode="audit"
          workspace={workspace}
          criteria={criteria}
          classes={classes}
          canEdit={canEdit}
          onApplyManeuver={handleApplyIntelligenceManeuver}
        />
      )}

      {/* ===================================================================== */}
      {/* ABA 5: PAINÉIS CONSOLIDADOS (TURMAS, PROFESSORES & CORREDOR AOE)      */}
      {/* ===================================================================== */}
      {activeTab === 'paineis' && (
        <TimetableAuditAndPanels
          mode="panels"
          workspace={workspace}
          criteria={criteria}
          classes={classes}
          canEdit={canEdit}
          onApplyManeuver={handleApplyIntelligenceManeuver}
        />
      )}

      {/* ===================================================================== */}
      {/* ABA 6: CONTROLE DE SUBSTITUIÇÕES PEI                                  */}
      {/* ===================================================================== */}
      {activeTab === 'substituicoes' && (
        <TimetableSubstitutionsTab
          workspace={workspace}
          classes={classes}
          currentUser={currentUser}
          canEdit={canEdit}
          initialSubView={substitutionsInitialSubView}
          onUpdateWorkspace={(nextWs, msg, undoLabel) =>
            persistWorkspace(nextWs, msg, undoLabel)
          }
          onOpenTeacherGrid={() => setActiveTab('por_professor')}
        />
      )}

      {/* ===================================================================== */}
      {/* ABA 7: CALENDÁRIO LETIVO (MÓDULO SEPARADO)                            */}
      {/* ===================================================================== */}
      {activeTab === 'calendario' && (
        <SchoolCalendarPanel
          currentUser={currentUser}
          canEdit={canEdit}
          onSaved={onRefresh}
        />
      )}

      {/* MODAL DE AJUSTE MANUAL DE CÉLULA */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Ajuste Manual de Horário
                </h3>
                <p className="text-[11px] text-slate-500">
                  {editingSlot.cls.name} •{' '}
                  {WEEKDAYS.find(w => w.id === editingSlot.dayOfWeek)?.label} —{' '}
                  {editingSlot.period.label} ({editingSlot.period.start}–{editingSlot.period.end})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSlot(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alternar entre Aula Docente ou Horário Fixo PEI */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setEditingSlot({ ...editingSlot, mode: 'aula' })}
                className={`py-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                  editingSlot.mode === 'aula'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600'
                }`}
              >
                Aula / Professor
              </button>
              <button
                type="button"
                onClick={() => setEditingSlot({ ...editingSlot, mode: 'fixa' })}
                className={`py-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                  editingSlot.mode === 'fixa'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600'
                }`}
              >
                Horário Fixo PEI
              </button>
            </div>

            {editingSlotWarnings.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-[11px] space-y-1">
                {editingSlotWarnings.map((w, idx) => (
                  <p key={idx} className="font-semibold flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}

            <form onSubmit={handleSaveManualCell} className="space-y-3">
              {editingSlot.mode === 'fixa' ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Rótulo Fixo Preservado (PEI)
                  </label>
                  <select
                    value={editingSlot.fixedLabel}
                    onChange={e =>
                      setEditingSlot({ ...editingSlot, fixedLabel: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50"
                  >
                    {(criteria.preservedFixedTerms || []).map(term => (
                      <option key={term} value={term}>
                        {term}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Professor(a)
                    </label>
                    <input
                      type="text"
                      list="manual-teachers-list"
                      value={editingSlot.teacherName}
                      onChange={e =>
                        setEditingSlot({ ...editingSlot, teacherName: e.target.value })
                      }
                      placeholder="Nome do professor"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <datalist id="manual-teachers-list">
                      {workspace.teachers.map(t => (
                        <option key={t.id} value={t.name} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Disciplina
                    </label>
                    <input
                      type="text"
                      list="manual-disciplines-list"
                      value={editingSlot.discipline}
                      onChange={e =>
                        setEditingSlot({ ...editingSlot, discipline: e.target.value })
                      }
                      placeholder="Selecione da matriz ou digite a disciplina..."
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <datalist id="manual-disciplines-list">
                      {catalogDisciplines.map(d => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingSlot.locked}
                        onChange={e =>
                          setEditingSlot({ ...editingSlot, locked: e.target.checked })
                        }
                      />
                      <span>Travar célula (proteger contra limpeza e redistribuição automática)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-sky-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingSlot.hasPlatform}
                        onChange={e =>
                          setEditingSlot({ ...editingSlot, hasPlatform: e.target.checked })
                        }
                      />
                      <span>Aula com Plataforma Digital (ativa trava no Agendamento de Equipamentos)</span>
                    </label>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClearManualCell}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                >
                  Limpar Célula
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSlot(null)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-xs"
                  >
                    Salvar Horário
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE LIMPEZA SELETIVA */}
      {confirmClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900 text-center">
              Limpar Grade Atribuível?
            </h3>
            <p className="text-xs text-slate-600 text-center leading-relaxed">
              Esta ação limpará apenas as aulas distribuídas na grade, <strong>preservando integralmente</strong> todas as células fixas PEI ({criteria.preservedFixedTerms.join(', ')}) e células travadas manualmente.
            </p>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAttributable}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Sim, Limpar Atribuíveis
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE IMPORTAÇÃO DE HORÁRIO (PDF / EXCEL) */}
      {showImportModal && canEdit && (
        <TimetableImportModal
          workspace={workspace}
          criteria={criteria}
          classes={classes}
          onClose={() => setShowImportModal(false)}
          onConfirmImport={(nextWs, msg) => {
            persistWorkspace(nextWs, msg);
            setActiveTab('grade');
          }}
        />
      )}

      {/* MODAL DE AUTO-EDIÇÃO DE HORÁRIOS MULTIPLICA (PERFIL PROFESSOR / PAAC) */}
      {showMyMultiplicaModal && canSelfEditMultiplica && (
        <ProfessorMultiplicaModal
          currentUser={currentUser}
          onClose={() => setShowMyMultiplicaModal(false)}
          onSaved={summary => {
            const refreshed = storageService.getTimetableWorkspace();
            setWorkspace(refreshed);
            showToast(`Horário Multiplica atualizado: ${summary}`, 'success');
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
