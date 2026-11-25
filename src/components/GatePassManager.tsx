import React, { useState, useEffect } from 'react';
import {
  DoorOpen,
  ArrowRightCircle,
  ArrowLeftCircle,
  Clock,
  User,
  Plus,
  Trash2,
  Phone,
  Search,
  CheckCircle2,
  Calendar,
  AlertCircle,
  History,
  BookOpen
} from 'lucide-react';
import { GateRecord, GateMovementType, Student, SchoolClass } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { storageService } from '../data/storageService';
import { firestoreService, isSameDay, normalizeDateStr } from '../lib/firestoreService';
import { formatDateBR, getLocalTodayStr } from '../utils/reportCalculator';
import { getSchoolSchedulePeriods, findPeriodByTime, formatPeriodLabel, SchoolPeriod } from '../utils/scheduleUtils';

interface GatePassManagerProps {
  students: Student[];
  classes: SchoolClass[];
  operatorName: string;
  onOpenStudentDetail?: (studentId: string) => void;
}

export const GatePassManager: React.FC<GatePassManagerProps> = ({
  students,
  classes,
  operatorName,
  onOpenStudentDetail,
}) => {
  const todayStr = getLocalTodayStr();

  const getYesterdayStr = (): string => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getBeforeYesterdayStr = (): string => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDaysAgoStr = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [records, setRecords] = useState<GateRecord[]>([]);
  const [dateFilterPreset, setDateFilterPreset] = useState<'hoje' | 'ontem' | '7dias' | 'todas' | 'personalizada'>('hoje');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  // Form state com Suporte a Registro Retroativo
  const [formClassFilter, setFormClassFilter] = useState<string>('todas');
  const [studentId, setStudentId] = useState<string>('');
  const [type, setType] = useState<GateMovementType>('entrada_tardia');
  const [recordDate, setRecordDate] = useState<string>(todayStr);
  const [time, setTime] = useState<string>(
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const schoolPeriods: SchoolPeriod[] = React.useMemo(() => getSchoolSchedulePeriods(), [isFormOpen]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(() => {
    const initialTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return findPeriodByTime(initialTime, getSchoolSchedulePeriods())?.id || '';
  });
  const [reason, setReason] = useState<string>('');
  const [guardianOrAuthorizedPerson, setGuardianOrAuthorizedPerson] = useState<string>('');
  const [guardianPhone, setGuardianPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recordToDelete, setRecordToDelete] = useState<GateRecord | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedPeriod = React.useMemo<SchoolPeriod | null>(() => {
    const found =
      schoolPeriods.find(p => p.id === selectedPeriodId) ||
      findPeriodByTime(time, schoolPeriods) ||
      schoolPeriods[0] ||
      null;
    return found;
  }, [schoolPeriods, selectedPeriodId, time]);

  const handleTimeChange = (newTime: string) => {
    setTime(newTime);
    const matched = findPeriodByTime(newTime, schoolPeriods);
    if (matched) {
      setSelectedPeriodId(matched.id);
    }
  };

  const isFormRetroactive = recordDate < todayStr;
  const activeSchoolId = storageService.getActiveSchoolId();

  // Helper puro para aplicar os filtros de data e turma sobre uma lista consolidada
  const applyActiveFilters = React.useCallback(
    (
      allList: GateRecord[],
      preset: 'hoje' | 'ontem' | '7dias' | 'todas' | 'personalizada' = dateFilterPreset,
      targetDate: string = selectedDate,
      targetClass: string = selectedClassFilter
    ): GateRecord[] => {
      let filtered = [...allList];

      if (preset === '7dias') {
        const limitDate = getDaysAgoStr(7);
        filtered = filtered.filter(r => {
          const d = normalizeDateStr(r.date) || r.date || '';
          return d >= limitDate;
        });
      } else if (preset !== 'todas' && targetDate && targetDate !== 'todas') {
        filtered = filtered.filter(r => isSameDay(r.date, targetDate));
      }

      if (targetClass && targetClass !== 'todas') {
        const normCls = targetClass.trim().toLowerCase();
        filtered = filtered.filter(
          r =>
            (r.classId || '').trim().toLowerCase() === normCls ||
            (r.className || '').trim().toLowerCase() === normCls
        );
      }

      return filtered.sort((a, b) => {
        const dateA = normalizeDateStr(a.date) || a.date || '';
        const dateB = normalizeDateStr(b.date) || b.date || '';
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return (b.time || '').localeCompare(a.time || '');
      });
    },
    [dateFilterPreset, selectedDate, selectedClassFilter]
  );

  // Carrega da base persistente da escola ativa (cache local imediato + sincronização em nuvem Firestore)
  const fetchRecords = React.useCallback(async () => {
    const sId = storageService.getActiveSchoolId();

    // 1. Leitura instantânea local para resposta sem latência
    const localAll = storageService.getGateRecords(undefined, undefined, sId);
    setRecords(applyActiveFilters(localAll));
    setIsLoading(localAll.length === 0);

    // 2. Sincronização em nuvem (Firestore) como fonte de verdade multi-dispositivo
    try {
      const cloudAll = await firestoreService.getGateRecords(undefined, sId);
      const localLatest = storageService.getGateRecords(undefined, undefined, sId);
      const mergedMap = new Map<string, GateRecord>();

      // Nuvem primeiro, preservando registros locais recém-lançados que ainda não retornaram
      cloudAll.forEach(r => {
        if (r && r.id) mergedMap.set(r.id, r);
      });
      localLatest.forEach(r => {
        if (r && r.id && !mergedMap.has(r.id)) {
          mergedMap.set(r.id, r);
        }
      });

      const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
        const dateA = normalizeDateStr(a.date) || a.date || '';
        const dateB = normalizeDateStr(b.date) || b.date || '';
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return (b.time || '').localeCompare(a.time || '');
      });

      if (mergedList.length > 0 || cloudAll.length > 0) {
        storageService.setGateRecords(mergedList, sId);
      }
      setRecords(applyActiveFilters(mergedList));
    } catch (err) {
      console.warn('Erro ao sincronizar registros de portaria com Firestore:', err);
      const fallbackLocal = storageService.getGateRecords(undefined, undefined, sId);
      setRecords(applyActiveFilters(fallbackLocal));
    } finally {
      setIsLoading(false);
    }
  }, [applyActiveFilters]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, activeSchoolId]);

  // When studentId changes in form, auto-fill student details
  const handleStudentSelect = (id: string) => {
    setStudentId(id);
    const st = students.find(s => s.id === id);
    if (st) {
      const baseGuardian = (st.guardianName || '').trim();
      const rel = (st.guardianRelationship || 'Responsável').trim();
      setGuardianOrAuthorizedPerson(baseGuardian ? `${baseGuardian} (${rel})` : '');
      setGuardianPhone(st.guardianPhone || '');
    }
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const st = students.find(s => s.id === studentId);
    if (!st) {
      setErrorMsg('Selecione um estudante válido para registrar a movimentação.');
      return;
    }

    const cleanReason = reason.trim();
    if (!cleanReason) {
      setErrorMsg('Informe o motivo / justificativa da entrada ou saída.');
      return;
    }

    const resolvedPeriod: SchoolPeriod =
      selectedPeriod ||
      findPeriodByTime(time, schoolPeriods) ||
      schoolPeriods[0] || {
        id: 'extra',
        nome: 'Fora do horário regular',
        inicio: time || '07:00',
        fim: time || '07:00',
        tipo: 'aula',
      };

    setIsSubmitting(true);
    const sId = storageService.getActiveSchoolId();
    const normalizedDate = normalizeDateStr(recordDate) || recordDate || todayStr;
    const isRetro = normalizedDate < todayStr;
    const nowIso = new Date().toISOString();

    const payload: GateRecord = {
      id: `gate-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      studentId: st.id,
      studentName: st.name,
      classId: st.classId,
      className: st.className,
      date: normalizedDate,
      time: time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      type,
      classPeriodId: resolvedPeriod.id,
      classPeriodName: formatPeriodLabel(resolvedPeriod),
      classPeriodType: resolvedPeriod.tipo,
      reason: cleanReason,
      guardianOrAuthorizedPerson: guardianOrAuthorizedPerson.trim() || st.guardianName || 'Responsável / Portaria',
      guardianPhone: guardianPhone.trim() || st.guardianPhone || '',
      recordedBy: operatorName || 'AOE - Portaria',
      notes: notes.trim(),
      isRetroactive: isRetro,
      registeredAt: nowIso,
      schoolId: sId,
    };

    try {
      // 1. Gravação local imediata (garante persistência instantânea)
      storageService.createGateRecord(payload, sId);

      // 2. Persistência confirmada no Cloud Firestore
      let cloudSyncFailed = false;
      try {
        await firestoreService.saveGateRecord(payload, sId);
      } catch (cloudErr) {
        cloudSyncFailed = true;
        console.warn('Falha ao confirmar registro de portaria na nuvem Firestore:', cloudErr);
      }

      // 3. Garante que o filtro ativo exiba imediatamente o registro recém-salvo
      let nextPreset = dateFilterPreset;
      let nextDate = selectedDate;
      let nextClass = selectedClassFilter;

      const matchesCurrentDate =
        nextPreset === 'todas' ||
        (nextPreset === '7dias' && normalizedDate >= getDaysAgoStr(7)) ||
        (nextDate && nextDate !== 'todas' && isSameDay(normalizedDate, nextDate));

      if (!matchesCurrentDate) {
        if (isSameDay(normalizedDate, todayStr)) {
          nextPreset = 'hoje';
          nextDate = todayStr;
        } else if (isSameDay(normalizedDate, getYesterdayStr())) {
          nextPreset = 'ontem';
          nextDate = getYesterdayStr();
        } else {
          nextPreset = 'personalizada';
          nextDate = normalizedDate;
        }
        setDateFilterPreset(nextPreset);
        setSelectedDate(nextDate);
      }

      if (
        nextClass !== 'todas' &&
        (st.classId || '').trim().toLowerCase() !== nextClass.trim().toLowerCase() &&
        (st.className || '').trim().toLowerCase() !== nextClass.trim().toLowerCase()
      ) {
        nextClass = 'todas';
        setSelectedClassFilter('todas');
      }

      const updatedAll = storageService.getGateRecords(undefined, undefined, sId);
      setRecords(applyActiveFilters(updatedAll, nextPreset, nextDate, nextClass));

      const tipoLabel = type === 'entrada_tardia' ? 'Entrada Tardia' : 'Saída Antecipada';
      const baseSuccess = isRetro
        ? `Registro Retroativo (${formatDateBR(normalizedDate)}) de ${tipoLabel} gravado com sucesso!`
        : `Movimentação de ${tipoLabel} registrada com sucesso para ${st.name}!`;

      setSuccessMsg(
        cloudSyncFailed
          ? `${baseSuccess} (Salvo localmente; a sincronização em nuvem será retomada automaticamente.)`
          : baseSuccess
      );
      setTimeout(() => setSuccessMsg(null), 5000);

      // Reset form
      setStudentId('');
      setReason('');
      setNotes('');
      setGuardianOrAuthorizedPerson('');
      setGuardianPhone('');
      setRecordDate(todayStr);
      setIsFormOpen(false);
    } catch (err: any) {
      console.error('Erro ao salvar registro de portaria:', err);
      setErrorMsg('Não foi possível salvar o registro de portaria. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    setIsDeletingRecord(true);
    const id = recordToDelete.id;
    const sId = storageService.getActiveSchoolId();

    storageService.deleteGateRecord(id, sId);
    try {
      await firestoreService.deleteGateRecord(id);
    } catch (e) {
      console.warn('Erro ao excluir registro de portaria no Firestore:', e);
    }
    setRecords(prev => prev.filter(r => r.id !== id));
    setRecordToDelete(null);
    setIsDeletingRecord(false);
  };

  const filteredRecords = records.filter(r => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.studentName || '').toLowerCase().includes(q) ||
      (r.className || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q) ||
      (r.guardianOrAuthorizedPerson || '').toLowerCase().includes(q) ||
      (r.classPeriodName || '').toLowerCase().includes(q)
    );
  });

  const totalLateEntries = records.filter(r => r.type === 'entrada_tardia').length;
  const totalEarlyExits = records.filter(r => r.type === 'saida_antecipada').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider">
                <span>Secretaria & Portaria Escolar</span>
                <span className="text-slate-300">•</span>
                <span>Operado por AOE</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h2 className="text-xl font-bold text-slate-900">
                  Controle de Entradas e Saídas Fora dos Horários Oficiais
                </h2>
                <InfoTooltip
                  title="Controle de Portaria Escolar"
                  content="Registro oficial de atrasos no portão escolar e dispensas antecipadas mediante termo de responsabilidade do responsável legal."
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Registro de Portaria</span>
            </button>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-600 text-xs font-medium">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>Total de Movimentações na Data</span>
            </div>
            <span className="text-base font-extrabold text-slate-900">{records.length}</span>
          </div>

          <div className="bg-amber-50/70 rounded-lg p-3 border border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 text-xs font-medium">
              <ArrowRightCircle className="w-4 h-4 text-amber-600" />
              <span>Entradas Tardias (Atrasos)</span>
            </div>
            <span className="text-base font-extrabold text-amber-900">{totalLateEntries}</span>
          </div>

          <div className="bg-purple-50/70 rounded-lg p-3 border border-purple-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-purple-800 text-xs font-medium">
              <ArrowLeftCircle className="w-4 h-4 text-purple-600" />
              <span>Saídas Antecipadas (Dispensas)</span>
            </div>
            <span className="text-base font-extrabold text-purple-900">{totalEarlyExits}</span>
          </div>
        </div>
      </div>

      {/* Success Alert */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Form Dropdown / Modal */}
      {isFormOpen && (
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-md animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-blue-600" />
              <span>Registrar Movimentação de Aluno na Portaria</span>
            </h3>
            <button
              onClick={() => setIsFormOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
            >
              Fechar formulário
            </button>
          </div>

          <form onSubmit={handleCreateRecord} className="space-y-4">
            {/* Linha 1 do Formulário: Tipo, Turma/Estudante e Data/Horário com Retroatividade */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Type */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Tipo de Movimentação:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('entrada_tardia')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer ${
                      type === 'entrada_tardia'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowRightCircle className="w-3.5 h-3.5" />
                    <span>Entrada Tardia</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('saida_antecipada')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer ${
                      type === 'saida_antecipada'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowLeftCircle className="w-3.5 h-3.5" />
                    <span>Saída Antecipada</span>
                  </button>
                </div>
              </div>

              {/* Student selection with Class Filter */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Filtrar por Turma:</label>
                  <select
                    value={formClassFilter}
                    onChange={e => {
                      setFormClassFilter(e.target.value);
                      setStudentId('');
                    }}
                    className="w-full text-xs py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="todas">Todas as Turmas ({students.length} alunos)</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({students.filter(s => s.classId === c.id).length} alunos)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Selecione o Estudante:</label>
                  <select
                    value={studentId}
                    onChange={e => handleStudentSelect(e.target.value)}
                    required
                    className="w-full text-xs py-2 px-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium"
                  >
                    <option value="">-- Escolha o aluno na lista --</option>
                    {students
                      .filter(s => formClassFilter === 'todas' || s.classId === formClassFilter)
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.className} • RA: {s.ra})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Data da Movimentação & Horário (com suporte total a lançamento retroativo) */}
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Data da Movimentação:</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRecordDate(todayStr)}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                          recordDate === todayStr ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordDate(getYesterdayStr())}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                          recordDate === getYesterdayStr() ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        Ontem
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordDate(getBeforeYesterdayStr())}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                          recordDate === getBeforeYesterdayStr() ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        Anteontem
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={recordDate}
                    max={todayStr}
                    onChange={e => setRecordDate(e.target.value)}
                    required
                    className="w-full text-xs py-2 px-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Horário da Passagem (HH:MM):</label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => handleTimeChange(e.target.value)}
                    required
                    className="w-full text-xs py-2 px-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {type === 'entrada_tardia' ? 'Aula / Intervalo em que Chegou *:' : 'Aula / Intervalo em que Foi Embora *:'}
                  </label>
                  <select
                    value={selectedPeriod?.id || ''}
                    onChange={e => setSelectedPeriodId(e.target.value)}
                    required
                    className="w-full text-xs py-2 px-2.5 bg-blue-50/70 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-bold text-slate-800"
                  >
                    {schoolPeriods.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.tipo === 'intervalo' ? '☕ ' : '📚 '}
                        {p.nome} ({p.inicio} – {p.fim})
                      </option>
                    ))}
                  </select>
                  {selectedPeriod && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold mt-1 px-2 py-0.5 rounded-md ${
                      selectedPeriod.tipo === 'intervalo'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                    }`}>
                      <BookOpen className="w-3 h-3" />
                      <span>
                        {type === 'entrada_tardia' ? 'Entrada vinculada a: ' : 'Saída vinculada a: '}
                        <strong>{selectedPeriod.nome}</strong>
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Alerta Visual de Registro Retroativo */}
            {isFormRetroactive && (
              <div className="bg-amber-50 border border-amber-300 text-amber-900 px-3.5 py-2.5 rounded-xl flex items-start gap-2.5 text-xs animate-in fade-in">
                <History className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold text-amber-950">Aviso de Registro Retroativo:</span> Esta movimentação refere-se ao dia <strong>{formatDateBR(recordDate)}</strong>. O registro será gravado com selo oficial de data retroativa e data/hora atual de auditoria, assegurando conformidade administrativa e transparência para a equipe escolar e pais.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Reason */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Motivo Informado:
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Ex: Atraso no transporte escolar, consulta odontológica, compromisso familiar"
                  required
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Guardian / Authorized Person */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Responsável que Buscou ou Autorizou:
                </label>
                <input
                  type="text"
                  value={guardianOrAuthorizedPerson}
                  onChange={e => setGuardianOrAuthorizedPerson(e.target.value)}
                  placeholder="Nome do responsável e grau de parentesco"
                  required
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Phone */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Telefone de Contato:</label>
                <input
                  type="text"
                  value={guardianPhone}
                  onChange={e => setGuardianPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Observações da Portaria / AOE:</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Aluno encaminhado à 2ª aula; termo assinado no livro de ocorrências"
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !studentId || !reason.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Salvando...' : 'Salvar Registro de Portaria'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar com Atalhos Rápidos de Datas */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          {/* Presets de Data (Hoje, Ontem, 7 Dias, Todas) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Filtro de Data:</span>
            </span>

            <button
              type="button"
              onClick={() => {
                setDateFilterPreset('hoje');
                setSelectedDate(todayStr);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                dateFilterPreset === 'hoje'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Hoje
            </button>

            <button
              type="button"
              onClick={() => {
                setDateFilterPreset('ontem');
                setSelectedDate(getYesterdayStr());
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                dateFilterPreset === 'ontem'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Ontem
            </button>

            <button
              type="button"
              onClick={() => {
                setDateFilterPreset('7dias');
                setSelectedDate('ultimos_7_dias');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                dateFilterPreset === '7dias'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Últimos 7 dias
            </button>

            <button
              type="button"
              onClick={() => {
                setDateFilterPreset('todas');
                setSelectedDate('todas');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                dateFilterPreset === 'todas'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todas as Datas
            </button>

            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[11px] text-slate-400">ou</span>
              <input
                type="date"
                value={dateFilterPreset === 'personalizada' ? selectedDate : ''}
                onChange={e => {
                  setDateFilterPreset('personalizada');
                  setSelectedDate(e.target.value);
                }}
                className="text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                title="Selecione qualquer data retroativa específica"
              />
            </div>
          </div>

          {/* Filtro de Turma e Busca */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Turma:</label>
              <select
                value={selectedClassFilter}
                onChange={e => setSelectedClassFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              >
                <option value="todas">Todas as Turmas</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="relative flex-1 lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por aluno, turma ou motivo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
            Carregando registros de portaria...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <DoorOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">Nenhum registro de portaria para o filtro selecionado</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Não foram localizadas entradas tardias ou saídas antecipadas para as datas e turmas escolhidas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Data, Horário & Tipo</th>
                  <th className="py-3 px-4">Estudante & Turma</th>
                  <th className="py-3 px-4">Motivo Apresentado</th>
                  <th className="py-3 px-4">Responsável / Autorização</th>
                  <th className="py-3 px-4">Registrado Por</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map(record => (
                  <tr key={record.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                            {formatDateBR(record.date)} • {record.time}
                          </span>
                          {(record.isRetroactive || record.date < todayStr) && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300"
                              title={`Lançamento efetuado a posteriori para a data de ${formatDateBR(record.date)}`}
                            >
                              <History className="w-3 h-3 text-amber-700" />
                              <span>Retroativo</span>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {record.type === 'entrada_tardia' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              <ArrowRightCircle className="w-3 h-3 text-amber-600" />
                              <span>Entrada Tardia</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                              <ArrowLeftCircle className="w-3 h-3 text-purple-600" />
                              <span>Saída Antecipada</span>
                            </span>
                          )}
                        </div>
                        {(() => {
                          const resolvedFallback = !record.classPeriodName ? findPeriodByTime(record.time, schoolPeriods) : null;
                          const periodText = record.classPeriodName || (resolvedFallback ? formatPeriodLabel(resolvedFallback) : null);
                          const isBreak = record.classPeriodType === 'intervalo' || resolvedFallback?.tipo === 'intervalo';
                          if (!periodText) return null;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border w-fit ${
                                isBreak
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}
                            >
                              <BookOpen className="w-3 h-3 shrink-0" />
                              <span>
                                {record.type === 'entrada_tardia' ? 'Chegou na: ' : 'Saiu na: '}
                                {periodText}
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {onOpenStudentDetail && record.studentId ? (
                        <button
                          type="button"
                          onClick={() => onOpenStudentDetail(record.studentId)}
                          className="font-bold text-slate-900 hover:text-indigo-700 hover:underline text-left cursor-pointer"
                          title="Abrir Dossiê 360° do Estudante"
                        >
                          {record.studentName}
                        </button>
                      ) : (
                        <div className="font-bold text-slate-900">{record.studentName}</div>
                      )}
                      <div className="text-[11px] text-slate-500 font-medium">{record.className}</div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <span className="text-slate-800 font-medium block">{record.reason}</span>
                      {record.notes && (
                        <span className="text-[11px] text-slate-500 italic block mt-0.5">
                          Obs: {record.notes}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-700">{record.guardianOrAuthorizedPerson}</div>
                      {record.guardianPhone && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{record.guardianPhone}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-[11px]">
                      {record.recordedBy}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setRecordToDelete(record)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Excluir registro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Confirmação para Excluir Registro de Portaria */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Excluir Registro de Portaria
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Deseja realmente remover o registro de movimentação de{' '}
              <strong className="text-slate-900">{recordToDelete.studentName}</strong> ({recordToDelete.className})?
            </p>
            <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center text-[11px] text-slate-500">
              Tipo: <span className="font-semibold text-slate-800">{recordToDelete.type === 'entrada_tardia' ? 'Entrada Tardia' : 'Saída Antecipada'}</span> • Horário: <span className="font-semibold text-slate-800">{recordToDelete.time}</span>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeletingRecord}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteRecord}
                disabled={isDeletingRecord}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isDeletingRecord ? (
                  <span>Excluindo...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sim, Excluir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
