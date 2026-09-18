import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  UserX,
  Clock,
  FileText,
  AlertTriangle,
  Send,
  CheckCircle2,
  Users,
  Search,
  Filter,
  Phone,
  Eye,
  Calendar,
  Stethoscope,
  Info,
  Database,
  Smartphone,
  Check,
  ArrowRight
} from 'lucide-react';
import { Student, SchoolClass, AttendanceStatus, ParentAlert, AttendanceRecord } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { storageService } from '../data/storageService';

interface RealTimeAttendanceProps {
  classes: SchoolClass[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  students: Student[];
  onSaveAttendance: (
    items: {
      studentId: string;
      status: AttendanceStatus;
      durationDays?: number;
      justification?: string;
      medicalCertificate?: string;
      medicalDays?: number;
    }[],
    classId: string,
    teacherName: string,
    date?: string
  ) => Promise<{ newAlerts: ParentAlert[] } | void>;
  onOpenStudentDetail: (studentId: string) => void;
  onManualAlert: (student: Student) => void;
  onGoToAlerts?: () => void;
}

export const RealTimeAttendance: React.FC<RealTimeAttendanceProps> = ({
  classes,
  selectedClassId,
  onSelectClass,
  students,
  onSaveAttendance,
  onOpenStudentDetail,
  onManualAlert,
  onGoToAlerts,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [attendanceState, setAttendanceState] = useState<
    Record<
      string,
      {
        status: AttendanceStatus;
        durationDays?: number;
        justification?: string;
        medicalDays?: number;
        medicalCertificate?: string;
      }
    >
  >({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('todos');
  const [teacherName, setTeacherName] = useState('AOE / Equipe Escolar');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [existingRecordSummary, setExistingRecordSummary] = useState<{
    recordedBy: string;
    recordedAt: string;
    count: number;
    absentCount: number;
  } | null>(null);

  const currentClass = classes.find(c => c.id === selectedClassId) || classes[0];

  // Initialize and automatically load any previously saved attendance records for this class and date
  useEffect(() => {
    let isCancelled = false;

    const loadDateAttendance = async () => {
      // 1. Initial baseline from students list
      const initialState: Record<
        string,
        {
          status: AttendanceStatus;
          durationDays?: number;
          justification?: string;
          medicalDays?: number;
          medicalCertificate?: string;
        }
      > = {};

      students.forEach(s => {
        if (s.consecutiveAbsences >= 3) {
          initialState[s.id] = { status: 'falta_injustificada', durationDays: 1 };
        } else {
          initialState[s.id] = { status: 'presente', durationDays: 1 };
        }
      });

      // 2. Query previously recorded attendance records for this specific class and date
      let records: AttendanceRecord[] = [];

      try {
        const res = await fetch(`/api/attendance-records?classId=${selectedClassId}&date=${selectedDate}`);
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            records = json;
          }
        }
      } catch (err) {
        console.warn('API de histórico não respondeu, consultando storageService:', err);
      }

      // Fallback: carregar do storageService se backend não retornou registros
      if (records.length === 0) {
        records = storageService.getAttendanceRecords(selectedClassId, selectedDate);
      }

      if (isCancelled) return;

      if (records && records.length > 0) {
        let absentCount = 0;
        records.forEach(r => {
          initialState[r.studentId] = {
            status: r.status,
            durationDays: r.durationDays || 1,
            justification: r.justification || '',
            medicalDays: r.medicalDays,
            medicalCertificate: r.medicalCertificate,
          };
          if (r.status !== 'presente') {
            absentCount++;
          }
        });

        const latestRecord = records[0];
        setExistingRecordSummary({
          recordedBy: latestRecord.recordedBy || 'Equipe Escolar',
          recordedAt: latestRecord.recordedAt || latestRecord.createdAt || selectedDate,
          count: records.length,
          absentCount,
        });
      } else {
        setExistingRecordSummary(null);
      }

      setAttendanceState(initialState);
    };

    loadDateAttendance();

    return () => {
      isCancelled = true;
    };
  }, [students, selectedClassId, selectedDate]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        durationDays: prev[studentId]?.durationDays || 1,
        medicalDays: status === 'atestado_medico' ? (prev[studentId]?.medicalDays || 1) : prev[studentId]?.medicalDays,
      },
    }));
  };

  const handleDurationDaysChange = (studentId: string, days: number) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        durationDays: Math.max(1, days),
      },
    }));
  };

  const handleJustificationChange = (studentId: string, justification: string) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        justification,
      },
    }));
  };

  const handleMedicalDaysChange = (studentId: string, days: number) => {
    const cleanDays = Math.max(1, days);
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        medicalDays: cleanDays,
        durationDays: cleanDays,
        medicalCertificate: `${cleanDays} dia(s) de atestado`,
      },
    }));
  };

  const handleMarkAllPresent = () => {
    const updated: Record<
      string,
      {
        status: AttendanceStatus;
        durationDays?: number;
        justification?: string;
        medicalDays?: number;
        medicalCertificate?: string;
      }
    > = {};
    students.forEach(s => {
      updated[s.id] = { status: 'presente', durationDays: 1 };
    });
    setAttendanceState(updated);
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.ra.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.guardianName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = filterRisk === 'todos' || s.riskLevel === filterRisk;
    return matchesSearch && matchesRisk;
  });

  const stateValues = Object.values(attendanceState) as {
    status: AttendanceStatus;
    justification?: string;
    medicalCertificate?: string;
  }[];
  const presentCount = stateValues.filter(s => s.status === 'presente').length;
  const unjustifiedAbsences = stateValues.filter(s => s.status === 'falta_injustificada').length;
  const justifiedAbsences = stateValues.filter(s => s.status === 'falta_justificada').length;
  const medicalCertificates = stateValues.filter(s => s.status === 'atestado_medico').length;
  const lateEntries = stateValues.filter(s => s.status === 'atraso').length;

  // LDB Art. 24: Faltas justificadas e injustificadas entram no cômputo da infrequência. Atestados médicos não contabilizam.
  const countedAbsences = unjustifiedAbsences + justifiedAbsences;
  const totalStudentsInClass = students.length;
  const currentRate =
    totalStudentsInClass > 0
      ? (((totalStudentsInClass - countedAbsences) / totalStudentsInClass) * 100).toFixed(1)
      : '100.0';

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSaveSuccessMsg(null);
    try {
      const stateEntries = Object.entries(attendanceState) as [
        string,
        {
          status: AttendanceStatus;
          durationDays?: number;
          justification?: string;
          medicalDays?: number;
          medicalCertificate?: string;
        }
      ][];
      const items = stateEntries.map(([studentId, data]) => ({
        studentId,
        status: data.status,
        durationDays: data.durationDays || 1,
        justification: data.justification,
        medicalDays: data.medicalDays,
        medicalCertificate: data.medicalCertificate,
      }));

      await onSaveAttendance(items, selectedClassId, teacherName, selectedDate);
      const absentCount = items.filter(i => i.status !== 'presente').length;
      setExistingRecordSummary({
        recordedBy: teacherName,
        recordedAt: new Date().toISOString(),
        count: items.length,
        absentCount,
      });
      setSaveSuccessMsg(
        `Frequência da data ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')} registrada com sucesso no banco de dados! (${absentCount} ausências/atestados salvos)`
      );
      setTimeout(() => setSaveSuccessMsg(null), 8000);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Classroom & Date Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              <span>Lançamento Diário de Frequência Escolar</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h2 className="text-xl font-bold text-slate-900">
                Chamada Diária & Registro de Faltas e Atestados
              </h2>
              <InfoTooltip
                title="Regras Legais de Lançamento (LDB / SEDUC)"
                content={
                  <div>
                    <p className="mb-1"><strong>Falta Justificada:</strong> Registra formalmente o motivo da família, mas <em>mantém a contagem da falta</em> no cômputo da infrequência escolar.</p>
                    <p><strong>Atestado Médico:</strong> Apresentação de laudo de saúde que <em>NÃO contabiliza a ausência</em>, respaldando o aluno sem penalizar seu índice escolar.</p>
                  </div>
                }
              />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              EE Professor Arlindo Silvestre • Lançamentos diários com monitoramento em tempo real e alerta imediato de evasão.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Daily Date Selector */}
            <div className="flex flex-col">
              <label className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Data do Lançamento:</span>
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-indigo-50/50 border border-indigo-200 rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[11px] font-bold text-slate-700 mb-1">Turma Ativa:</label>
              <select
                value={selectedClassId}
                onChange={e => onSelectClass(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
              >
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.shift}) - {cls.totalStudents} alunos
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[11px] font-bold text-slate-700 mb-1">Responsável pelo Lançamento:</label>
              <input
                type="text"
                value={teacherName}
                onChange={e => setTeacherName(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden min-w-[200px]"
              />
            </div>
          </div>
        </div>

        {/* Live Counters strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100 text-slate-800">
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3">
            <div className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Presentes</span>
            </div>
            <div className="text-xl font-black text-emerald-950 mt-0.5">{presentCount}</div>
            <span className="text-[10px] text-emerald-700">em sala</span>
          </div>

          <div className="bg-rose-50/70 border border-rose-200 rounded-lg p-3">
            <div className="text-[11px] text-rose-800 font-semibold flex items-center gap-1">
              <UserX className="w-3.5 h-3.5 text-rose-600" />
              <span>Faltas Injust.</span>
            </div>
            <div className="text-xl font-black text-rose-950 mt-0.5">{unjustifiedAbsences}</div>
            <span className="text-[10px] text-rose-700">contam ausência</span>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3">
            <div className="text-[11px] text-amber-800 font-semibold flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              <span>Faltas Justif.</span>
            </div>
            <div className="text-xl font-black text-amber-950 mt-0.5">{justifiedAbsences}</div>
            <span className="text-[10px] text-amber-700">com motivo (contam)</span>
          </div>

          <div className="bg-cyan-50/70 border border-cyan-200 rounded-lg p-3">
            <div className="text-[11px] text-cyan-800 font-semibold flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5 text-cyan-600" />
              <span>Atestados Méd.</span>
            </div>
            <div className="text-xl font-black text-cyan-950 mt-0.5">{medicalCertificates}</div>
            <span className="text-[10px] text-cyan-700 font-bold">NÃO conta falta</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] text-slate-600 font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Atrasos / Portão</span>
            </div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{lateEntries}</div>
            <span className="text-[10px] text-slate-500">Taxa: {currentRate}%</span>
          </div>
        </div>
      </div>

      {/* Info Banner if attendance was already recorded for this date */}
      {existingRecordSummary && !saveSuccessMsg && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-950 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-indigo-600 shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold text-indigo-900">Chamada carregada do banco de dados para esta data!</span>
              <span className="text-indigo-800 ml-1">
                Registrada por <strong>{existingRecordSummary.recordedBy}</strong> em{' '}
                {new Date(existingRecordSummary.recordedAt).toLocaleString('pt-BR')}.{' '}
                {existingRecordSummary.absentCount > 0 ? (
                  <span className="text-rose-700 font-bold">({existingRecordSummary.absentCount} ausência(s)/atestado(s) registrados)</span>
                ) : (
                  <span className="text-emerald-700 font-bold">(100% de presença)</span>
                )}
              </span>
            </div>
          </div>
          {onGoToAlerts && (
            <button
              type="button"
              onClick={onGoToAlerts}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs transition-all"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Painel de Ausências & WhatsApp</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Success Notification Alert if saved */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold">{saveSuccessMsg}</span>
          </div>
          {onGoToAlerts && (
            <button
              type="button"
              onClick={onGoToAlerts}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs transition-all"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Ver Ausências & Enviar WhatsApp aos Pais</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Controls: Search, Filters & Bulk Action */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar aluno por nome, RA ou responsável..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterRisk}
              onChange={e => setFilterRisk(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            >
              <option value="todos">Todos os Níveis de Risco</option>
              <option value="critico">Risco Crítico (&lt; 75%)</option>
              <option value="alto">Risco Alto (3+ faltas)</option>
              <option value="moderado">Risco Moderado</option>
              <option value="baixo">Risco Baixo (Regular)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            Marcar Todos Presentes
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'Gravando Diário...' : 'Gravar Frequência no Banco'}</span>
          </button>
        </div>
      </div>

      {/* Main Student Attendance List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Estudante & RA</th>
                <th className="py-3 px-3">Histórico / Risco</th>
                <th className="py-3 px-3">Frequência Acumulada</th>
                <th className="py-3 px-3">Lançamento da Presença / Ausência</th>
                <th className="py-3 px-4 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Nenhum estudante encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const currentMark = attendanceState[student.id]?.status || 'presente';
                  const isConsecutiveAlert = student.consecutiveAbsences >= 3;

                  return (
                    <tr
                      key={student.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isConsecutiveAlert ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Student Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              student.riskLevel === 'critico'
                                ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                                : student.riskLevel === 'alto'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {student.name.charAt(0)}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => onOpenStudentDetail(student.id)}
                              className="font-bold text-slate-900 hover:text-indigo-600 transition-colors text-left cursor-pointer"
                            >
                              {student.name}
                            </button>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span className="font-mono">RA: {student.ra}</span>
                              <span>•</span>
                              <span>{student.guardianRelationship}: {student.guardianName}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Absences & Streak Badge */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            {student.consecutiveAbsences > 0 ? (
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  student.consecutiveAbsences >= 3
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {student.consecutiveAbsences} {student.consecutiveAbsences === 1 ? 'falta seguida' : 'faltas seguidas'}
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                Assíduo
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Total no ano: {student.totalAbsences} ausências
                          </span>
                        </div>
                      </td>

                      {/* Attendance Rate */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="w-28">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-700">{student.attendanceRate}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                student.attendanceRate < 75
                                  ? 'bg-rose-500'
                                  : student.attendanceRate < 85
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, student.attendanceRate)}%` }}
                            />
                          </div>
                          {student.attendanceRate < 75 && (
                            <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                              Abaixo do limiar LDB (75%)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Attendance Action buttons */}
                      <td className="py-3.5 px-3 min-w-[340px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Presente */}
                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.id, 'presente')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              currentMark === 'presente'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700'
                            }`}
                            title="Presença confirmada em sala"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Presente</span>
                          </button>

                          {/* Falta Injustificada */}
                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.id, 'falta_injustificada')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              currentMark === 'falta_injustificada'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700'
                            }`}
                            title="Falta sem justificativa prévia (conta ausência)"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Falta</span>
                          </button>

                          {/* Falta Justificada */}
                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.id, 'falta_justificada')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              currentMark === 'falta_justificada'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700'
                            }`}
                            title="Falta com motivo comunicado (mantém a contagem da falta)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Justificada</span>
                          </button>

                          {/* Atestado Médico */}
                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.id, 'atestado_medico')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              currentMark === 'atestado_medico'
                                ? 'bg-cyan-700 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-cyan-50 text-slate-700 hover:text-cyan-800'
                            }`}
                            title="Atestado médico: amparo de saúde legal (NÃO contabiliza falta)"
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            <span>Atestado</span>
                          </button>

                          {/* Atraso */}
                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.id, 'atraso')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              currentMark === 'atraso'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700'
                            }`}
                            title="Atraso na entrada da aula"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Input if Falta (Injustificada): Opção se for por mais de 1 dia */}
                        {currentMark === 'falta_injustificada' && (
                          <div className="mt-2 p-2 rounded-lg bg-rose-50/70 border border-rose-200/80 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-rose-900">
                              Duração da falta:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={attendanceState[student.id]?.durationDays || 1}
                                onChange={e => handleDurationDaysChange(student.id, Number(e.target.value))}
                                className="text-xs bg-white border border-rose-300 rounded-md px-2 py-1 font-bold text-rose-900 focus:ring-1 focus:ring-rose-500 focus:outline-hidden"
                              >
                                <option value={1}>1 dia (Hoje)</option>
                                <option value={2}>2 dias</option>
                                <option value={3}>3 dias</option>
                                <option value={4}>4 dias</option>
                                <option value={5}>5 dias (1 semana)</option>
                                <option value={10}>10 dias (2 semanas)</option>
                                <option value={15}>15 dias</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Input if Falta Justificada: Motivo + Opção se for por mais de 1 dia */}
                        {currentMark === 'falta_justificada' && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-50/80 border border-amber-300 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-amber-900">
                                Duração da falta:
                              </span>
                              <select
                                value={attendanceState[student.id]?.durationDays || 1}
                                onChange={e => handleDurationDaysChange(student.id, Number(e.target.value))}
                                className="text-xs bg-white border border-amber-300 rounded-md px-2 py-1 font-bold text-amber-950 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                              >
                                <option value={1}>1 dia (Hoje)</option>
                                <option value={2}>2 dias</option>
                                <option value={3}>3 dias</option>
                                <option value={4}>4 dias</option>
                                <option value={5}>5 dias (1 semana)</option>
                                <option value={10}>10 dias</option>
                                <option value={15}>15 dias</option>
                              </select>
                            </div>

                            <input
                              type="text"
                              placeholder="Motivo da justificativa comunicado pela família..."
                              value={attendanceState[student.id]?.justification || ''}
                              onChange={e => handleJustificationChange(student.id, e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 bg-white border border-amber-300 rounded-md text-slate-800 placeholder-amber-700/60 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                            />
                            <span className="text-[10px] text-amber-800 block font-medium">
                              *Justificativa registrada (a contagem da ausência é mantida conforme LDB)
                            </span>
                          </div>
                        )}

                        {/* Input if Atestado Médico: apenas quantidade de dias, sem CID */}
                        {currentMark === 'atestado_medico' && (
                          <div className="mt-2 p-2.5 rounded-lg bg-cyan-50/90 border border-cyan-300 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-cyan-950 flex items-center gap-1">
                                <Stethoscope className="w-3.5 h-3.5 text-cyan-700" />
                                <span>Quantidade de dias do atestado:</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={90}
                                  value={attendanceState[student.id]?.medicalDays || 1}
                                  onChange={e => handleMedicalDaysChange(student.id, Number(e.target.value))}
                                  className="w-16 text-center text-xs font-black bg-white border border-cyan-400 rounded-md py-1 text-cyan-950 focus:ring-1 focus:ring-cyan-500 focus:outline-hidden"
                                />
                                <span className="text-xs font-bold text-cyan-900">dia(s)</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-cyan-800 font-semibold block flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                              <span>Abono legal: {attendanceState[student.id]?.medicalDays || 1} dia(s) respaldado(s) sem cômputo de falta</span>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Quick Action Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onManualAlert(student)}
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors cursor-pointer"
                            title="Emitir alerta imediato aos responsáveis via WhatsApp/SMS"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenStudentDetail(student.id)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                            title="Ver ficha completa do estudante e histórico de frequência"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          Turma <strong>{currentClass.name}</strong> ({currentClass.shift}) • <strong>{students.length}</strong> estudantes listados.
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onGoToAlerts && (
            <button
              type="button"
              onClick={onGoToAlerts}
              className="px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Painel de Ausências & WhatsApp</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'Gravando Diário...' : 'Gravar Frequência da Turma no Banco'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
