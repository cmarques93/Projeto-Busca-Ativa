import React, { useMemo, useState } from 'react';
import {
  Users,
  Search,
  Printer,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  LayoutGrid,
  TableProperties,
  X,
  Plus,
  Trash2,
  Tags
} from 'lucide-react';
import {
  AnnualTimetableCriteria,
  SchoolClass,
  TimetableGridCell,
  TimetablePeriodDef,
  TimetableWorkspace
} from '../types';
import {
  DEFAULT_AREA_OPTIONS,
  WEEKDAYS,
  TeacherTimetableRow,
  UnassignedLessonGroup,
  buildTeacherTimetableView,
  getCellColorHex,
  getCellKey,
  hasPlatformKeyword,
  inferDisciplineArea,
  isExclusiveGroupDiscipline,
  isNoteDiscipline,
  normalizeTeacherKey,
  normalizeText
} from '../utils/timetableEngine';

interface TimetableByTeacherTabProps {
  workspace: TimetableWorkspace;
  criteria: AnnualTimetableCriteria;
  classes: SchoolClass[];
  canEdit: boolean;
  onUpdateWorkspace: (nextWorkspace: TimetableWorkspace, message: string, undoLabel: string) => void;
  onOpenSubstitutions: (subTab?: 'escalar' | 'areas') => void;
}

