import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Clock,
  Save,
  Plus,
  Trash2,
  Search,
  BookOpen,
  CalendarClock,
  Check,
  ShieldAlert,
} from 'lucide-react';
import {
  AtpcaBlockRule,
  MultiplicaSlot,
  SchoolClass,
  TimetablePeriodDef,
  TimetableTeacherProfile,
  TimetableWorkspace,
  UserAccount,
} from '../types';
import { storageService } from '../data/storageService';
import {
  DEFAULT_AREA_OPTIONS,
  WEEKDAYS,
  getAllCatalogDisciplines,
  getEffectiveSchoolPeriods,
  getTeacherMultiplicaSlots,
  normalizeTeacherKey,
  normalizeText,
  resolveMultiplicaPeriodsFromClock,
  syncGradeCurriculumToMatrix,
} from '../utils/timetableEngine';

interface TimetableTeamTabProps {
  workspace: TimetableWorkspace;
  classes: SchoolClass[];
  canEdit: boolean;
  onUpdateWorkspace: (nextWorkspace: TimetableWorkspace, message: string, undoLabel: string) => void;
  onOpenMatrixTab: () => void;
}

interface TeamMemberDraft {
  userId: string;
  name: string;
  role: 'professor' | 'gestao_paac';
  roleLabel: string;
  areas: string[];
  disciplines: string[];
  multiplicaSlots: MultiplicaSlot[];
  dailyLimit: number;
}

