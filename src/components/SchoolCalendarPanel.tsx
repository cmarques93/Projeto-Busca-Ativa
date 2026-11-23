import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Save,
  Trash2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import {
  SchoolBimester,
  SchoolCalendarConfig,
  SchoolCalendarEvent,
  SchoolCalendarEventType,
  UserSession
} from '../types';
import { storageService } from '../data/storageService';
import { firestoreService } from '../lib/firestoreService';
import {
  createDefaultSchoolCalendar,
  getCalendarMetricsSummary
} from '../utils/calendarUtils';
import { getLocalTodayStr } from '../utils/reportCalculator';

interface SchoolCalendarPanelProps {
  currentUser: UserSession;
  canEdit: boolean;
  onSaved?: () => void;
}

export const SchoolCalendarPanel: React.FC<SchoolCalendarPanelProps> = ({
  currentUser,
  canEdit,
  onSaved,
}) => {
  const [calendarConfig, setCalendarConfig] = useState<SchoolCalendarConfig>(() =>
    storageService.getSchoolCalendar()
  );
  const [newCalEventDate, setNewCalEventDate] = useState<string>(
    () => getLocalTodayStr()
  );
  const [newCalEventEndDate, setNewCalEventEndDate] = useState<string>('');
  const [newCalEventTitle, setNewCalEventTitle] = useState<string>('');
  const [newCalEventType, setNewCalEventType] = useState<SchoolCalendarEventType>('feriado');
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const sId = storageService.getActiveSchoolId();
    setCalendarConfig(storageService.getSchoolCalendar(sId));
    firestoreService
      .getSchoolCalendar(sId)
      .then(cloudCal => {
        if (cloudCal && Array.isArray(cloudCal.bimesters)) {
          storageService.setSchoolCalendar(cloudCal, sId);
          setCalendarConfig(cloudCal);
        }
      })
      .catch(() => {});
  }, []);

  const calendarSummary = useMemo(
    () => getCalendarMetricsSummary(calendarConfig),
    [calendarConfig]
  );

  const handleUpdateBimesterDate = (
    bimesterId: SchoolBimester['id'],
    field: 'startDate' | 'endDate',
    value: string
  ) => {
    setCalendarConfig(prev => ({
      ...prev,
      bimesters: prev.bimesters.map(b =>
        b.id === bimesterId ? { ...b, [field]: value } : b
      ),
    }));
  };

  const handleAddCalendarEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCalEventDate || !newCalEventTitle.trim()) {
      showToast('Informe a data e a descrição do evento no calendário.', 'error');
      return;
    }
    const countsAsSchoolDay =
      newCalEventType === 'sabado_letivo' ||
      newCalEventType === 'reposicao' ||
      newCalEventType === 'conselho_classe';
    const newEvt: SchoolCalendarEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: newCalEventDate,
      endDate:
        newCalEventEndDate && newCalEventEndDate >= newCalEventDate
          ? newCalEventEndDate
          : undefined,
      title: newCalEventTitle.trim(),
      type: newCalEventType,
      countsAsSchoolDay,
    };
    setCalendarConfig(prev => ({
      ...prev,
      events: [...(prev.events || []), newEvt].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    }));
    setNewCalEventTitle('');
    setNewCalEventEndDate('');
    showToast(
      'Evento adicionado ao rascunho. Clique em "Salvar Calendário e Recalcular Métricas" para confirmar.'
    );
  };

  const handleRemoveCalendarEvent = (eventId: string) => {
    setCalendarConfig(prev => ({
      ...prev,
      events: (prev.events || []).filter(ev => ev.id !== eventId),
    }));
  };

  const handleSaveCalendar = async () => {
    setIsSavingCalendar(true);
    try {
      const sId = storageService.getActiveSchoolId();
      const saved = storageService.saveSchoolCalendar(
        {
          ...calendarConfig,
          updatedBy: currentUser.name,
        },
        sId
      );
      setCalendarConfig(saved);
      showToast(
        'Calendário Escolar salvo na nuvem e métricas de frequência recalculadas com base nos dias letivos!'
      );
      onSaved?.();
    } catch (err: any) {
      showToast(
        'Erro ao salvar calendário: ' + (err?.message || 'Erro desconhecido'),
        'error'
      );
    } finally {
      setIsSavingCalendar(false);
    }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl text-white text-xs sm:text-sm font-semibold flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
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

      {/* Resumo dos Dias Letivos e Bimestre Atual */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <span>Calendário Escolar Letivo ({calendarConfig.year})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure início e fim dos bimestres, férias, recessos, feriados e sábados letivos. Todas as métricas de frequência da escola consideram este calendário.
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={calendarConfig.year}
                onChange={e => {
                  const y = Number(e.target.value) || 2026;
                  setCalendarConfig(
                    createDefaultSchoolCalendar(y, storageService.getActiveSchoolId())
                  );
                }}
                className="px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50 text-slate-800 cursor-pointer"
                title="Selecionar ano letivo"
              >
                <option value={2025}>Ano Letivo 2025</option>
                <option value={2026}>Ano Letivo 2026</option>
                <option value={2027}>Ano Letivo 2027</option>
                <option value={2028}>Ano Letivo 2028</option>
              </select>

              <button
                type="button"
                onClick={handleSaveCalendar}
                disabled={isSavingCalendar}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSavingCalendar
                    ? 'Salvando...'
                    : 'Salvar Calendário e Recalcular Métricas'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* KPIs do Calendário */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-emerald-800 uppercase">
              Dias Letivos no Ano
            </span>
            <div className="text-2xl font-black text-emerald-950 mt-0.5">
              {calendarSummary.totalPlannedSchoolDays}
            </div>
            <span
              className={`text-[10px] font-bold mt-1 inline-block px-2 py-0.5 rounded-full ${
                calendarSummary.totalPlannedSchoolDays >= 200
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {calendarSummary.totalPlannedSchoolDays >= 200
                ? 'Atende mínimo LDB (200d)'
                : 'Abaixo de 200 dias letivos'}
            </span>
          </div>

          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-indigo-800 uppercase">
              Dias Letivos Transcorridos
            </span>
            <div className="text-2xl font-black text-indigo-950 mt-0.5">
              {calendarSummary.elapsedSchoolDays}
            </div>
            <span className="text-[10px] text-indigo-700 font-medium block mt-1">
              Base ativa para taxa de frequência (%)
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-slate-600 uppercase">
              Bimestre Atual / Hoje
            </span>
            <div className="text-sm font-black text-slate-900 mt-1">
              {calendarSummary.currentBimester?.name || 'Fora de Bimestre'}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Hoje: {calendarSummary.todayStatus.reason}
            </span>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-amber-800 uppercase">
              Feriados / Recessos / Sáb. Letivos
            </span>
            <div className="text-sm font-black text-amber-950 mt-1">
              {calendarSummary.holidaysAndRecessesCount} bloqueios •{' '}
              {calendarSummary.saturdaySchoolDaysCount} sáb. letivos
            </div>
            <span className="text-[10px] text-amber-700 block mt-0.5">
              Eventos cadastrados no calendário
            </span>
          </div>
        </div>

        {/* Configuração dos 4 Bimestres */}
        <div className="pt-2">
          <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
            Início e Fim dos Bimestres
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {calendarConfig.bimesters.map(bim => {
              const bimStat = calendarSummary.bimestersSummary.find(
                b => b.id === bim.id
              );
              return (
                <div
                  key={bim.id}
                  className={`p-3.5 rounded-xl border space-y-2.5 ${
                    bimStat?.isCurrent
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900">
                      {bim.name}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                      {bimStat?.totalSchoolDays || 0} dias letivos
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block">
                        Data de Início
                      </label>
                      <input
                        type="date"
                        disabled={!canEdit}
                        value={bim.startDate}
                        onChange={e =>
                          handleUpdateBimesterDate(bim.id, 'startDate', e.target.value)
                        }
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block">
                        Data de Término
                      </label>
                      <input
                        type="date"
                        disabled={!canEdit}
                        value={bim.endDate}
                        onChange={e =>
                          handleUpdateBimesterDate(bim.id, 'endDate', e.target.value)
                        }
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cadastro e Lista de Feriados, Recessos, Férias e Sábados Letivos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {canEdit && (
          <form
            onSubmit={handleAddCalendarEvent}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5 h-fit"
          >
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>Adicionar Data ao Calendário</span>
            </h4>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                Tipo de Registro
              </label>
              <select
                value={newCalEventType}
                onChange={e =>
                  setNewCalEventType(e.target.value as SchoolCalendarEventType)
                }
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold text-slate-800"
              >
                <option value="feriado">Feriado (Não Letivo)</option>
                <option value="recesso">Recesso Escolar (Não Letivo)</option>
                <option value="ferias">Férias Escolares (Não Letivo)</option>
                <option value="sabado_letivo">
                  Sábado Letivo (Conta como Dia Letivo)
                </option>
                <option value="reposicao">
                  Reposição de Aula (Conta como Dia Letivo)
                </option>
                <option value="conselho_classe">Conselho de Classe</option>
                <option value="reuniao_pedagogica">Reunião Pedagógica</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Data Início *
                </label>
                <input
                  type="date"
                  required
                  value={newCalEventDate}
                  onChange={e => setNewCalEventDate(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Data Fim (Opcional)
                </label>
                <input
                  type="date"
                  value={newCalEventEndDate}
                  min={newCalEventDate}
                  onChange={e => setNewCalEventEndDate(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                Descrição / Nome *
              </label>
              <input
                type="text"
                required
                value={newCalEventTitle}
                onChange={e => setNewCalEventTitle(e.target.value)}
                placeholder="Ex: Feriado Municipal, Férias de Julho, Sábado Letivo..."
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              Adicionar ao Calendário
            </button>
          </form>
        )}

        <div
          className={`${
            canEdit ? 'lg:col-span-2' : 'lg:col-span-3'
          } bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden`}
        >
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Feriados, Recessos, Férias e Dias Especiais ({(calendarConfig.events || []).length})
            </h4>
          </div>
          {(calendarConfig.events || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum feriado, recesso ou sábado letivo cadastrado para este ano.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Data / Período</th>
                    <th className="py-2.5 px-3">Descrição</th>
                    <th className="py-2.5 px-3">Classificação</th>
                    <th className="py-2.5 px-3">Impacto nas Métricas</th>
                    {canEdit && <th className="py-2.5 px-4 text-right">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(calendarConfig.events || []).map(ev => {
                    const fmt = (d: string) => d.split('-').reverse().join('/');
                    const counts =
                      ev.type === 'sabado_letivo' ||
                      ev.type === 'reposicao' ||
                      ev.countsAsSchoolDay === true;
                    const labelMap: Record<SchoolCalendarEventType, string> = {
                      feriado: 'Feriado',
                      recesso: 'Recesso Escolar',
                      ferias: 'Férias Escolares',
                      sabado_letivo: 'Sábado Letivo',
                      reposicao: 'Reposição de Aula',
                      conselho_classe: 'Conselho de Classe',
                      reuniao_pedagogica: 'Reunião Pedagógica',
                    };
                    return (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {fmt(ev.date)}
                          {ev.endDate && ev.endDate !== ev.date
                            ? ` a ${fmt(ev.endDate)}`
                            : ''}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {ev.title}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              counts
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            {labelMap[ev.type] || ev.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600">
                          {counts
                            ? 'Soma como dia letivo'
                            : 'Dia não letivo (descontado)'}
                        </td>
                        {canEdit && (
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveCalendarEvent(ev.id)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                              title="Remover evento do calendário"
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
      </div>
    </div>
  );
};
