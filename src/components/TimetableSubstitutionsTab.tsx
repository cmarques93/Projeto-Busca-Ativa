import React, { useEffect, useMemo, useState } from 'react';
import {
  UserCheck,
  UserX,
  Calendar,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Printer,
  Clock,
  Info,
  Filter,
  RefreshCw,
  Eye,
  Tags,
  Save,
  Users,
  Search,
  Wand2
} from 'lucide-react';
import {
  SchoolClass,
  TeacherSubstitutionRecord,
  TimetableTeacherProfile,
  TimetableWorkspace,
  UserSession
} from '../types';
import {
  DEFAULT_AREA_OPTIONS,
  WEEKDAYS,
  SubstitutionLessonPlan,
  buildTeacherTimetableView,
  computeTeacherSubstitutionFairness,
  getActiveCriteria,
  getAllHouseTeachers,
  getIsoWeekRange,
  getTeacherAreas,
  getWeekdayFromDateStr,
  inferAreasFromTeacherDisciplines,
  normalizeTeacherKey,
  planSubstitutionsForAbsentTeacher
} from '../utils/timetableEngine';

interface TimetableSubstitutionsTabProps {
  workspace: TimetableWorkspace;
  classes: SchoolClass[];
  currentUser: UserSession;
  canEdit: boolean;
  initialSubView?: 'escalar' | 'escala' | 'equidade' | 'areas';
  onUpdateWorkspace: (nextWorkspace: TimetableWorkspace, message: string, undoLabel: string) => void;
  onOpenTeacherGrid?: () => void;
}

const ABSENCE_REASONS = [
  'Atestado Médico',
  'Falta Abonada',
  'Falta Justificada',
  'Convocação DE / SEDUC',
  'Licença / Afastamento',
  'Falta Injustificada',
  'Outro',
];

