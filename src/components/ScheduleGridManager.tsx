import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  MonitorSmartphone,
  Filter,
  Save,
  X,
  BookOpen,
  Users
} from 'lucide-react';
import { SchoolClass, TeacherScheduleSlot, UserAccount, UserSession } from '../types';
import { storageService } from '../data/storageService';
import { firestoreService } from '../lib/firestoreService';
import { DEFAULT_SCHOOL_PERIODS, getSchoolSchedulePeriods } from '../utils/scheduleUtils';

interface ScheduleGridManagerProps {
  classes: SchoolClass[];
  currentUser: UserSession;
  canEdit?: boolean;
  onSaved?: (slots: TeacherScheduleSlot[]) => void;
}

const WEEK_DAYS = [
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado Letivo', short: 'Sáb' },
];

const SUGGESTED_PLATFORMS = [
  'Tarefa SP',
  'Khan Academy',
  'Matific',
  'Alura',
  'Leia SP',
  'Redação Paulista',
  'EF Education / Speak',
  'Elefante Letrado',
  'Plataformas SEDUC (Geral)',
];

const SUGGESTED_SUBJECTS = [
  'Língua Portuguesa',
  'Matemática',
  'Ciências',
  'História',
  'Geografia',
  'Língua Inglesa',
  'Arte',
  'Educação Física',
  'Projeto de Vida',
  'Tecnologia e Inovação',
  'Redação e Leitura',
  'Orientação de Estudos',
  'Física',
  'Química',
  'Biologia',
  'Sociologia',
  'Filosofia',
];