export const TimetableTeamTab: React.FC<TimetableTeamTabProps> = ({
  workspace,
  classes,
  canEdit,
  onUpdateWorkspace,
  onOpenMatrixTab,
}) => {
  const [subView, setSubView] = useState<'equipe' | 'atpca'>('equipe');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | 'professor' | 'gestao_paac'>('todos');
  const [isDirty, setIsDirty] = useState(false);

  // Formulário ATPCA por Área
  const [newAtpcaArea, setNewAtpcaArea] = useState('LGG');
  const [newAtpcaDay, setNewAtpcaDay] = useState<number>(2);
  const [newAtpcaPeriods, setNewAtpcaPeriods] = useState<string>('1, 2');
  const [newAtpcaLabel, setNewAtpcaLabel] = useState<string>('');

  const effectivePeriods = useMemo<TimetablePeriodDef[]>(
    () => getEffectiveSchoolPeriods(workspace),
    [workspace]
  );

  // Disciplinas cadastradas na Matriz Curricular / Grade da escola
  const catalogDisciplines = useMemo(
    () => getAllCatalogDisciplines(workspace),
    [workspace]
  );

  // Filtra ESTRITAMENTE os usuários ativos cadastrados na escola com perfil Professor ou PAAC
  const registeredTeamUsers = useMemo<UserAccount[]>(() => {
    const sId = workspace.schoolId || storageService.getActiveSchoolId();
    return storageService
      .getUsers(sId)
      .filter(u => u.active !== false && (u.role === 'professor' || u.role === 'gestao_paac'))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [workspace.schoolId]);

  // Monta o estado editável mesclando os usuários cadastrados (Professor e PAAC) com os perfis salvos no workspace
  const initialDrafts = useMemo<TeamMemberDraft[]>(() => {
    const profileByUserId = new Map<string, TimetableTeacherProfile>();
    const profileByNameKey = new Map<string, TimetableTeacherProfile>();
    for (const p of workspace.teachers || []) {
      if (p.userId) profileByUserId.set(p.userId, p);
      if (p.id) profileByUserId.set(p.id, p);
      const nk = normalizeTeacherKey(p.name);
      if (nk) profileByNameKey.set(nk, p);
    }

    return registeredTeamUsers.map(user => {
      const saved =
        profileByUserId.get(user.id) || profileByNameKey.get(normalizeTeacherKey(user.name));
      const areas =
        saved?.areas && saved.areas.length > 0
          ? saved.areas
          : saved?.area && normalizeText(saved.area) !== 'OUTROS'
          ? [saved.area]
          : [];
      const multiplicaSlots = getTeacherMultiplicaSlots(saved, effectivePeriods);
      return {
        userId: user.id,
        name: user.name,
        role: user.role === 'gestao_paac' ? 'gestao_paac' : 'professor',
        roleLabel: user.role === 'gestao_paac' ? 'PAAC' : 'Professor',
        areas,
        disciplines: Array.isArray(saved?.disciplines) ? saved!.disciplines : [],
        multiplicaSlots,
        dailyLimit: saved?.dailyLimit || 7,
      };
    });
  }, [registeredTeamUsers, workspace.teachers, effectivePeriods]);

  const [drafts, setDrafts] = useState<TeamMemberDraft[]>(initialDrafts);

  useEffect(() => {
    setDrafts(initialDrafts);
    setIsDirty(false);
  }, [initialDrafts]);

  const filteredDrafts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return drafts.filter(member => {
      if (roleFilter !== 'todos' && member.role !== roleFilter) return false;
      if (q) {
        const hay = `${member.name} ${member.roleLabel} ${member.areas.join(' ')} ${member.disciplines.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [drafts, roleFilter, searchQuery]);

  const updateMember = (userId: string, updater: (m: TeamMemberDraft) => TeamMemberDraft) => {
    setDrafts(prev => prev.map(m => (m.userId === userId ? updater(m) : m)));
    setIsDirty(true);
  };

  const handleToggleArea = (userId: string, areaCode: string) => {
    if (!canEdit) return;
    updateMember(userId, member => {
      const exists = member.areas.includes(areaCode);
      const nextAreas = exists
        ? member.areas.filter(a => a !== areaCode)
        : [...member.areas, areaCode];
      return { ...member, areas: nextAreas };
    });
  };

  const handleToggleDiscipline = (userId: string, discipline: string) => {
    if (!canEdit) return;
    const dNorm = normalizeText(discipline);
    updateMember(userId, member => {
      const exists = member.disciplines.some(d => normalizeText(d) === dNorm);
      const nextDiscs = exists
        ? member.disciplines.filter(d => normalizeText(d) !== dNorm)
        : [...member.disciplines, discipline];
      return { ...member, disciplines: nextDiscs };
    });
  };

  const handleAddMultiplicaSlot = (userId: string) => {
    if (!canEdit) return;
    updateMember(userId, member => ({
      ...member,
      multiplicaSlots: [
        ...member.multiplicaSlots,
        {
          id: `mult-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          dayOfWeek: 3, // Quarta-feira padrão
          startTime: '13:00',
          endTime: '14:30',
        },
      ],
    }));
  };

  const handleUpdateMultiplicaSlot = (
    userId: string,
    slotId: string,
    patch: Partial<MultiplicaSlot>
  ) => {
    if (!canEdit) return;
    updateMember(userId, member => ({
      ...member,
      multiplicaSlots: member.multiplicaSlots.map(s =>
        s.id === slotId ? { ...s, ...patch } : s
      ),
    }));
  };

  const handleRemoveMultiplicaSlot = (userId: string, slotId: string) => {
    if (!canEdit) return;
    updateMember(userId, member => ({
      ...member,
      multiplicaSlots: member.multiplicaSlots.filter(s => s.id !== slotId),
    }));
  };

  const handleSaveTeam = () => {
    if (!canEdit) return;

    // Preserva quaisquer perfis extras existentes na grade atual que não sejam deste filtro, atualizando os da equipe
    const nextProfiles: TimetableTeacherProfile[] = drafts.map(member => {
      const firstSlot = member.multiplicaSlots[0];
      const assimilatedNumbers: number[] = Array.from(
        new Set<number>(
          member.multiplicaSlots.flatMap(slot =>
            resolveMultiplicaPeriodsFromClock(slot.startTime, slot.endTime, effectivePeriods).map(
              p => p.number
            )
          )
        )
      ).sort((a, b) => a - b);

      return {
        id: member.userId,
        userId: member.userId,
        name: member.name,
        role: member.role,
        area: member.areas[0] || 'OUTROS',
        areas: member.areas,
        disciplines: member.disciplines,
        multiplicaDay: firstSlot?.dayOfWeek,
        multiplicaStartTime: firstSlot?.startTime,
        multiplicaEndTime: firstSlot?.endTime,
        multiplicaPeriods: assimilatedNumbers,
        multiplicaSlots: member.multiplicaSlots,
        dailyLimit: member.dailyLimit || 7,
      };
    });

    const nextWsBase: TimetableWorkspace = {
      ...workspace,
      teachers: nextProfiles,
      periods: effectivePeriods,
    };
    const syncedMatrix = syncGradeCurriculumToMatrix(nextWsBase, classes);

    setIsDirty(false);
    onUpdateWorkspace(
      {
        ...nextWsBase,
        matrix: syncedMatrix,
      },
      `Equipe salva (${nextProfiles.length} docente(s)/PAAC). Disciplinas, áreas e Horários Multiplica atualizados no motor de distribuição!`,
      'Atualizar Equipe e Horários Multiplica'
    );
  };

  const handleAddAtpcaRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const nums = newAtpcaPeriods
      .split(/[,;\s]+/)
      .map(n => parseInt(n.trim(), 10))
      .filter(n => !Number.isNaN(n) && n > 0);
    if (nums.length === 0) return;

    const rule: AtpcaBlockRule = {
      id: `atpca-${Date.now()}`,
      area: newAtpcaArea,
      dayOfWeek: newAtpcaDay,
      periodNumbers: nums,
      label: newAtpcaLabel.trim() || `ATPCA ${newAtpcaArea}`,
    };
    setNewAtpcaLabel('');
    onUpdateWorkspace(
      { ...workspace, atpcaRules: [...workspace.atpcaRules, rule] },
      `Bloqueio ${rule.label} adicionado.`,
      `Adicionar ${rule.label}`
    );
  };

  const handleDeleteAtpcaRule = (id: string) => {
    if (!canEdit) return;
    onUpdateWorkspace(
      { ...workspace, atpcaRules: workspace.atpcaRules.filter(r => r.id !== id) },
      'Bloqueio ATPCA removido.',
      'Remover bloqueio ATPCA'
    );
  };

  return (
    <div className="space-y-5">
      {/* Barra Superior da Aba Equipe */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>Equipe — Professores e PAAC</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Exibe somente os usuários cadastrados na escola com perfil <strong>Professor</strong> ou{' '}
              <strong>PAAC</strong>. Selecione as disciplinas que cada pessoa pode lecionar, sua área de
              conhecimento e informe os <strong>Horários Multiplica</strong> pelo relógio — o sistema
              assimila automaticamente quais aulas da escola coincidem com o horário informado.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSubView('equipe')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  subView === 'equipe'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Equipe ({drafts.length})
              </button>
              <button
                type="button"
                onClick={() => setSubView('atpca')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  subView === 'atpca'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ATPCA por Área ({workspace.atpcaRules.length})
              </button>
            </div>

            {canEdit && subView === 'equipe' && (
              <button
                type="button"
                onClick={handleSaveTeam}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                  isDirty
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{isDirty ? 'Salvar Alterações' : 'Salvar Equipe'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filtros da Equipe */}
        {subView === 'equipe' && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, disciplina ou área..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
              {(
                [
                  { id: 'todos', label: `Todos (${drafts.length})` },
                  {
                    id: 'professor',
                    label: `Professores (${drafts.filter(d => d.role === 'professor').length})`,
                  },
                  {
                    id: 'gestao_paac',
                    label: `PAAC (${drafts.filter(d => d.role === 'gestao_paac').length})`,
                  },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRoleFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                    roleFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SUB-ABA 1: EQUIPE (PROFESSORES & PAAC) */}
      {subView === 'equipe' && (
        <>
          {catalogDisciplines.length === 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Nenhuma disciplina cadastrada ainda na <strong>Matriz Curricular</strong>. Cadastre as
                  disciplinas primeiro para selecioná-las para cada Professor/PAAC.
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenMatrixTab}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Abrir Matriz Curricular
              </button>
            </div>
          )}

          {filteredDrafts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-500">
              Nenhum usuário encontrado com perfil Professor ou PAAC neste filtro.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-200 overflow-hidden">
              {filteredDrafts.map(member => (
                <div key={member.userId} className="p-5 space-y-4">
                  {/* Linha 1: Identificação + Área de Conhecimento */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900">{member.name}</h4>
                        <span className="text-xs text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs font-semibold text-indigo-700">
                          {member.roleLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {member.disciplines.length > 0
                          ? `${member.disciplines.length} disciplina(s) selecionada(s)`
                          : 'Nenhuma disciplina selecionada'}
                        {' · '}
                        {member.multiplicaSlots.length > 0
                          ? `${member.multiplicaSlots.length} horário(s) Multiplica`
                          : 'Sem horário Multiplica'}
                      </p>
                    </div>

                    {/* Seletor de Área de Conhecimento */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-600 block">
                        Área de Conhecimento:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_AREA_OPTIONS.map(areaOpt => {
                          const active = member.areas.includes(areaOpt.code);
                          return (
                            <button
                              key={areaOpt.code}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => handleToggleArea(member.userId, areaOpt.code)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:cursor-default whitespace-nowrap ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-700'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                              title={areaOpt.label}
                            >
                              {areaOpt.code}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Linha 2: Disciplinas que pode lecionar */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">
                      Disciplinas que pode lecionar:
                    </span>
                    {catalogDisciplines.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Cadastre disciplinas na aba Matriz Curricular para selecioná-las aqui.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {catalogDisciplines.map(disc => {
                          const checked = member.disciplines.some(
                            d => normalizeText(d) === normalizeText(disc)
                          );
                          return (
                            <label
                              key={disc}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                                canEdit ? 'cursor-pointer' : 'cursor-default'
                              } ${
                                checked
                                  ? 'bg-teal-50 border-teal-400 text-teal-950 font-semibold'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={!canEdit}
                                checked={checked}
                                onChange={() => handleToggleDiscipline(member.userId, disc)}
                                className="rounded text-teal-600 shrink-0"
                              />
                              <span className="truncate">{disc}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Linha 3: Horários Multiplica (por Relógio, com assimilação automática às aulas da escola) */}
                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Horários Multiplica</span>
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleAddMultiplicaSlot(member.userId)}
                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar Dia/Horário</span>
                        </button>
                      )}
                    </div>

                    {member.multiplicaSlots.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Nenhum horário Multiplica informado. O próprio professor também pode cadastrar ou
                        alterar no seu perfil.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {member.multiplicaSlots.map(slot => {
                          const matchedPeriods = resolveMultiplicaPeriodsFromClock(
                            slot.startTime,
                            slot.endTime,
                            effectivePeriods
                          );
                          return (
                            <div
                              key={slot.id}
                              className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  disabled={!canEdit}
                                  value={slot.dayOfWeek}
                                  onChange={e =>
                                    handleUpdateMultiplicaSlot(member.userId, slot.id, {
                                      dayOfWeek: Number(e.target.value),
                                    })
                                  }
                                  className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                                >
                                  {WEEKDAYS.map(wd => (
                                    <option key={wd.id} value={wd.id}>
                                      {wd.label}
                                    </option>
                                  ))}
                                </select>

                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-slate-500">Das</span>
                                  <input
                                    type="time"
                                    disabled={!canEdit}
                                    value={slot.startTime}
                                    onChange={e =>
                                      handleUpdateMultiplicaSlot(member.userId, slot.id, {
                                        startTime: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                                  />
                                  <span className="text-slate-500">às</span>
                                  <input
                                    type="time"
                                    disabled={!canEdit}
                                    value={slot.endTime}
                                    onChange={e =>
                                      handleUpdateMultiplicaSlot(member.userId, slot.id, {
                                        endTime: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between md:justify-end gap-2 flex-1">
                                <div className="text-[11px] tabular-nums">
                                  {matchedPeriods.length > 0 ? (
                                    <span className="text-emerald-800 font-semibold flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>
                                        Aulas assimiladas:{' '}
                                        <strong>
                                          {matchedPeriods
                                            .map(p => `${p.label} (${p.start}–${p.end})`)
                                            .join(', ')}
                                        </strong>
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 font-semibold flex items-center gap-1">
                                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                      <span>Fora do horário das aulas cadastradas da escola</span>
                                    </span>
                                  )}
                                </div>

                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveMultiplicaSlot(member.userId, slot.id)
                                    }
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                    title="Remover horário Multiplica"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* SUB-ABA 2: BLOQUEIOS ATPCA POR ÁREA */}
      {subView === 'atpca' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {canEdit && (
            <form
              onSubmit={handleAddAtpcaRule}
              className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 h-fit"
            >
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-rose-600" />
                <span>Novo Bloqueio ATPCA por Área</span>
              </h4>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Área de Conhecimento
                </label>
                <select
                  value={newAtpcaArea}
                  onChange={e => setNewAtpcaArea(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50"
                >
                  {DEFAULT_AREA_OPTIONS.map(a => (
                    <option key={a.code} value={a.code}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Dia da Semana
                </label>
                <select
                  value={newAtpcaDay}
                  onChange={e => setNewAtpcaDay(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50"
                >
                  {WEEKDAYS.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Aulas Bloqueadas (números separados por vírgula)
                </label>
                <input
                  type="text"
                  required
                  value={newAtpcaPeriods}
                  onChange={e => setNewAtpcaPeriods(e.target.value)}
                  placeholder="Ex: 1, 2"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Rótulo (Opcional)
                </label>
                <input
                  type="text"
                  value={newAtpcaLabel}
                  onChange={e => setNewAtpcaLabel(e.target.value)}
                  placeholder="Ex: ATPCA Linguagens"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Adicionar Bloqueio ATPCA
              </button>
            </form>
          )}

          <div
            className={`${
              canEdit ? 'lg:col-span-2' : 'lg:col-span-3'
            } bg-white rounded-2xl border border-slate-200 overflow-hidden`}
          >
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
              <h4 className="text-xs font-black text-slate-800 uppercase">
                Regras de Bloqueio ATPCA Ativas ({workspace.atpcaRules.length})
              </h4>
            </div>
            {workspace.atpcaRules.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                Nenhum bloqueio de ATPCA cadastrado.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {workspace.atpcaRules.map(rule => (
                  <div
                    key={rule.id}
                    className="p-4 flex items-center justify-between gap-2 hover:bg-slate-50 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-rose-700">{rule.area}</span>
                      <span className="text-slate-300">·</span>
                      <strong className="text-slate-900">
                        {WEEKDAYS.find(w => w.id === rule.dayOfWeek)?.label}
                      </strong>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-600 tabular-nums">
                        Aulas: <strong>{rule.periodNumbers.map(n => `${n}ª`).join(', ')}</strong>
                      </span>
                      {rule.label && <span className="text-slate-400">({rule.label})</span>}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAtpcaRule(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
