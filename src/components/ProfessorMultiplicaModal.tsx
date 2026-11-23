import React, { useMemo, useState } from 'react';
import { Clock, Plus, Trash2, Save, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { MultiplicaSlot, TimetableTeacherProfile, UserSession } from '../types';
import { storageService } from '../data/storageService';
import {
  WEEKDAYS,
  formatMultiplicaSummary,
  getEffectiveSchoolPeriods,
  getTeacherMultiplicaSlots,
  normalizeTeacherKey,
  resolveMultiplicaPeriodsFromClock,
} from '../utils/timetableEngine';

interface ProfessorMultiplicaModalProps {
  currentUser: UserSession;
  onClose: () => void;
  onSaved?: (summary: string) => void;
}

export const ProfessorMultiplicaModal: React.FC<ProfessorMultiplicaModalProps> = ({
  currentUser,
  onClose,
  onSaved,
}) => {
  const schoolId = currentUser.schoolId || storageService.getActiveSchoolId();
  const workspace = useMemo(() => storageService.getTimetableWorkspace(schoolId), [schoolId]);
  const effectivePeriods = useMemo(() => getEffectiveSchoolPeriods(workspace), [workspace]);

  const existingProfile = useMemo(() => {
    const uKey = normalizeTeacherKey(currentUser.name);
    return (workspace.teachers || []).find(
      t =>
        (currentUser.id && (t.userId === currentUser.id || t.id === currentUser.id)) ||
        normalizeTeacherKey(t.name) === uKey
    );
  }, [workspace.teachers, currentUser.id, currentUser.name]);

  const [slots, setSlots] = useState<MultiplicaSlot[]>(() => {
    const initial = getTeacherMultiplicaSlots(existingProfile, effectivePeriods);
    return initial.length > 0
      ? initial
      : [
          {
            id: `mult-${Date.now()}`,
            dayOfWeek: 3,
            startTime: '13:00',
            endTime: '14:30',
          },
        ];
  });
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleAddSlot = () => {
    setSlots(prev => [
      ...prev,
      {
        id: `mult-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        dayOfWeek: 2,
        startTime: '13:00',
        endTime: '14:30',
      },
    ]);
  };

  const handleUpdateSlot = (id: string, patch: Partial<MultiplicaSlot>) => {
    setSlots(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleRemoveSlot = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const validSlots = slots.filter(
      s => s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && Boolean(s.startTime) && Boolean(s.endTime)
    );
    const firstSlot = validSlots[0];
    const assimilatedNumbers: number[] = Array.from(
      new Set<number>(
        validSlots.flatMap(slot =>
          resolveMultiplicaPeriodsFromClock(slot.startTime, slot.endTime, effectivePeriods).map(
            p => p.number
          )
        )
      )
    ).sort((a, b) => a - b);

    const uKey = normalizeTeacherKey(currentUser.name);
    const nextTeachers: TimetableTeacherProfile[] = [...(workspace.teachers || [])];
    const idx = nextTeachers.findIndex(
      t =>
        (currentUser.id && (t.userId === currentUser.id || t.id === currentUser.id)) ||
        normalizeTeacherKey(t.name) === uKey
    );

    const updatedProfile: TimetableTeacherProfile =
      idx >= 0
        ? {
            ...nextTeachers[idx],
            multiplicaDay: firstSlot?.dayOfWeek,
            multiplicaStartTime: firstSlot?.startTime,
            multiplicaEndTime: firstSlot?.endTime,
            multiplicaPeriods: assimilatedNumbers,
            multiplicaSlots: validSlots,
          }
        : {
            id: currentUser.id || `prof-${Date.now()}`,
            userId: currentUser.id,
            name: currentUser.name,
            role: currentUser.role,
            area: 'OUTROS',
            areas: [],
            disciplines: [],
            multiplicaDay: firstSlot?.dayOfWeek,
            multiplicaStartTime: firstSlot?.startTime,
            multiplicaEndTime: firstSlot?.endTime,
            multiplicaPeriods: assimilatedNumbers,
            multiplicaSlots: validSlots,
            dailyLimit: 7,
          };

    if (idx >= 0) {
      nextTeachers[idx] = updatedProfile;
    } else {
      nextTeachers.push(updatedProfile);
    }

    storageService.saveTimetableWorkspace(
      {
        ...workspace,
        teachers: nextTeachers,
        periods: effectivePeriods,
        updatedBy: currentUser.name,
      },
      false,
      schoolId
    );

    const summary = formatMultiplicaSummary(updatedProfile, effectivePeriods);
    setSavedNotice('Horários Multiplica salvos com sucesso!');
    onSaved?.(summary);
    setTimeout(() => {
      onClose();
    }, 650);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span>Horários Multiplica</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentUser.name} · Informe o dia da semana e o horário (de acordo com o relógio). O
              sistema assimila automaticamente com os horários das aulas da escola.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {slots.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
              Nenhum horário Multiplica cadastrado. Clique em &quot;Adicionar Dia/Horário&quot; abaixo ou
              salve para manter sem horário Multiplica.
            </div>
          ) : (
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {slots.map(slot => {
                const matched = resolveMultiplicaPeriodsFromClock(
                  slot.startTime,
                  slot.endTime,
                  effectivePeriods
                );
                return (
                  <div
                    key={slot.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <select
                        value={slot.dayOfWeek}
                        onChange={e =>
                          handleUpdateSlot(slot.id, { dayOfWeek: Number(e.target.value) })
                        }
                        className="px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
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
                          required
                          value={slot.startTime}
                          onChange={e => handleUpdateSlot(slot.id, { startTime: e.target.value })}
                          className="px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                        />
                        <span className="text-slate-500">às</span>
                        <input
                          type="time"
                          required
                          value={slot.endTime}
                          onChange={e => handleUpdateSlot(slot.id, { endTime: e.target.value })}
                          className="px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                        title="Remover este horário"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-[11px] tabular-nums">
                      {matched.length > 0 ? (
                        <p className="text-emerald-800 font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            Aulas assimiladas na escola:{' '}
                            <strong>
                              {matched.map(p => `${p.label} (${p.start}–${p.end})`).join(', ')}
                            </strong>
                          </span>
                        </p>
                      ) : (
                        <p className="text-amber-700 font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Horário fora das faixas de aula da escola (verifique início e término).
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={handleAddSlot}
            className="w-full py-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-50 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar outro Dia / Horário Multiplica</span>
          </button>

          {savedNotice && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Horários Multiplica</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