export const ScheduleGridManager: React.FC<ScheduleGridManagerProps> = ({
  classes,
  currentUser,
  canEdit = true,
  onSaved,
}) => {
  const schoolId = storageService.getActiveSchoolId();

  const [slots, setSlots] = useState<TeacherScheduleSlot[]>(() =>
    storageService.getTeacherSchedules(schoolId)
  );
  const [users, setUsers] = useState<UserAccount[]>(() => storageService.getUsers(schoolId));
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [filterClassId, setFilterClassId] = useState<string>('todas');
  const [filterDay, setFilterDay] = useState<string>('todos');
  const [filterTeacher, setFilterTeacher] = useState<string>('todos');
  const [onlyPlatforms, setOnlyPlatforms] = useState<boolean>(false);

  // Form / Editing state
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [formClassId, setFormClassId] = useState<string>(classes[0]?.id || '');
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(1);
  const [formPeriodId, setFormPeriodId] = useState<string>('');
  const [formTeacherName, setFormTeacherName] = useState<string>('');
  const [customTeacherMode, setCustomTeacherMode] = useState<boolean>(false);
  const [formSubject, setFormSubject] = useState<string>('');
  const [formHasPlatform, setFormHasPlatform] = useState<boolean>(false);
  const [formPlatformName, setFormPlatformName] = useState<string>('Tarefa SP');

  const schoolPeriods = useMemo(() => {
    const periods = getSchoolSchedulePeriods();
    const aulas = periods.filter(p => p.tipo === 'aula');
    return aulas.length > 0 ? aulas : DEFAULT_SCHOOL_PERIODS.filter(p => p.tipo === 'aula');
  }, []);

  useEffect(() => {
    if (!formPeriodId && schoolPeriods.length > 0) {
      setFormPeriodId(schoolPeriods[0].id);
    }
  }, [schoolPeriods, formPeriodId]);

  useEffect(() => {
    if (!formClassId && classes.length > 0) {
      setFormClassId(classes[0].id);
    }
  }, [classes, formClassId]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    const sId = storageService.getActiveSchoolId();
    setSlots(storageService.getTeacherSchedules(sId));
    setUsers(storageService.getUsers(sId));

    firestoreService
      .getTeacherSchedules(sId)
      .then(cloud => {
        if (Array.isArray(cloud) && cloud.length > 0) {
          storageService.setTeacherSchedules(cloud, sId);
          setSlots(cloud);
        }
      })
      .catch(() => {});

    firestoreService
      .getUsers(sId)
      .then(cloudUsers => {
        if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
          storageService.setUsers(cloudUsers);
          setUsers(storageService.getUsers(sId));
        }
      })
      .catch(() => {});
  }, [schoolId]);

  const teacherOptions = useMemo(() => {
    const set = new Set<string>();
    users
      .filter(u => u.active !== false && (u.role === 'professor' || u.role === 'gestao_paac' || u.role === 'admin' || u.role === 'admin_escola'))
      .forEach(u => set.add(u.name.trim()));
    slots.forEach(s => {
      if (s.teacherName) set.add(s.teacherName.trim());
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [users, slots]);

  const persistSlots = (nextSlots: TeacherScheduleSlot[], feedbackMsg?: string) => {
    setIsSyncing(true);
    try {
      const saved = storageService.saveTeacherSchedules(nextSlots, schoolId);
      setSlots(saved);
      if (onSaved) onSaved(saved);
      if (feedbackMsg) showFeedback(feedbackMsg, 'success');
    } catch (err: any) {
      showFeedback('Erro ao salvar grade horária: ' + (err?.message || 'Erro desconhecido'), 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const resetForm = () => {
    setEditingSlotId(null);
    setFormTeacherName('');
    setCustomTeacherMode(false);
    setFormSubject('');
    setFormHasPlatform(false);
    setFormPlatformName('Tarefa SP');
  };

  const handleEditSlot = (slot: TeacherScheduleSlot) => {
    setEditingSlotId(slot.id);
    setFormClassId(slot.classId || classes.find(c => c.name === slot.className)?.id || classes[0]?.id || '');
    setFormDayOfWeek(slot.dayOfWeek || 1);
    const matchedPeriod = schoolPeriods.find(
      p => p.id === slot.periodId || p.nome.toLowerCase() === (slot.periodName || '').toLowerCase()
    );
    setFormPeriodId(matchedPeriod?.id || slot.periodId || schoolPeriods[0]?.id || '');
    setFormTeacherName(slot.teacherName || '');
    setCustomTeacherMode(Boolean(slot.teacherName && !teacherOptions.includes(slot.teacherName)));
    setFormSubject(slot.subject || '');
    setFormHasPlatform(Boolean(slot.hasPlatform));
    setFormPlatformName(slot.platformName || 'Tarefa SP');
  };

  const handleSubmitSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const selectedClass = classes.find(c => c.id === formClassId);
    const selectedPeriod = schoolPeriods.find(p => p.id === formPeriodId);
    const cleanTeacher = formTeacherName.trim();

    if (!selectedClass) {
      showFeedback('Selecione a turma da aula.', 'error');
      return;
    }
    if (!selectedPeriod) {
      showFeedback('Selecione a aula / horário na grade.', 'error');
      return;
    }
    if (!cleanTeacher) {
      showFeedback('Informe ou selecione o(a) professor(a) responsável pela aula.', 'error');
      return;
    }

    const matchedUser = users.find(u => u.name.trim().toLowerCase() === cleanTeacher.toLowerCase());

    const payload: TeacherScheduleSlot = {
      id: editingSlotId || `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId,
      teacherId: matchedUser?.id,
      teacherName: cleanTeacher,
      classId: selectedClass.id,
      className: selectedClass.name,
      dayOfWeek: Number(formDayOfWeek),
      periodId: selectedPeriod.id,
      periodName: selectedPeriod.nome,
      subject: formSubject.trim() || undefined,
      hasPlatform: formHasPlatform,
      platformName: formHasPlatform ? (formPlatformName.trim() || 'Plataforma Digital') : undefined,
    };

    let nextSlots: TeacherScheduleSlot[];
    if (editingSlotId) {
      nextSlots = slots.map(s => (s.id === editingSlotId ? payload : s));
      persistSlots(nextSlots, 'Aula atualizada na Grade Horária e sincronizada com o sistema.');
    } else {
      // Substitui se já existir mesma turma + dia + período para evitar duplicidade
      const existingIdx = slots.findIndex(
        s =>
          s.classId === payload.classId &&
          s.dayOfWeek === payload.dayOfWeek &&
          (s.periodId === payload.periodId || s.periodName.toLowerCase() === payload.periodName.toLowerCase())
      );
      if (existingIdx >= 0) {
        nextSlots = slots.map((s, idx) => (idx === existingIdx ? { ...payload, id: s.id } : s));
        persistSlots(nextSlots, `Horário atualizado para ${selectedClass.name} (${selectedPeriod.nome}).`);
      } else {
        nextSlots = [...slots, payload];
        persistSlots(nextSlots, `Aula adicionada à Grade Horária (${selectedClass.name} • ${selectedPeriod.nome}).`);
      }
    }

    resetForm();
  };

  const handleDeleteSlot = (slotId: string) => {
    if (!canEdit) return;
    const nextSlots = slots.filter(s => s.id !== slotId);
    persistSlots(nextSlots, 'Horário removido da Grade Horária.');
    if (editingSlotId === slotId) resetForm();
  };

  const handleQuickTogglePlatform = (slot: TeacherScheduleSlot) => {
    if (!canEdit) return;
    const nextHas = !slot.hasPlatform;
    const nextSlots = slots.map(s =>
      s.id === slot.id
        ? {
            ...s,
            hasPlatform: nextHas,
            platformName: nextHas ? (s.platformName || 'Tarefa SP') : undefined,
          }
        : s
    );
    persistSlots(
      nextSlots,
      nextHas
        ? `Trava de Plataforma ativada em ${slot.className || slot.classId} (${slot.periodName}).`
        : `Trava de Plataforma removida de ${slot.className || slot.classId} (${slot.periodName}).`
    );
  };

  const filteredSlots = useMemo(() => {
    return slots
      .filter(s => {
        if (filterClassId !== 'todas' && s.classId !== filterClassId && s.className !== filterClassId) return false;
        if (filterDay !== 'todos' && String(s.dayOfWeek) !== filterDay) return false;
        if (filterTeacher !== 'todos' && (s.teacherName || '').trim() !== filterTeacher) return false;
        if (onlyPlatforms && !s.hasPlatform) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        const pA = schoolPeriods.findIndex(p => p.id === a.periodId || p.nome === a.periodName);
        const pB = schoolPeriods.findIndex(p => p.id === b.periodId || p.nome === b.periodName);
        if (pA !== pB) return pA - pB;
        return (a.className || a.classId).localeCompare(b.className || b.classId, 'pt-BR');
      });
  }, [slots, filterClassId, filterDay, filterTeacher, onlyPlatforms, schoolPeriods]);

  const platformCount = useMemo(() => slots.filter(s => s.hasPlatform).length, [slots]);
  const distinctTeachers = useMemo(() => new Set(slots.map(s => s.teacherName).filter(Boolean)).size, [slots]);

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} className="cursor-pointer font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Cabeçalho e KPIs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Grade Horária das Aulas & Trava de Plataformas Digitais
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Vincule professor, turma, dia da semana e disciplina. As aulas marcadas com <strong>Plataforma Digital</strong> acionam trava automática no módulo de <strong>Agendamento de Equipamentos</strong> e filtram o <strong>Diário do Professor</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
              {slots.length} Aulas na Grade
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>{platformCount} c/ Trava de Plataforma</span>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-800 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>{distinctTeachers} Docentes</span>
            </span>
          </div>
        </div>

        {/* Formulário de Cadastro / Edição */}
        {canEdit && (
          <form onSubmit={handleSubmitSlot} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                {editingSlotId ? <Edit2 className="w-3.5 h-3.5 text-indigo-600" /> : <Plus className="w-3.5 h-3.5 text-indigo-600" />}
                <span>{editingSlotId ? 'Editar Horário Selecionado' : 'Cadastrar Aula na Grade Horária'}</span>
              </h3>
              {editingSlotId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancelar Edição</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Turma *</label>
                <select
                  value={formClassId}
                  onChange={e => setFormClassId(e.target.value)}
                  required
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
                >
                  <option value="">Selecione a turma...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Dia da Semana *</label>
                <select
                  value={formDayOfWeek}
                  onChange={e => setFormDayOfWeek(Number(e.target.value))}
                  required
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
                >
                  {WEEK_DAYS.map(d => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Aula / Horário *</label>
                <select
                  value={formPeriodId}
                  onChange={e => setFormPeriodId(e.target.value)}
                  required
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
                >
                  {schoolPeriods.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.inicio} - {p.fim})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600">Professor(a) *</label>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTeacherMode(!customTeacherMode);
                      setFormTeacherName('');
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    {customTeacherMode ? 'Lista' : 'Digitar'}
                  </button>
                </div>
                {!customTeacherMode ? (
                  <select
                    value={formTeacherName}
                    onChange={e => setFormTeacherName(e.target.value)}
                    required
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
                  >
                    <option value="">Selecione o docente...</option>
                    {teacherOptions.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={formTeacherName}
                    onChange={e => setFormTeacherName(e.target.value)}
                    placeholder="Nome do(a) professor(a)..."
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
                  />
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Disciplina</label>
                <input
                  type="text"
                  list="schedule-subjects-list"
                  value={formSubject}
                  onChange={e => setFormSubject(e.target.value)}
                  placeholder="Ex: Matemática, Português..."
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-800"
                />
                <datalist id="schedule-subjects-list">
                  {SUGGESTED_SUBJECTS.map(subj => (
                    <option key={subj} value={subj} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formHasPlatform}
                    onChange={e => setFormHasPlatform(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span className="text-xs font-bold text-amber-950">
                    Aula contém Plataforma Digital (Acionar trava nos Equipamentos)
                  </span>
                </label>

                {formHasPlatform && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-600">Plataforma:</span>
                    <input
                      type="text"
                      list="schedule-platforms-list"
                      value={formPlatformName}
                      onChange={e => setFormPlatformName(e.target.value)}
                      placeholder="Ex: Tarefa SP, Alura, Khan..."
                      className="text-xs px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white font-semibold text-slate-800 w-52"
                    />
                    <datalist id="schedule-platforms-list">
                      {SUGGESTED_PLATFORMS.map(plat => (
                        <option key={plat} value={plat} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSyncing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{editingSlotId ? 'Atualizar Horário' : 'Salvar na Grade'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Filtros e Listagem */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span>Filtros:</span>
            </div>

            <select
              value={filterClassId}
              onChange={e => setFilterClassId(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700"
            >
              <option value="todas">Todas as Turmas</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={filterDay}
              onChange={e => setFilterDay(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700"
            >
              <option value="todos">Todos os Dias</option>
              {WEEK_DAYS.map(d => (
                <option key={d.value} value={String(d.value)}>
                  {d.label}
                </option>
              ))}
            </select>

            <select
              value={filterTeacher}
              onChange={e => setFilterTeacher(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700"
            >
              <option value="todos">Todos os Professores</option>
              {teacherOptions.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/70 text-xs font-bold text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyPlatforms}
                onChange={e => setOnlyPlatforms(e.target.checked)}
                className="rounded border-amber-400 text-amber-600"
              />
              <span>Somente c/ Plataforma</span>
            </label>
          </div>

          <span className="text-[11px] font-bold text-slate-500">
            Exibindo {filteredSlots.length} de {slots.length} aulas cadastradas
          </span>
        </div>

        {filteredSlots.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">
              Nenhuma aula cadastrada para os filtros atuais
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Cadastre acima os horários das aulas por turma, dia da semana e docente, marcando as aulas que utilizam plataformas digitais (Tarefa SP, Alura, Khan, Matific etc.).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-3 px-4">Dia</th>
                  <th className="py-3 px-3">Aula / Horário</th>
                  <th className="py-3 px-3">Turma</th>
                  <th className="py-3 px-3">Professor(a)</th>
                  <th className="py-3 px-3">Disciplina</th>
                  <th className="py-3 px-3">Plataforma Digital / Trava</th>
                  {canEdit && <th className="py-3 px-4 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSlots.map(slot => {
                  const dayLabel = WEEK_DAYS.find(d => d.value === slot.dayOfWeek)?.label || `Dia ${slot.dayOfWeek}`;
                  const periodInfo = schoolPeriods.find(
                    p => p.id === slot.periodId || p.nome.toLowerCase() === (slot.periodName || '').toLowerCase()
                  );
                  return (
                    <tr key={slot.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-slate-800 whitespace-nowrap">{dayLabel}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-indigo-900">{slot.periodName}</span>
                        {periodInfo && (
                          <span className="text-[10px] text-slate-500 ml-1.5 font-mono">
                            ({periodInfo.inicio}-{periodInfo.fim})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[11px]">
                          {slot.className || slot.classId}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{slot.teacherName}</td>
                      <td className="py-2.5 px-3 text-slate-600">{slot.subject || '—'}</td>
                      <td className="py-2.5 px-3">
                        {slot.hasPlatform ? (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => handleQuickTogglePlatform(slot)}
                            title={canEdit ? 'Clique para remover trava de plataforma desta aula' : ''}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] cursor-pointer hover:bg-amber-200 transition-colors disabled:cursor-default"
                          >
                            <Lock className="w-3 h-3 text-amber-700" />
                            <span>Trava Ativa: {slot.platformName || 'Plataforma Digital'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => handleQuickTogglePlatform(slot)}
                            title={canEdit ? 'Clique para marcar esta aula com Plataforma Digital' : ''}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-semibold text-[10px] cursor-pointer hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200 transition-colors disabled:cursor-default"
                          >
                            <MonitorSmartphone className="w-3 h-3" />
                            <span>Sem plataforma</span>
                          </button>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditSlot(slot)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              title="Editar horário"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Remover da grade"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
    </div>
  );
};