function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatBrDate(ymd: string): string {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export const TimetableSubstitutionsTab: React.FC<TimetableSubstitutionsTabProps> = ({
  workspace,
  classes,
  currentUser,
  canEdit,
  initialSubView,
  onUpdateWorkspace,
  onOpenTeacherGrid,
}) => {
  const [subView, setSubView] = useState<'escalar' | 'escala' | 'equidade' | 'areas'>(
    initialSubView || (canEdit ? 'escalar' : 'escala')
  );
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayYmd());
  const [absentTeacher, setAbsentTeacher] = useState<string>('');
  const [reason, setReason] = useState<string>('Atestado Médico');
  const [notes, setNotes] = useState<string>('');

  // Filtro automático de afinidade pedagógica
  const [onlySameAreaFilter, setOnlySameAreaFilter] = useState<boolean>(false);
  const [allowOtherAreasForSlot, setAllowOtherAreasForSlot] = useState<Record<string, boolean>>({});

  // Limites configuráveis para alerta de sobrecarga de substituições
  const [maxWeekBeforeOverload, setMaxWeekBeforeOverload] = useState<number>(2);
  const [maxMonthBeforeOverload, setMaxMonthBeforeOverload] = useState<number>(4);

  // Escolhas manuais ou automáticas por periodId__classId
  const [selectedSubstitutes, setSelectedSubstitutes] = useState<Record<string, string>>({});
  const [selectedPeriods, setSelectedPeriods] = useState<Record<string, boolean>>({});
  const [reajusteNote, setReajusteNote] = useState<string | null>(null);
  const [showDayMap, setShowDayMap] = useState<boolean>(false);

  // Estado da configuração de Áreas de Atuação dos Professores
  const [areaDraftByTeacherKey, setAreaDraftByTeacherKey] = useState<Record<string, string[]>>({});
  const [areaEditorSearch, setAreaEditorSearch] = useState<string>('');
  const [areaEditorFilter, setAreaEditorFilter] = useState<string>('todas');
  const [areasDirty, setAreasDirty] = useState<boolean>(false);

  // Filtros de histórico e equidade
  const [historyScope, setHistoryScope] = useState<'dia' | 'semana' | 'mes' | 'todos'>('dia');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [fairnessAreaFilter, setFairnessAreaFilter] = useState<string>('todas');

  useEffect(() => {
    if (initialSubView) {
      setSubView(initialSubView);
    }
  }, [initialSubView]);

  const dayOfWeek = useMemo(() => getWeekdayFromDateStr(selectedDate), [selectedDate]);
  const weekdayObj = useMemo(
    () => WEEKDAYS.find(w => w.id === dayOfWeek) || null,
    [dayOfWeek]
  );
  const weekRange = useMemo(() => getIsoWeekRange(selectedDate), [selectedDate]);
  const monthPrefix = selectedDate.slice(0, 7);

  // FONTE OFICIAL: Grade Curricular separada por Professor
  const teacherGrid = useMemo(
    () => buildTeacherTimetableView(workspace, classes),
    [workspace, classes]
  );

  // Inicializa / sincroniza o rascunho de edição das Áreas de Atuação com os docentes da Grade por Professor
  useEffect(() => {
    const draft: Record<string, string[]> = {};
    for (const t of teacherGrid.teachers) {
      draft[t.teacherKey] = [...t.areas];
    }
    setAreaDraftByTeacherKey(draft);
    setAreasDirty(false);
  }, [teacherGrid.teachers]);

  // Professores que têm aulas no dia selecionado (lidos diretamente da Grade por Professor)
  const teachersWithLessonsOnDay = useMemo(() => {
    if (dayOfWeek < 1 || dayOfWeek > 5) return [];
    return teacherGrid.teachers
      .filter(t => (t.dailyLessonsCount[dayOfWeek] || 0) > 0)
      .map(t => ({
        name: t.teacherName,
        key: t.teacherKey,
        count: t.dailyLessonsCount[dayOfWeek] || 0,
        areas: t.areas,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [teacherGrid.teachers, dayOfWeek]);

  // Planejamento automático PEI consultando diretamente a Grade por Professor
  const lessonPlans = useMemo(() => {
    if (!absentTeacher || dayOfWeek < 1 || dayOfWeek > 5) return [];
    return planSubstitutionsForAbsentTeacher(workspace, classes, selectedDate, absentTeacher);
  }, [workspace, classes, selectedDate, absentTeacher, dayOfWeek]);

  // Preenche automaticamente com a recomendação PEI (respeitando filtro de afinidade quando ativo)
  useEffect(() => {
    const nextSubs: Record<string, string> = {};
    const nextChecks: Record<string, boolean> = {};
    for (const plan of lessonPlans) {
      const slotKey = `${plan.periodId}__${plan.classId}`;
      const sameAreaCands = plan.candidates.filter(c => c.sameArea);
      let defaultName = plan.existingSubstitution?.substituteTeacherName || '';
      if (!defaultName) {
        if (onlySameAreaFilter) {
          defaultName = sameAreaCands[0]?.teacherName || '';
        } else {
          defaultName = plan.recommendedSubstitute?.teacherName || '';
        }
      }
      nextSubs[slotKey] = defaultName;
      nextChecks[slotKey] = true;
    }
    setSelectedSubstitutes(nextSubs);
    setSelectedPeriods(nextChecks);
    setAllowOtherAreasForSlot({});
    setReajusteNote(null);
  }, [lessonPlans, onlySameAreaFilter]);

  const fairnessRows = useMemo(
    () => computeTeacherSubstitutionFairness(workspace, selectedDate),
    [workspace, selectedDate]
  );

  const fairnessByKey = useMemo(() => {
    return new Map(fairnessRows.map(r => [r.teacherKey, r]));
  }, [fairnessRows]);

  // Mapa completo do dia extraído DIRETAMENTE da Grade por Professor
  const dayAvailabilityMap = useMemo(() => {
    if (dayOfWeek < 1 || dayOfWeek > 5) return [];
    const teachingPeriods = (workspace.periods || []).filter(p => !p.isBreak && p.number > 0);
    const absentKey = normalizeTeacherKey(absentTeacher);

    return teachingPeriods.map(p => {
      const inRoomList: Array<{ name: string; className: string; discipline: string }> = [];
      const freeList: Array<{ name: string; areas: string[]; weekCount: number; monthCount: number }> = [];
      const blockedList: Array<{ name: string; reason: string }> = [];

      for (const t of teacherGrid.teachers) {
        const slot = t.slotsByDay[dayOfWeek]?.[p.id];
        if (!slot) continue;

        if (slot.status === 'em_aula') {
          inRoomList.push({
            name: t.teacherName,
            className: slot.lessons.map(l => l.className).join(' / '),
            discipline: slot.lessons[0]?.discipline || '',
          });
          continue;
        }

        if (t.teacherKey === absentKey) continue;

        if (slot.status === 'bloqueado') {
          blockedList.push({
            name: t.teacherName,
            reason: slot.blockReason || 'ATPCA / Multiplica',
          });
          continue;
        }

        const f = fairnessByKey.get(t.teacherKey);
        freeList.push({
          name: t.teacherName,
          areas: t.areas,
          weekCount: f?.weekCount || 0,
          monthCount: f?.monthCount || 0,
        });
      }

      freeList.sort((a, b) => {
        if (a.weekCount !== b.weekCount) return a.weekCount - b.weekCount;
        if (a.monthCount !== b.monthCount) return a.monthCount - b.monthCount;
        return a.name.localeCompare(b.name, 'pt-BR');
      });

      return {
        period: p,
        inRoomList: inRoomList.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        freeList,
        blockedList,
      };
    });
  }, [workspace.periods, teacherGrid.teachers, dayOfWeek, absentTeacher, fairnessByKey]);

  // Calcula quantas novas aulas (ainda não salvas) cada docente está recebendo na tabela atual
  const plannedAdditionsByKey = useMemo(() => {
    const adds = new Map<string, number>();
    for (const plan of lessonPlans) {
      const slotKey = `${plan.periodId}__${plan.classId}`;
      if (selectedPeriods[slotKey] === false) continue;
      const chosen = (selectedSubstitutes[slotKey] || '').trim();
      if (!chosen) continue;
      const key = normalizeTeacherKey(chosen);
      if (
        plan.existingSubstitution &&
        normalizeTeacherKey(plan.existingSubstitution.substituteTeacherName) === key
      ) {
        continue;
      }
      adds.set(key, (adds.get(key) || 0) + 1);
    }
    return adds;
  }, [lessonPlans, selectedPeriods, selectedSubstitutes]);

  const getProjectedLoad = (teacherKey: string) => {
    const f = fairnessByKey.get(teacherKey);
    const added = plannedAdditionsByKey.get(teacherKey) || 0;
    const baseWeek = f?.weekCount || 0;
    const baseMonth = f?.monthCount || 0;
    const baseDay = f?.dayCount || 0;
    return {
      baseWeek,
      baseMonth,
      baseDay,
      added,
      projectedWeek: baseWeek + added,
      projectedMonth: baseMonth + added,
      projectedDay: baseDay + added,
    };
  };

  // Lista de candidatos visíveis para uma aula conforme o filtro de afinidade pedagógica
  const getVisibleCandidatesForPlan = (plan: SubstitutionLessonPlan) => {
    const slotKey = `${plan.periodId}__${plan.classId}`;
    if (!onlySameAreaFilter || allowOtherAreasForSlot[slotKey]) {
      return plan.candidates;
    }
    return plan.candidates.filter(c => c.sameArea);
  };

  const evaluateSlotOverload = (plan: SubstitutionLessonPlan, chosenName: string) => {
    if (!chosenName) return { isOverloaded: false, reason: '' };
    const key = normalizeTeacherKey(chosenName);
    const load = getProjectedLoad(key);

    const reasons: string[] = [];
    if (load.projectedWeek > maxWeekBeforeOverload) {
      reasons.push(`${load.projectedWeek} na semana (limite ${maxWeekBeforeOverload})`);
    }
    if (load.projectedMonth > maxMonthBeforeOverload) {
      reasons.push(`${load.projectedMonth} no mês (limite ${maxMonthBeforeOverload})`);
    }
    if (load.projectedDay >= 2) {
      reasons.push(`${load.projectedDay} no mesmo dia`);
    }

    const visibleCandidates = getVisibleCandidatesForPlan(plan);
    const otherCandidates = visibleCandidates.filter(c => c.teacherKey !== key);
    if (reasons.length === 0 && otherCandidates.length > 0) {
      const minOtherWeek = Math.min(
        ...otherCandidates.map(c => getProjectedLoad(c.teacherKey).projectedWeek)
      );
      if (load.projectedWeek >= minOtherWeek + 2) {
        reasons.push(`Desequilíbrio semanal (${load.projectedWeek} vs colega livre com ${minOtherWeek})`);
      }
    }

    return {
      isOverloaded: reasons.length > 0,
      reason: reasons.join(' • '),
    };
  };

  // BOTÃO DE REAJUSTE INDIVIDUAL: troca SOMENTE a aula cujo professor ficou sobrecarregado
  const handleReadjustSingleOverloadedSlot = (plan: SubstitutionLessonPlan) => {
    const slotKey = `${plan.periodId}__${plan.classId}`;
    const currentName = (selectedSubstitutes[slotKey] || '').trim();
    const currentKey = normalizeTeacherKey(currentName);

    const pool = getVisibleCandidatesForPlan(plan);
    const alternatives = (pool.length > 1 ? pool : plan.candidates).filter(
      c => c.teacherKey !== currentKey
    );
    if (alternatives.length === 0) {
      setReajusteNote(
        `Não há outro professor da casa fora de aula na ${plan.periodLabel} para substituir ${currentName}.`
      );
      return;
    }

    const scored = alternatives.map(cand => {
      const load = getProjectedLoad(cand.teacherKey);
      const nextWeek = load.projectedWeek + 1;
      const nextMonth = load.projectedMonth + 1;
      const nextDay = load.projectedDay + 1;
      const wouldOverload =
        nextWeek > maxWeekBeforeOverload ||
        nextMonth > maxMonthBeforeOverload ||
        nextDay >= 2;
      return {
        cand,
        nextWeek,
        nextMonth,
        nextDay,
        wouldOverload,
      };
    });

    scored.sort((a, b) => {
      if (a.wouldOverload !== b.wouldOverload) return a.wouldOverload ? 1 : -1;
      if (a.nextWeek !== b.nextWeek) return a.nextWeek - b.nextWeek;
      if (a.nextMonth !== b.nextMonth) return a.nextMonth - b.nextMonth;
      if (a.cand.sameArea !== b.cand.sameArea) return a.cand.sameArea ? -1 : 1;
      if (a.nextDay !== b.nextDay) return a.nextDay - b.nextDay;
      if (a.cand.dailyRegularLessons !== b.cand.dailyRegularLessons) {
        return a.cand.dailyRegularLessons - b.cand.dailyRegularLessons;
      }
      return a.cand.teacherName.localeCompare(b.cand.teacherName, 'pt-BR');
    });

    const chosen = scored[0];
    if (!chosen.cand.sameArea && onlySameAreaFilter) {
      setAllowOtherAreasForSlot(prev => ({ ...prev, [slotKey]: true }));
    }
    setSelectedSubstitutes(prev => ({
      ...prev,
      [slotKey]: chosen.cand.teacherName,
    }));

    setReajusteNote(
      `Reajuste aplicado somente na ${plan.periodLabel} (${plan.className}): trocado ${currentName} por ${chosen.cand.teacherName} [${chosen.cand.areas.join(', ')}] (ficará com ${chosen.nextWeek} na semana e ${chosen.nextMonth} no mês).`
    );
  };

  // =========================================================================
  // CONFIGURAÇÃO DE ÁREAS DE ATUAÇÃO DOS PROFESSORES (AFINIDADE PEDAGÓGICA)
  // =========================================================================
  const handleToggleTeacherArea = (teacherKey: string, areaCode: string) => {
    if (!canEdit) return;
    setAreaDraftByTeacherKey(prev => {
      const current = prev[teacherKey] || [];
      let next: string[];
      if (current.includes(areaCode)) {
        next = current.filter(a => a !== areaCode);
        if (next.length === 0) next = ['OUTROS'];
      } else {
        // Se estava apenas em 'OUTROS' e o usuário marca uma área real, remove 'OUTROS' automaticamente
        const cleaned = areaCode !== 'OUTROS' ? current.filter(a => a !== 'OUTROS') : current;
        next = [...cleaned, areaCode];
      }
      return { ...prev, [teacherKey]: next };
    });
    setAreasDirty(true);
  };

  const handleAutoDetectAllAreas = () => {
    if (!canEdit) return;
    const nextDraft: Record<string, string[]> = {};
    for (const t of teacherGrid.teachers) {
      const detected = inferAreasFromTeacherDisciplines(t.teacherName, workspace);
      nextDraft[t.teacherKey] = detected.length > 0 ? detected : ['OUTROS'];
    }
    setAreaDraftByTeacherKey(nextDraft);
    setAreasDirty(true);
  };

  const handleSaveTeacherAreas = () => {
    if (!canEdit) return;
    const criteria = getActiveCriteria(workspace);
    const nextProfiles: TimetableTeacherProfile[] = [...(workspace.teachers || [])];
    const indexByKey = new Map<string, number>();
    nextProfiles.forEach((p, idx) => {
      const k = normalizeTeacherKey(p.name);
      if (k) indexByKey.set(k, idx);
    });

    for (const t of teacherGrid.teachers) {
      const rawAreas: string[] = areaDraftByTeacherKey[t.teacherKey] || t.areas || ['OUTROS'];
      const uniqueAreas: string[] = Array.from(new Set<string>(rawAreas.filter((a): a is string => Boolean(a))));
      const primaryArea: string = uniqueAreas[0] || 'OUTROS';

      const existingIdx = indexByKey.get(t.teacherKey);
      if (existingIdx !== undefined) {
        nextProfiles[existingIdx] = {
          ...nextProfiles[existingIdx],
          area: primaryArea,
          areas: uniqueAreas,
        };
      } else {
        nextProfiles.push({
          id: `prof_area_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name: t.teacherName,
          area: primaryArea,
          areas: uniqueAreas,
          multiplicaPeriods: [],
          dailyLimit: criteria.defaultTeacherDailyLimit || 7,
        });
      }
    }

    setAreasDirty(false);
    onUpdateWorkspace(
      {
        ...workspace,
        teachers: nextProfiles,
      },
      `Áreas de atuação salvas para ${teacherGrid.teachers.length} professor(es)! O filtro de afinidade pedagógica nas substituições já foi atualizado.`,
      'Atualização das Áreas de Atuação dos Professores'
    );
  };

  const filteredAreaTeachers = useMemo(() => {
    const q = areaEditorSearch.trim().toLowerCase();
    return teacherGrid.teachers.filter(t => {
      const draftAreas = areaDraftByTeacherKey[t.teacherKey] || t.areas;
      if (areaEditorFilter !== 'todas' && !draftAreas.includes(areaEditorFilter)) return false;
      if (q) {
        const hay = `${t.teacherName} ${t.disciplines.join(' ')} ${draftAreas.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [teacherGrid.teachers, areaDraftByTeacherKey, areaEditorFilter, areaEditorSearch]);

  const filteredFairnessRows = useMemo(() => {
    const rows =
      fairnessAreaFilter === 'todas'
        ? fairnessRows
        : fairnessRows.filter(r => r.areas.includes(fairnessAreaFilter));
    return [...rows].sort((a, b) => {
      if (b.weekCount !== a.weekCount) return b.weekCount - a.weekCount;
      if (b.monthCount !== a.monthCount) return b.monthCount - a.monthCount;
      return a.teacherName.localeCompare(b.teacherName, 'pt-BR');
    });
  }, [fairnessRows, fairnessAreaFilter]);

  const maxWeekCount = useMemo(
    () => Math.max(1, ...fairnessRows.map(r => r.weekCount)),
    [fairnessRows]
  );
  const maxMonthCount = useMemo(
    () => Math.max(1, ...fairnessRows.map(r => r.monthCount)),
    [fairnessRows]
  );

  const confirmedSubstitutions = useMemo(
    () =>
      (workspace.substitutions || [])
        .filter(s => s.status === 'confirmada')
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return a.periodNumber - b.periodNumber;
        }),
    [workspace.substitutions]
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return confirmedSubstitutions.filter(s => {
      if (historyScope === 'dia' && s.date !== selectedDate) return false;
      if (historyScope === 'semana' && (s.date < weekRange.start || s.date > weekRange.end)) return false;
      if (historyScope === 'mes' && !s.date.startsWith(monthPrefix)) return false;
      if (q) {
        const hay = `${s.absentTeacherName} ${s.substituteTeacherName} ${s.className} ${s.discipline} ${s.reason || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [confirmedSubstitutions, historyScope, selectedDate, weekRange, monthPrefix, historySearch]);

  const handleApplyAutoSuggestion = () => {
    const nextSubs: Record<string, string> = {};
    for (const plan of lessonPlans) {
      const slotKey = `${plan.periodId}__${plan.classId}`;
      const visible = getVisibleCandidatesForPlan(plan);
      nextSubs[slotKey] = (onlySameAreaFilter ? visible[0]?.teacherName : plan.recommendedSubstitute?.teacherName) || '';
    }
    setSelectedSubstitutes(nextSubs);
    setReajusteNote(null);
  };

  const handleSaveSubstitutions = () => {
    if (!canEdit || !absentTeacher || lessonPlans.length === 0) return;

    const existingList = [...(workspace.substitutions || [])];
    const houseTeachers = getAllHouseTeachers(workspace);
    const areasByKey = new Map(houseTeachers.map(t => [t.key, t.areas]));

    let savedCount = 0;

    for (const plan of lessonPlans) {
      const slotKey = `${plan.periodId}__${plan.classId}`;
      if (!selectedPeriods[slotKey]) continue;

      const subName = (selectedSubstitutes[slotKey] || '').trim();
      if (!subName) continue;

      const subKey = normalizeTeacherKey(subName);
      const subAreas = areasByKey.get(subKey) || getTeacherAreas(subName, workspace);
      const subAreaLabel = subAreas.join('/');
      const targetSet = new Set(plan.targetAreas.map(a => a.toUpperCase()));
      const sameArea = subAreas.some(a => a !== 'OUTROS' && targetSet.has(a.toUpperCase()));

      const idx = existingList.findIndex(
        s =>
          s.status === 'confirmada' &&
          s.date === selectedDate &&
          s.periodId === plan.periodId &&
          s.classId === plan.classId
      );

      const record: TeacherSubstitutionRecord = {
        id:
          idx >= 0
            ? existingList[idx].id
            : `sub_${selectedDate}_${plan.periodId}_${plan.classId}_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 5)}`,
        date: selectedDate,
        dayOfWeek,
        periodId: plan.periodId,
        periodNumber: plan.periodNumber,
        periodLabel: plan.periodLabel,
        classId: plan.classId,
        className: plan.className,
        discipline: plan.discipline,
        absentTeacherName: absentTeacher,
        absentTeacherArea: plan.targetAreas.join('/'),
        substituteTeacherName: subName,
        substituteTeacherArea: subAreaLabel,
        sameArea,
        reason,
        notes: notes.trim() || undefined,
        status: 'confirmada',
        recordedBy: currentUser.name,
        recordedAt: new Date().toISOString(),
      };

      if (idx >= 0) {
        existingList[idx] = record;
      } else {
        existingList.push(record);
      }
      savedCount += 1;
    }

    if (savedCount === 0) return;

    onUpdateWorkspace(
      {
        ...workspace,
        substitutions: existingList,
      },
      `Escala de substituição salva: ${savedCount} aula(s) de ${absentTeacher} em ${formatBrDate(selectedDate)} distribuídas conforme critérios PEI!`,
      `Substituição de ${absentTeacher} (${formatBrDate(selectedDate)})`
    );
    setReajusteNote(null);
    setSubView('escala');
    setHistoryScope('dia');
  };

  const handleDeleteSubstitution = (sub: TeacherSubstitutionRecord) => {
    if (!canEdit) return;
    const nextList = (workspace.substitutions || []).filter(s => s.id !== sub.id);
    onUpdateWorkspace(
      {
        ...workspace,
        substitutions: nextList,
      },
      `Substituição removida (${sub.periodLabel} • ${sub.className} — ${sub.substituteTeacherName}).`,
      `Remoção de substituição (${sub.className})`
    );
  };

  const todaySubstitutionsCount = confirmedSubstitutions.filter(s => s.date === selectedDate).length;
  const weekSubstitutionsCount = confirmedSubstitutions.filter(
    s => s.date >= weekRange.start && s.date <= weekRange.end
  ).length;
  const monthSubstitutionsCount = confirmedSubstitutions.filter(s =>
    s.date.startsWith(monthPrefix)
  ).length;
  const sameAreaPercent =
    monthSubstitutionsCount > 0
      ? Math.round(
          (confirmedSubstitutions.filter(s => s.date.startsWith(monthPrefix) && s.sameArea).length /
            monthSubstitutionsCount) *
            100
        )
      : 100;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[10px] font-black uppercase text-slate-500">Substituições no Dia</p>
          <p className="text-2xl font-black text-indigo-700 mt-0.5">{todaySubstitutionsCount}</p>
          <p className="text-[11px] text-slate-500">{formatBrDate(selectedDate)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[10px] font-black uppercase text-slate-500">Na Semana (Seg–Dom)</p>
          <p className="text-2xl font-black text-emerald-700 mt-0.5">{weekSubstitutionsCount}</p>
          <p className="text-[11px] text-slate-500">
            {formatBrDate(weekRange.start)} a {formatBrDate(weekRange.end)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[10px] font-black uppercase text-slate-500">No Mês ({monthPrefix})</p>
          <p className="text-2xl font-black text-purple-700 mt-0.5">{monthSubstitutionsCount}</p>
          <p className="text-[11px] text-slate-500">Equilíbrio mensal PEI</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[10px] font-black uppercase text-slate-500">Afinidade Pedagógica</p>
          <p className="text-2xl font-black text-teal-700 mt-0.5">{sameAreaPercent}%</p>
          <p className="text-[11px] text-slate-500">Mesma área no mês</p>
        </div>
      </div>

      {/* Sub-navegação */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap gap-1.5">
          {canEdit && (
            <button
              type="button"
              onClick={() => setSubView('escalar')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                subView === 'escalar'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UserX className="w-4 h-4" />
              <span>Escalar Substitutos</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubView('areas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subView === 'areas'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Tags className="w-4 h-4" />
            <span>Áreas de Atuação ({teacherGrid.teachers.length})</span>
            {areasDirty && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Alterações não salvas" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubView('escala')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subView === 'escala'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Escala & Histórico ({confirmedSubstitutions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('equidade')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subView === 'equidade'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Placar Semana / Mês</span>
          </button>
        </div>

        <div className="flex items-center gap-2 px-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50 text-slate-800"
          />
          {weekdayObj ? (
            <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800 text-[11px] font-black">
              {weekdayObj.label}
            </span>
          ) : (
            <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-black">
              Fim de semana
            </span>
          )}
        </div>
      </div>

      {/* Aviso se houver aulas na grade sem nome de professor (ex: Projeto de Vida, Arte) */}
      {teacherGrid.unassignedCellCount > 0 && onOpenTeacherGrid && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Existem <strong>{teacherGrid.unassignedCellCount} aula(s)</strong> na grade apenas com a disciplina (sem nome do professor). Vincule os professores na aba <strong>Grade por Professor</strong> para que entrem corretamente no controle de substituições.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenTeacherGrid}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Abrir Grade por Professor</span>
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB 1: REGISTRAR AUSÊNCIA & ESCALAR SUBSTITUTOS PEI               */}
      {/* ================================================================= */}
      {subView === 'escalar' && canEdit && (
        <div className="space-y-4">
          {/* Painel de Parâmetros: Fonte Grade por Professor + Filtro Afinidade + Sobrecarga */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3 text-xs text-indigo-950">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black">
                      Base ativa: Aba "Grade por Professor" ({weekdayObj?.label || '—'})
                    </p>
                    {onOpenTeacherGrid && (
                      <button
                        type="button"
                        onClick={onOpenTeacherGrid}
                        className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-800 text-[10px] font-black flex items-center gap-1 cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>Ver Grade por Professor</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSubView('areas')}
                      className="px-2 py-0.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-black flex items-center gap-1 cursor-pointer"
                    >
                      <Tags className="w-3 h-3" />
                      <span>Editar Áreas de Atuação</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-indigo-900 mt-0.5">
                    Consulta a <strong>Grade por Professor</strong> do dia para usar apenas o <strong>nome dos professores livres (fora de aula)</strong> seguindo: <strong>1º Afinidade Pedagógica (Áreas de Atuação)</strong> → <strong>2º Divisão justa (Semana e Mês)</strong>.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 bg-white px-3 py-2 rounded-xl border border-indigo-200">
                <span className="text-[11px] font-black text-slate-700">Sobrecarga:</span>
                <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                  <span>&gt;</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxWeekBeforeOverload}
                    onChange={e => setMaxWeekBeforeOverload(Math.max(1, Number(e.target.value) || 1))}
                    className="w-11 px-1 py-0.5 border border-slate-300 rounded text-center font-black text-indigo-900"
                  />
                  <span>/sem</span>
                </label>
                <span className="text-slate-300">•</span>
                <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                  <span>&gt;</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={maxMonthBeforeOverload}
                    onChange={e => setMaxMonthBeforeOverload(Math.max(1, Number(e.target.value) || 1))}
                    className="w-11 px-1 py-0.5 border border-slate-300 rounded text-center font-black text-purple-900"
                  />
                  <span>/mês</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowDayMap(prev => !prev)}
                  className="ml-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showDayMap ? 'Ocultar Mapa' : 'Ver Fora de Aula'}</span>
                </button>
              </div>
            </div>

            {/* Filtro de Afinidade Pedagógica */}
            <div className="pt-2.5 border-t border-indigo-200/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black text-indigo-950 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-teal-700" />
                  <span>Filtro de Afinidade Pedagógica:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setOnlySameAreaFilter(false)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    !onlySameAreaFilter
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-indigo-200 text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  Priorizar Mesma Área (mostrar todos livres)
                </button>
                <button
                  type="button"
                  onClick={() => setOnlySameAreaFilter(true)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    onlySameAreaFilter
                      ? 'bg-teal-600 text-white'
                      : 'bg-white border border-indigo-200 text-slate-700 hover:bg-teal-50'
                  }`}
                >
                  Filtrar Somente Mesma Área de Atuação
                </button>
              </div>
              <span className="text-[10px] font-semibold text-indigo-800">
                Baseado nas Áreas de Atuação cadastradas de cada professor
              </span>
            </div>
          </div>

          {dayOfWeek < 1 || dayOfWeek > 5 ? (
            <div className="bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-2">
              <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto" />
              <p className="text-sm font-black text-slate-900">
                A data selecionada ({formatBrDate(selectedDate)}) cai em um fim de semana.
              </p>
              <p className="text-xs text-slate-500">
                Selecione um dia útil (Segunda a Sexta-feira) no seletor de data acima para consultar a Grade por Professor e escalar substitutos.
              </p>
            </div>
          ) : (
            <>
              {/* Mapa do Dia extraído da Grade por Professor */}
              {showDayMap && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 uppercase">
                      Mapa da Grade por Professor — {weekdayObj?.label} ({formatBrDate(selectedDate)})
                    </h4>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Em Sala × Fora de Aula (Livres p/ Substituição)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="py-2 px-3 w-28">Aula</th>
                          <th className="py-2 px-3">Professores LIVRES (Fora de Aula)</th>
                          <th className="py-2 px-3 w-64">Em Sala de Aula</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dayAvailabilityMap.map(row => (
                          <tr key={row.period.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-black text-slate-800 whitespace-nowrap">
                              {row.period.label}
                              <div className="text-[10px] font-normal text-slate-400">
                                {row.period.start}–{row.period.end}
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              {row.freeList.length === 0 ? (
                                <span className="text-slate-400">Nenhum docente livre</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {row.freeList.map(f => (
                                    <span
                                      key={f.name}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold"
                                    >
                                      <span>{f.name}</span>
                                      <span className="text-[10px] text-emerald-700 font-semibold">
                                        [{f.areas.join(', ')}] • S:{f.weekCount} | M:{f.monthCount}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-500">
                              <span className="font-bold text-slate-700">{row.inRoomList.length} em sala:</span>{' '}
                              {row.inRoomList.map(r => r.name).join(', ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Formulário de seleção do docente ausente */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[11px] font-black text-slate-700 block mb-1">
                    Professor(a) Ausente ({weekdayObj?.label}) *
                  </label>
                  <select
                    value={absentTeacher}
                    onChange={e => setAbsentTeacher(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50"
                  >
                    <option value="">— Selecione o professor ausente —</option>
                    {teachersWithLessonsOnDay.map(t => (
                      <option key={t.key} value={t.name}>
                        {t.name} [{t.areas.join(', ')}] • {t.count} aula{t.count > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-700 block mb-1">
                    Motivo da Ausência
                  </label>
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50"
                  >
                    {ABSENCE_REASONS.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-700 block mb-1">
                    Observação / Atividade Deixada (Opcional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ex: Atividade na plataforma ou roteiro na coordenação"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {reajusteNote && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{reajusteNote}</span>
                </div>
              )}

              {/* Tabela de Aulas do Professor Ausente */}
              {absentTeacher && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase">
                        Aulas de {absentTeacher} em {formatBrDate(selectedDate)} ({weekdayObj?.label}) — {lessonPlans.length} aula(s)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Áreas de afinidade: <strong>{lessonPlans[0]?.targetAreas.join(', ') || 'OUTROS'}</strong> • Substitutos extraídos diretamente dos horários <strong>Livres</strong> da aba Grade por Professor.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApplyAutoSuggestion}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Reaplicar Sugestão</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveSubstitutions}
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirmar e Salvar Escala</span>
                      </button>
                    </div>
                  </div>

                  {lessonPlans.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Este professor não possui aulas atribuídas na Grade por Professor de {weekdayObj?.label}.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                          <tr>
                            <th className="py-2.5 px-3 text-center w-10">Inc.</th>
                            <th className="py-2.5 px-3">Aula / Horário</th>
                            <th className="py-2.5 px-3">Turma & Disciplina</th>
                            <th className="py-2.5 px-3">Substituto (Livre na Grade por Professor)</th>
                            <th className="py-2.5 px-3">Qtd. Semana / Mês</th>
                            <th className="py-2.5 px-3">Afinidade & Reajuste</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lessonPlans.map(plan => {
                            const slotKey = `${plan.periodId}__${plan.classId}`;
                            const isChecked = selectedPeriods[slotKey] !== false;
                            const visibleCandidates = getVisibleCandidatesForPlan(plan);
                            const sameAreaCount = plan.candidates.filter(c => c.sameArea).length;
                            const chosenName = selectedSubstitutes[slotKey] || '';
                            const chosenCandidate = plan.candidates.find(
                              c => c.teacherName === chosenName
                            );
                            const chosenLoad = chosenCandidate
                              ? getProjectedLoad(chosenCandidate.teacherKey)
                              : null;
                            const overload = isChecked
                              ? evaluateSlotOverload(plan, chosenName)
                              : { isOverloaded: false, reason: '' };

                            return (
                              <tr
                                key={slotKey}
                                className={
                                  !isChecked
                                    ? 'opacity-45 bg-slate-50'
                                    : overload.isOverloaded
                                    ? 'bg-amber-50/70'
                                    : 'hover:bg-slate-50/70'
                                }
                              >
                                <td className="py-3 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={e =>
                                      setSelectedPeriods(prev => ({
                                        ...prev,
                                        [slotKey]: e.target.checked,
                                      }))
                                    }
                                    className="cursor-pointer"
                                  />
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="font-black text-slate-900">{plan.periodLabel}</div>
                                  {plan.start && (
                                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      <span>
                                        {plan.start}–{plan.end}
                                      </span>
                                    </div>
                                  )}
                                  <div
                                    className="text-[10px] text-slate-400 mt-0.5"
                                    title={`Em sala (${plan.teachersInClassroom.length}): ${plan.teachersInClassroom.join(', ')}`}
                                  >
                                    {plan.teachersInClassroom.length} em sala •{' '}
                                    <strong className="text-emerald-700">
                                      {plan.candidates.length} livre(s)
                                    </strong>
                                    {sameAreaCount > 0 && (
                                      <span className="text-teal-700 font-bold">
                                        {' '}
                                        ({sameAreaCount} afin.)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-black text-indigo-800">{plan.className}</div>
                                  <div className="text-[11px] font-semibold text-slate-600">
                                    ({plan.discipline})
                                  </div>
                                  <div className="text-[10px] text-teal-700 font-bold mt-0.5">
                                    Alvo: {plan.targetAreas.join(', ')}
                                  </div>
                                  {plan.existingSubstitution && (
                                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                      Salva: {plan.existingSubstitution.substituteTeacherName}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 min-w-[275px]">
                                  {plan.candidates.length === 0 ? (
                                    <span className="text-rose-600 font-bold text-[11px]">
                                      Nenhum professor livre neste horário
                                    </span>
                                  ) : visibleCandidates.length === 0 ? (
                                    <div className="space-y-1.5">
                                      <p className="text-[11px] font-bold text-amber-800">
                                        Nenhum docente da mesma área ({plan.targetAreas.join(', ')}) está livre neste horário.
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAllowOtherAreasForSlot(prev => ({
                                            ...prev,
                                            [slotKey]: true,
                                          }));
                                          if (plan.candidates[0]) {
                                            setSelectedSubstitutes(prev => ({
                                              ...prev,
                                              [slotKey]: plan.candidates[0].teacherName,
                                            }));
                                          }
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold cursor-pointer"
                                      >
                                        Mostrar outras áreas livres ({plan.candidates.length})
                                      </button>
                                    </div>
                                  ) : (
                                    <select
                                      disabled={!isChecked}
                                      value={chosenName}
                                      onChange={e => {
                                        setSelectedSubstitutes(prev => ({
                                          ...prev,
                                          [slotKey]: e.target.value,
                                        }));
                                        setReajusteNote(null);
                                      }}
                                      className={`w-full px-2.5 py-2 text-xs font-bold border rounded-lg bg-white ${
                                        overload.isOverloaded
                                          ? 'border-amber-400 ring-1 ring-amber-300'
                                          : 'border-slate-200'
                                      }`}
                                    >
                                      <option value="">— Não escalar —</option>
                                      {visibleCandidates.map((cand, i) => {
                                        const cLoad = getProjectedLoad(cand.teacherKey);
                                        return (
                                          <option key={cand.teacherKey} value={cand.teacherName}>
                                            {i === 0 ? '★ ' : ''}
                                            {cand.teacherName} [{cand.areas.join(', ')}] — Sem: {cLoad.baseWeek} | Mês:{' '}
                                            {cLoad.baseMonth}
                                            {cand.sameArea ? ' (Afinidade ✓)' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  )}
                                  {plan.blockedInAtpcaOrMultiplica.length > 0 && (
                                    <p className="text-[10px] text-slate-400 mt-1">
                                      Em ATPCA/Multiplica ({plan.blockedInAtpcaOrMultiplica.length}):{' '}
                                      {plan.blockedInAtpcaOrMultiplica
                                        .slice(0, 3)
                                        .map(b => b.teacherName)
                                        .join(', ')}
                                      {plan.blockedInAtpcaOrMultiplica.length > 3 ? '...' : ''}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  {chosenLoad ? (
                                    <div className="flex flex-col gap-1">
                                      <span
                                        className={`inline-flex items-center justify-between gap-2 px-2 py-0.5 rounded-lg text-[11px] font-black border ${
                                          chosenLoad.projectedWeek > maxWeekBeforeOverload
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                        }`}
                                      >
                                        <span>Semana:</span>
                                        <span>
                                          {chosenLoad.baseWeek}
                                          {chosenLoad.added > 0 ? ` → ${chosenLoad.projectedWeek}` : ''}
                                        </span>
                                      </span>
                                      <span
                                        className={`inline-flex items-center justify-between gap-2 px-2 py-0.5 rounded-lg text-[11px] font-black border ${
                                          chosenLoad.projectedMonth > maxMonthBeforeOverload
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-purple-50 text-purple-900 border-purple-200'
                                        }`}
                                      >
                                        <span>Mês:</span>
                                        <span>
                                          {chosenLoad.baseMonth}
                                          {chosenLoad.added > 0 ? ` → ${chosenLoad.projectedMonth}` : ''}
                                        </span>
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 min-w-[215px]">
                                  {chosenCandidate ? (
                                    <div className="space-y-1.5">
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                          chosenCandidate.sameArea
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        {chosenCandidate.sameArea
                                          ? `Mesma Área (${chosenCandidate.matchedAreas.join(', ')})`
                                          : `Outra Área (${chosenCandidate.areas.join(', ')})`}
                                      </span>

                                      {overload.isOverloaded ? (
                                        <div className="space-y-1.5">
                                          <div className="flex items-center gap-1 text-[10px] font-black text-rose-700">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                            <span>Sobrecarga: {overload.reason}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleReadjustSingleOverloadedSlot(plan)}
                                            className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                            title="Troca somente este professor sobrecarregado pelo docente livre com menor carga na semana e no mês"
                                          >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            <span>Reajustar só esta aula</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          <span>Carga equilibrada</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {!absentTeacher && teachersWithLessonsOnDay.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                  Nenhuma aula atribuída para {weekdayObj?.label} na Grade por Professor. Importe ou preencha a grade horária primeiro.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB 2: CONFIGURAÇÃO DE ÁREAS DE ATUAÇÃO (AFINIDADE PEDAGÓGICA)    */}
      {/* ================================================================= */}
      {subView === 'areas' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-teal-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                <Tags className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Áreas de Atuação dos Professores — Afinidade Pedagógica
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Configure uma ou mais áreas de atuação para cada docente. O sistema de substituição usa esta configuração para filtrar e priorizar automaticamente os candidatos com maior afinidade pedagógica.
                </p>
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAutoDetectAllAreas}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  title="Preenche automaticamente as áreas com base nas disciplinas que cada professor ministra na grade"
                >
                  <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Auto-detectar pelas Disciplinas</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveTeacherAreas}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer ${
                    areasDirty
                      ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300'
                      : 'bg-teal-600 hover:bg-teal-700'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>{areasDirty ? 'Salvar Alterações*' : 'Salvar Áreas de Atuação'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Filtros da lista de Áreas */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={areaEditorSearch}
                onChange={e => setAreaEditorSearch(e.target.value)}
                placeholder="Buscar professor ou disciplina..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 w-60"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setAreaEditorFilter('todas')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                  areaEditorFilter === 'todas'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                Todas ({teacherGrid.teachers.length})
              </button>
              {DEFAULT_AREA_OPTIONS.map(a => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => setAreaEditorFilter(a.code)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                    areaEditorFilter === a.code
                      ? 'bg-teal-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {a.code}
                </button>
              ))}
            </div>
          </div>

          {/* Tabela de Edição de Áreas de Atuação */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredAreaTeachers.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                Nenhum professor encontrado na grade para este filtro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4">Professor(a)</th>
                      <th className="py-2.5 px-3">Disciplinas na Grade</th>
                      <th className="py-2.5 px-3 text-center">Aulas/Sem</th>
                      <th className="py-2.5 px-4">Áreas de Atuação (clique para marcar/desmarcar)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAreaTeachers.map(t => {
                      const selectedAreas = areaDraftByTeacherKey[t.teacherKey] || t.areas;
                      return (
                        <tr key={t.teacherKey} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-black text-slate-900 whitespace-nowrap">
                            {t.teacherName}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-600">
                            {t.disciplines.length > 0 ? t.disciplines.join(', ') : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                            {t.weeklyLessonsCount}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap gap-1.5">
                              {DEFAULT_AREA_OPTIONS.map(opt => {
                                const isActive = selectedAreas.includes(opt.code);
                                return (
                                  <button
                                    key={opt.code}
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => handleToggleTeacherArea(t.teacherKey, opt.code)}
                                    title={opt.label}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all ${
                                      canEdit ? 'cursor-pointer' : 'cursor-default'
                                    } ${
                                      isActive
                                        ? 'bg-teal-600 text-white border-teal-700 shadow-2xs'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {isActive ? '✓ ' : ''}
                                    {opt.code}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>
                <strong>Legenda:</strong> LGG (Linguagens) • MAT (Matemática/Exatas) • CHS (Humanas) • CNT (Natureza) • INOVA (Projeto de Vida / Tecnologia / Parte Diversificada)
              </span>
              {canEdit && areasDirty && (
                <button
                  type="button"
                  onClick={handleSaveTeacherAreas}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
                >
                  Salvar Áreas Agora
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB 3: ESCALA DO DIA & HISTÓRICO DE SUBSTITUIÇÕES                 */}
      {/* ================================================================= */}
      {subView === 'escala' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              {(['dia', 'semana', 'mes', 'todos'] as const).map(sc => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setHistoryScope(sc)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    historyScope === sc
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {sc === 'dia'
                    ? `Dia (${formatBrDate(selectedDate)})`
                    : sc === 'semana'
                    ? 'Semana'
                    : sc === 'mes'
                    ? 'Mês'
                    : 'Todos'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Buscar professor ou turma..."
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              />
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Escala</span>
              </button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Nenhuma substituição registrada neste filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Aula</th>
                    <th className="py-2.5 px-3">Turma</th>
                    <th className="py-2.5 px-3">Ausente (Disciplina)</th>
                    <th className="py-2.5 px-3">Substituto PEI</th>
                    <th className="py-2.5 px-3">Qtd. Sem / Mês</th>
                    <th className="py-2.5 px-3">Área</th>
                    <th className="py-2.5 px-3">Motivo</th>
                    {canEdit && <th className="py-2.5 px-3 text-right">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map(sub => {
                    const subFair = fairnessByKey.get(
                      normalizeTeacherKey(sub.substituteTeacherName)
                    );
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {formatBrDate(sub.date)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                          {sub.periodLabel}
                        </td>
                        <td className="py-2.5 px-3 font-black text-indigo-800 whitespace-nowrap">
                          {sub.className}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900">{sub.absentTeacherName}</span>{' '}
                          <span className="text-slate-500">({sub.discipline})</span>
                        </td>
                        <td className="py-2.5 px-3 font-black text-emerald-800">
                          {sub.substituteTeacherName}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-[11px] font-bold text-slate-700">
                          Sem: <span className="text-emerald-700">{subFair?.weekCount ?? 0}</span> • Mês:{' '}
                          <span className="text-purple-700">{subFair?.monthCount ?? 0}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              sub.sameArea
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {sub.sameArea
                              ? `Mesma (${sub.substituteTeacherArea})`
                              : `${sub.substituteTeacherArea} → ${sub.absentTeacherArea}`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div>{sub.reason || '—'}</div>
                          {sub.notes && (
                            <div className="text-[10px] text-slate-400">{sub.notes}</div>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteSubstitution(sub)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Remover substituição"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB 4: PLACAR DE DIVISÃO JUSTA (SEMANA E MÊS)                     */}
      {/* ================================================================= */}
      {subView === 'equidade' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase">
                Placar de Equidade — Divisão Justa de Substituições PEI
              </h4>
              <p className="text-[11px] text-slate-500">
                Referência: Semana {formatBrDate(weekRange.start)} a {formatBrDate(weekRange.end)} • Mês {monthPrefix}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFairnessAreaFilter('todas')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                  fairnessAreaFilter === 'todas'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                Todas Áreas
              </button>
              {DEFAULT_AREA_OPTIONS.map(a => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => setFairnessAreaFilter(a.code)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                    fairnessAreaFilter === a.code
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {a.code}
                </button>
              ))}
            </div>
          </div>

          {filteredFairnessRows.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Nenhum docente presente na grade para esta área.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Professor(a)</th>
                    <th className="py-2.5 px-3">Áreas de Atuação</th>
                    <th className="py-2.5 px-4 w-48">Na Semana</th>
                    <th className="py-2.5 px-4 w-48">No Mês</th>
                    <th className="py-2.5 px-3 text-center">Total Geral</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFairnessRows.map(row => (
                    <tr key={row.teacherKey} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-900">{row.teacherName}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {row.areas.map(a => (
                            <span
                              key={a}
                              className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-black uppercase"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-emerald-700 w-6 text-right">
                            {row.weekCount}
                          </span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${Math.round((row.weekCount / maxWeekCount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-purple-700 w-6 text-right">
                            {row.monthCount}
                          </span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all"
                              style={{ width: `${Math.round((row.monthCount / maxMonthCount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-black text-slate-700">
                        {row.totalCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