export const TimetableByTeacherTab: React.FC<TimetableByTeacherTabProps> = ({
  workspace,
  criteria,
  classes,
  canEdit,
  onUpdateWorkspace,
  onOpenSubstitutions,
}) => {
  const [viewMode, setViewMode] = useState<'semanal' | 'radar_dia'>('semanal');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [areaFilter, setAreaFilter] = useState<string>('todas');
  const [selectedTeacherKey, setSelectedTeacherKey] = useState<string>('todos');
  const [radarDay, setRadarDay] = useState<number>(1);

  // Atribuição rápida para aulas que vieram sem nome de professor (ex: Projeto de Vida, Arte)
  const [unassignedSelections, setUnassignedSelections] = useState<Record<string, string>>({});

  // Modal rápido para editar ou adicionar aula diretamente na Grade por Professor
  const [editingTeacherSlot, setEditingTeacherSlot] = useState<{
    teacherName: string;
    dayOfWeek: number;
    period: TimetablePeriodDef;
    existingCellId?: string;
    classId: string;
    discipline: string;
  } | null>(null);

  const teacherGrid = useMemo(
    () => buildTeacherTimetableView(workspace, classes),
    [workspace, classes]
  );

  const teachingPeriods = useMemo(
    () => (workspace.periods || []).filter(p => !p.isBreak && p.number > 0),
    [workspace.periods]
  );

  const allTeacherNamesForDatalist = useMemo(() => {
    const names = new Map<string, string>();
    for (const t of teacherGrid.teachers) {
      names.set(t.teacherKey, t.teacherName);
    }
    for (const t of workspace.teachers || []) {
      const k = normalizeTeacherKey(t.name);
      if (k && !names.has(k)) names.set(k, t.name);
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [teacherGrid.teachers, workspace.teachers]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teacherGrid.teachers.filter(t => {
      if (selectedTeacherKey !== 'todos' && t.teacherKey !== selectedTeacherKey) return false;
      if (areaFilter !== 'todas' && !t.areas.includes(areaFilter)) return false;
      if (q) {
        const hay = `${t.teacherName} ${t.areas.join(' ')} ${t.disciplines.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [teacherGrid.teachers, selectedTeacherKey, areaFilter, searchQuery]);

  // Atribui professor a um grupo de aulas sem docente (ex.: 6º A - Projeto de Vida)
  const handleAssignTeacherToGroup = (group: UnassignedLessonGroup) => {
    if (!canEdit) return;
    const gKey = `${group.classId}__${normalizeText(group.discipline)}`;
    const chosenTeacher = (unassignedSelections[gKey] || '').trim();
    if (!chosenTeacher) return;

    const targetCellIds = new Set(group.cellIds);
    const nextCells = (workspace.cells || []).map(cell => {
      if (!targetCellIds.has(cell.id)) return cell;
      return {
        ...cell,
        fixedLabel: undefined,
        teacherName: chosenTeacher,
      };
    });

    // Garante cadastro do docente em workspace.teachers caso seja novo
    const nextTeachers = [...(workspace.teachers || [])];
    const tKey = normalizeTeacherKey(chosenTeacher);
    if (!nextTeachers.some(t => normalizeTeacherKey(t.name) === tKey)) {
      const inferredArea = inferDisciplineArea(group.discipline, criteria);
      nextTeachers.push({
        id: `prof_assign_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: chosenTeacher,
        area: inferredArea || 'OUTROS',
        areas: inferredArea && inferredArea !== 'OUTROS' ? [inferredArea] : undefined,
        multiplicaPeriods: [],
        dailyLimit: criteria.defaultTeacherDailyLimit || 7,
      });
    }

    setUnassignedSelections(prev => {
      const copy = { ...prev };
      delete copy[gKey];
      return copy;
    });

    onUpdateWorkspace(
      {
        ...workspace,
        cells: nextCells,
        teachers: nextTeachers,
      },
      `Professor(a) ${chosenTeacher} vinculado(a) a ${group.count} aula(s) de ${group.discipline} (${group.className})!`,
      `Vincular ${chosenTeacher} em ${group.className} (${group.discipline})`
    );
  };

  // Salva edição ou nova aula diretamente a partir de uma célula da Grade por Professor
  const handleSaveTeacherSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !editingTeacherSlot) return;

    const { teacherName, dayOfWeek, period, existingCellId, classId, discipline } = editingTeacherSlot;
    if (!classId || !discipline.trim()) return;

    const cls = classes.find(c => c.id === classId);
    const className = cls?.name || classId;
    const newCellId = getCellKey(dayOfWeek, period.id, classId);
    const disc = discipline.trim();

    const inferredCat: TimetableGridCell['category'] = isNoteDiscipline(disc, criteria)
      ? 'note'
      : isExclusiveGroupDiscipline(disc, criteria)
      ? 'ema'
      : 'rest';
    const isPlat = inferredCat === 'note' || hasPlatformKeyword(disc, criteria);

    const nextCell: TimetableGridCell = {
      id: newCellId,
      dayOfWeek,
      periodId: period.id,
      periodNumber: period.number,
      periodLabel: period.label,
      classId,
      className,
      teacherName: teacherName.trim(),
      discipline: disc,
      category: inferredCat,
      hasPlatform: isPlat,
      platformName: isPlat ? disc : undefined,
    };
    nextCell.colorHex = getCellColorHex(nextCell, workspace.teachers || [], criteria).bg;

    const filtered = (workspace.cells || []).filter(
      c => c.id !== newCellId && (!existingCellId || c.id !== existingCellId)
    );
    filtered.push(nextCell);

    setEditingTeacherSlot(null);
    onUpdateWorkspace(
      {
        ...workspace,
        cells: filtered,
      },
      `Grade de ${teacherName} atualizada: ${className} (${disc}) na ${period.label}.`,
      `Ajuste na Grade por Professor (${teacherName})`
    );
  };

  const handleRemoveTeacherSlot = () => {
    if (!canEdit || !editingTeacherSlot?.existingCellId) return;
    const targetId = editingTeacherSlot.existingCellId;
    const tName = editingTeacherSlot.teacherName;
    const pLabel = editingTeacherSlot.period.label;
    setEditingTeacherSlot(null);
    onUpdateWorkspace(
      {
        ...workspace,
        cells: (workspace.cells || []).filter(c => c.id !== targetId),
      },
      `Aula removida da grade de ${tName} (${pLabel}). Horário agora consta como Livre para substituições.`,
      `Remover aula de ${tName}`
    );
  };

  const renderTeacherWeeklyCard = (prof: TeacherTimetableRow) => {
    return (
      <div
        key={prof.teacherKey}
        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden break-inside-avoid"
      >
        <div className="px-4 py-3 bg-indigo-950 text-white flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-black tracking-tight">{prof.teacherName}</h4>
              <div className="flex flex-wrap gap-1">
                {prof.areas.map(a => (
                  <span
                    key={a}
                    className="px-2 py-0.5 rounded-md bg-white/15 border border-white/25 text-[10px] font-black uppercase text-indigo-100"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-indigo-200 mt-0.5">
              {prof.disciplines.length > 0
                ? `Disciplinas: ${prof.disciplines.join(', ')}`
                : 'Sem disciplinas regulares atribuídas'}
              {' • '}
              <strong>{prof.weeklyLessonsCount} aulas/sem</strong>
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => onOpenSubstitutions('areas')}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white flex items-center gap-1 cursor-pointer"
              title="Editar áreas de atuação deste professor nas configurações de Substituições"
            >
              <Tags className="w-3 h-3" />
              <span>Editar Áreas</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <th className="py-2 px-2.5 text-left font-black w-20">Aula</th>
                {WEEKDAYS.map(w => (
                  <th
                    key={w.id}
                    className="py-2 px-2 text-center font-black border-l border-slate-200"
                  >
                    <div>{w.short}</div>
                    <div className="text-[9px] font-semibold text-slate-400">
                      {prof.dailyLessonsCount[w.id] || 0} aulas
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {teachingPeriods.map(p => (
                <tr key={p.id}>
                  <td className="py-1.5 px-2.5 font-bold text-slate-700 whitespace-nowrap bg-slate-50/70">
                    <div>{p.label}</div>
                    <div className="text-[9px] font-mono text-slate-400">
                      {p.start}-{p.end}
                    </div>
                  </td>
                  {WEEKDAYS.map(w => {
                    const slot = prof.slotsByDay[w.id]?.[p.id];
                    if (!slot) {
                      return (
                        <td
                          key={w.id}
                          className="py-1.5 px-1.5 text-center border-l border-slate-200 text-slate-300"
                        >
                          —
                        </td>
                      );
                    }

                    if (slot.status === 'em_aula' && slot.lessons.length > 0) {
                      const first = slot.lessons[0];
                      const hasClash = slot.lessons.length > 1;
                      return (
                        <td
                          key={w.id}
                          onClick={() => {
                            if (!canEdit) return;
                            setEditingTeacherSlot({
                              teacherName: prof.teacherName,
                              dayOfWeek: w.id,
                              period: p,
                              existingCellId: first.cellId,
                              classId: first.classId,
                              discipline: first.discipline,
                            });
                          }}
                          className={`py-1.5 px-1.5 text-center border-l border-slate-200 align-middle transition-all ${
                            canEdit ? 'cursor-pointer hover:brightness-95' : ''
                          } ${hasClash ? 'ring-2 ring-rose-600 ring-inset' : ''}`}
                          style={{
                            backgroundColor: first.colorHex || '#eef2ff',
                            color: '#0f172a',
                          }}
                          title={
                            canEdit
                              ? `Em sala: ${slot.lessons
                                  .map(l => `${l.className} (${l.discipline})`)
                                  .join(' / ')} — Clique para editar`
                              : undefined
                          }
                        >
                          <div className="font-black leading-tight text-slate-900">
                            {slot.lessons.map(l => l.className).join(' / ')}
                          </div>
                          <div className="text-[9.5px] font-semibold text-slate-800/90 truncate max-w-[115px] mx-auto">
                            ({first.discipline})
                          </div>
                          {hasClash && (
                            <span className="inline-block mt-0.5 px-1 rounded bg-rose-700 text-white text-[8px] font-black uppercase">
                              Choque
                            </span>
                          )}
                        </td>
                      );
                    }

                    if (slot.status === 'bloqueado') {
                      return (
                        <td
                          key={w.id}
                          className="py-1.5 px-1.5 text-center border-l border-slate-200 bg-rose-100 text-rose-900 font-black text-[10px]"
                        >
                          {slot.blockReason || 'ATPCA / Multiplica'}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={w.id}
                        onClick={() => {
                          if (!canEdit) return;
                          setEditingTeacherSlot({
                            teacherName: prof.teacherName,
                            dayOfWeek: w.id,
                            period: p,
                            classId: classes[0]?.id || '',
                            discipline: prof.disciplines[0] || '',
                          });
                        }}
                        className={`py-1.5 px-1.5 text-center border-l border-slate-200 bg-emerald-50/70 text-emerald-800 text-[10px] font-semibold ${
                          canEdit ? 'cursor-pointer hover:bg-emerald-100/80' : ''
                        }`}
                        title={
                          canEdit
                            ? 'Professor fora de aula (disponível para substituição). Clique para atribuir uma aula regular neste horário.'
                            : 'Fora de aula — disponível para substituição'
                        }
                      >
                        Livre
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Banner Explicativo da Fonte Oficial para Substituições */}
      <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900">
                Grade Curricular por Professor ({teacherGrid.teachers.length} docentes)
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                Fonte Oficial das Substituições PEI
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              O sistema de <strong>Substituições PEI</strong> consulta diretamente esta aba para identificar quem está <strong>em sala de aula</strong>, quem está em <strong>ATPCA/Multiplica</strong> e quem está <strong>Livre (Fora de Aula)</strong> em cada horário.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenSubstitutions('escalar')}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>Ir para Substituições PEI</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* ALERTA & CORREÇÃO RÁPIDA: Aulas sem Nome do Professor (ex: Projeto de Vida, Arte) */}
      {teacherGrid.unassignedCellCount > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-300 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-amber-100/80 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <div>
                <h4 className="text-xs font-black text-amber-950 uppercase">
                  Aulas somente com Disciplina (sem Nome do Professor): {teacherGrid.unassignedCellCount} aula(s)
                </h4>
                <p className="text-[11px] text-amber-900">
                  Vincule o professor responsável abaixo para que o <strong>nome do professor sempre apareça</strong> na grade e entre automaticamente na Grade por Professor e nas Substituições.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-amber-200/70 max-h-64 overflow-y-auto">
            {teacherGrid.unassignedGroups.map(group => {
              const gKey = `${group.classId}__${normalizeText(group.discipline)}`;
              const val = unassignedSelections[gKey] || '';
              return (
                <div
                  key={gKey}
                  className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/80"
                >
                  <div className="text-xs">
                    <span className="font-black text-indigo-800">{group.className}</span>
                    <span className="mx-1.5 text-slate-400">•</span>
                    <span className="font-black text-slate-900">{group.discipline}</span>
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                      {group.count} aula{group.count > 1 ? 's' : ''} ({group.slotsSummary.join(', ')})
                    </span>
                  </div>

                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        list="unassigned-teachers-datalist"
                        value={val}
                        onChange={e =>
                          setUnassignedSelections(prev => ({
                            ...prev,
                            [gKey]: e.target.value,
                          }))
                        }
                        placeholder="Selecione ou digite o professor..."
                        className="px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg bg-white min-w-[200px] font-semibold"
                      />
                      <button
                        type="button"
                        disabled={!val.trim()}
                        onClick={() => handleAssignTeacherToGroup(group)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Vincular Professor</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-800">
                      Aguardando vinculação pela gestão
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <datalist id="unassigned-teachers-datalist">
            {allTeacherNamesForDatalist.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      )}

      {/* Barra de Modo de Visualização e Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('semanal')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'semanal'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Por Professor (Semanal Seg–Sex)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('radar_dia')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'radar_dia'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5" />
            <span>Radar do Dia (Todos × 1ª–9ª Aula)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar professor ou disciplina..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 w-52"
            />
          </div>

          <select
            value={areaFilter}
            onChange={e => setAreaFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50"
          >
            <option value="todas">Todas as Áreas</option>
            {DEFAULT_AREA_OPTIONS.map(a => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>

          {viewMode === 'semanal' ? (
            <select
              value={selectedTeacherKey}
              onChange={e => setSelectedTeacherKey(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50"
            >
              <option value="todos">Todos os Professores ({teacherGrid.teachers.length})</option>
              {teacherGrid.teachers.map(t => (
                <option key={t.teacherKey} value={t.teacherKey}>
                  {t.teacherName} [{t.areas.join(', ')}]
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {WEEKDAYS.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setRadarDay(w.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                    radarDay === w.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {w.short}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      {teacherGrid.teachers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-2">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-700">
            Nenhum professor encontrado na grade horária atual.
          </p>
          <p className="text-xs text-slate-500">
            Importe a planilha/PDF do horário ou atribua aulas na aba "Grade Completa & Distribuição" para preencher automaticamente a Grade por Professor.
          </p>
        </div>
      ) : viewMode === 'semanal' ? (
        filteredTeachers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-400">
            Nenhum professor corresponde aos filtros selecionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredTeachers.map(renderTeacherWeeklyCard)}
          </div>
        )
      ) : (
        /* VISÃO 2: RADAR DO DIA (TODOS OS PROFESSORES × 1ª–9ª AULA) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase">
                Radar de Disponibilidade — {WEEKDAYS.find(w => w.id === radarDay)?.label} ({filteredTeachers.length} professores)
              </h4>
              <p className="text-[11px] text-slate-500">
                Células em <strong className="text-emerald-700">verde (LIVRE)</strong> indicam os professores fora de sala que o sistema escala para substituições naquele horário.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <span className="inline-flex items-center gap-1 text-emerald-800">
                <span className="w-2.5 h-2.5 rounded bg-emerald-200 border border-emerald-400" />
                Livre (Substituto)
              </span>
              <span className="inline-flex items-center gap-1 text-indigo-800">
                <span className="w-2.5 h-2.5 rounded bg-indigo-100 border border-indigo-300" />
                Em Sala
              </span>
              <span className="inline-flex items-center gap-1 text-rose-800">
                <span className="w-2.5 h-2.5 rounded bg-rose-200 border border-rose-400" />
                ATPCA / Multiplica
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-900 text-white">
                <tr>
                  <th className="py-2.5 px-3 text-left font-black sticky left-0 bg-slate-900 z-30 min-w-[175px]">
                    Professor / Áreas
                  </th>
                  {teachingPeriods.map(p => (
                    <th
                      key={p.id}
                      className="py-2 px-2 text-center font-black border-l border-slate-700 min-w-[105px]"
                    >
                      <div>{p.label}</div>
                      <div className="text-[9px] font-normal text-slate-300">
                        {p.start}-{p.end}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTeachers.map(prof => (
                  <tr key={prof.teacherKey} className="hover:bg-slate-50">
                    <td className="py-2 px-3 bg-white sticky left-0 z-10 border-r border-slate-200">
                      <div className="font-black text-slate-900 leading-tight">
                        {prof.teacherName}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {prof.areas.map(a => (
                          <span
                            key={a}
                            className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[9px] font-black uppercase"
                          >
                            {a}
                          </span>
                        ))}
                        <span className="text-[9px] text-slate-400 font-semibold">
                          • {prof.dailyLessonsCount[radarDay] || 0} aulas
                        </span>
                      </div>
                    </td>
                    {teachingPeriods.map(p => {
                      const slot = prof.slotsByDay[radarDay]?.[p.id];
                      if (!slot) {
                        return (
                          <td
                            key={p.id}
                            className="p-1.5 text-center border-l border-slate-200 text-slate-300"
                          >
                            —
                          </td>
                        );
                      }
                      if (slot.status === 'em_aula' && slot.lessons.length > 0) {
                        const first = slot.lessons[0];
                        return (
                          <td
                            key={p.id}
                            onClick={() => {
                              if (!canEdit) return;
                              setEditingTeacherSlot({
                                teacherName: prof.teacherName,
                                dayOfWeek: radarDay,
                                period: p,
                                existingCellId: first.cellId,
                                classId: first.classId,
                                discipline: first.discipline,
                              });
                            }}
                            className={`p-1.5 text-center border-l border-slate-200 ${
                              canEdit ? 'cursor-pointer hover:brightness-95' : ''
                            }`}
                            style={{ backgroundColor: first.colorHex || '#eef2ff' }}
                          >
                            <div className="font-black text-slate-900 leading-tight">
                              {slot.lessons.map(l => l.className).join(' / ')}
                            </div>
                            <div className="text-[9px] font-semibold text-slate-800 truncate max-w-[100px] mx-auto">
                              ({first.discipline})
                            </div>
                          </td>
                        );
                      }
                      if (slot.status === 'bloqueado') {
                        return (
                          <td
                            key={p.id}
                            className="p-1.5 text-center border-l border-slate-200 bg-rose-100 text-rose-900 font-black text-[10px]"
                          >
                            {slot.blockReason || 'ATPCA'}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={p.id}
                          onClick={() => {
                            if (!canEdit) return;
                            setEditingTeacherSlot({
                              teacherName: prof.teacherName,
                              dayOfWeek: radarDay,
                              period: p,
                              classId: classes[0]?.id || '',
                              discipline: prof.disciplines[0] || '',
                            });
                          }}
                          className={`p-1.5 text-center border-l border-slate-200 bg-emerald-50 text-emerald-800 font-black text-[10px] ${
                            canEdit ? 'cursor-pointer hover:bg-emerald-100' : ''
                          }`}
                        >
                          LIVRE
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black text-[10px]">
                <tr>
                  <td className="py-2 px-3 sticky left-0 bg-slate-100 border-r border-slate-300 text-slate-800">
                    Resumo do Horário
                  </td>
                  {teachingPeriods.map(p => {
                    let inClass = 0;
                    let free = 0;
                    for (const prof of filteredTeachers) {
                      const s = prof.slotsByDay[radarDay]?.[p.id];
                      if (s?.status === 'em_aula') inClass += 1;
                      else if (s?.status === 'livre') free += 1;
                    }
                    return (
                      <td
                        key={p.id}
                        className="py-2 px-1.5 text-center border-l border-slate-200"
                      >
                        <div className="text-emerald-700">{free} livre(s)</div>
                        <div className="text-slate-500 font-semibold">{inClass} em sala</div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO RÁPIDA DE CÉLULA NA GRADE POR PROFESSOR */}
      {editingTeacherSlot && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  {editingTeacherSlot.existingCellId
                    ? 'Editar Aula do Professor'
                    : 'Atribuir Aula neste Horário Livre'}
                </h4>
                <p className="text-[11px] text-slate-500">
                  <strong>{editingTeacherSlot.teacherName}</strong> •{' '}
                  {WEEKDAYS.find(w => w.id === editingTeacherSlot.dayOfWeek)?.label} —{' '}
                  {editingTeacherSlot.period.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTeacherSlot(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacherSlot} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Turma *
                </label>
                <select
                  required
                  value={editingTeacherSlot.classId}
                  onChange={e =>
                    setEditingTeacherSlot({ ...editingTeacherSlot, classId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Disciplina *
                </label>
                <input
                  type="text"
                  required
                  value={editingTeacherSlot.discipline}
                  onChange={e =>
                    setEditingTeacherSlot({ ...editingTeacherSlot, discipline: e.target.value })
                  }
                  placeholder="Ex: PORTUGUÊS, PROJETO DE VIDA, ARTE..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {editingTeacherSlot.existingCellId ? (
                  <button
                    type="button"
                    onClick={handleRemoveTeacherSlot}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Deixar Livre</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTeacherSlot(null)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Salvar na Grade</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
