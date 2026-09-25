import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Calendar,
  ShieldCheck,
  Stethoscope,
  CheckCircle2,
  Filter,
  User,
  Clock
} from 'lucide-react';
import { SchoolClass, Student, AttendanceRecord } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { isStudentInClass, isRecordInClass } from './RealTimeAttendance';
import { firestoreService, isSameDay } from '../lib/firestoreService';
import { storageService } from '../data/storageService';

interface TeacherAbsenceViewProps {
  classes: SchoolClass[];
  students: Student[];
  teacherName: string;
}

export const TeacherAbsenceView: React.FC<TeacherAbsenceViewProps> = ({
  classes,
  students,
  teacherName,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '9A');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [viewAllDates, setViewAllDates] = useState<boolean>(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'todas' | 'justificadas' | 'atestados'>('todas');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const currentClass = classes.find(c => c.id === selectedClassId) || classes[0];

  const fetchRecords = async () => {
    setIsLoading(true);
    let classRecs: AttendanceRecord[] = [];

    // 1. Consulta em nuvem no Firestore
    try {
      const allCloud = await firestoreService.getAttendanceRecords();
      if (allCloud && allCloud.length > 0 && currentClass) {
        classRecs = allCloud.filter(r => {
          const matchClass = isRecordInClass(r, currentClass);
          if (!matchClass) return false;
          if (viewAllDates) return true;
          return isSameDay(r.date, selectedDate);
        });
      }
    } catch (e) {
      console.warn('Erro ao buscar do Firestore em TeacherAbsenceView:', e);
    }

    // 2. Consulta API backend se vazio
    if (classRecs.length === 0) {
      try {
        const url = viewAllDates
          ? `/api/attendance-records?classId=${selectedClassId}`
          : `/api/attendance-records?classId=${selectedClassId}&date=${selectedDate}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            classRecs = data;
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar da API backend em TeacherAbsenceView:', e);
      }
    }

    // 3. Fallback storageService local
    if (classRecs.length === 0 && currentClass) {
      const localRecs = storageService.getAttendanceRecords(undefined, viewAllDates ? undefined : selectedDate);
      classRecs = localRecs.filter(r => isRecordInClass(r, currentClass));
    }

    setRecords(classRecs);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedClassId, selectedDate, viewAllDates]);

  const classStudents = currentClass ? students.filter(s => isStudentInClass(s, currentClass)) : [];

  // Map only justified absences and medical certificates registered by management
  interface JustificationEntry {
    id: string;
    studentId: string;
    studentName: string;
    studentRa: string;
    date: string;
    status: 'falta_justificada' | 'atestado_medico';
    justification: string;
    medicalCertificate?: string;
    medicalDays?: number;
    medicalDayCurrent?: number;
    medicalDaysRemaining?: number;
    medicalStartDate?: string;
    medicalEndDate?: string;
    justificationDays?: number;
    justificationDayCurrent?: number;
    justificationDaysRemaining?: number;
    recordedBy: string;
    recordedAt?: string;
  }

  const justifiedEntries: JustificationEntry[] = [];

  // 1. Process from attendance records
  records.forEach(rec => {
    const isJustified = rec.status === 'falta_justificada' || (rec.justification && rec.justification.trim().length > 0);
    const isMedical = rec.status === 'atestado_medico' || (rec.medicalCertificate && rec.medicalCertificate.trim().length > 0);

    if (isJustified || isMedical) {
      const student = classStudents.find(s => s.id === rec.studentId) || {
        name: rec.studentName || 'Estudante',
        ra: '—'
      };

      justifiedEntries.push({
        id: rec.id || `${rec.studentId}_${rec.date}`,
        studentId: rec.studentId,
        studentName: rec.studentName || student.name,
        studentRa: student.ra || '—',
        date: rec.date,
        status: isMedical ? 'atestado_medico' : 'falta_justificada',
        justification: rec.justification || (isMedical ? 'Atestado médico protocolado' : 'Justificativa de ausência'),
        medicalCertificate: rec.medicalCertificate,
        medicalDays: rec.medicalDays,
        medicalDayCurrent: rec.medicalDayCurrent,
        medicalDaysRemaining: rec.medicalDaysRemaining,
        medicalStartDate: rec.medicalStartDate,
        medicalEndDate: rec.medicalEndDate,
        justificationDays: rec.justificationDays,
        justificationDayCurrent: rec.justificationDayCurrent,
        justificationDaysRemaining: rec.justificationDaysRemaining,
        recordedBy: rec.recordedBy || 'Gestão Escolar / Secretaria',
        recordedAt: rec.recordedAt || rec.createdAt,
      });
    }
  });

  // 2. Also check if any student in this class has notes with medical certificate if viewing all or matching note
  if (justifiedEntries.length === 0 && !viewAllDates) {
    classStudents.forEach(student => {
      if (student.notes?.includes('Atestado')) {
        justifiedEntries.push({
          id: `note_${student.id}`,
          studentId: student.id,
          studentName: student.name,
          studentRa: student.ra,
          date: selectedDate,
          status: 'atestado_medico',
          justification: student.notes,
          medicalCertificate: student.notes,
          recordedBy: 'Gestão Escolar / Secretaria'
        });
      }
    });
  }

  // Deduplicate entries by studentId + date
  const uniqueEntriesMap = new Map<string, JustificationEntry>();
  justifiedEntries.forEach(entry => {
    const key = `${entry.studentId}_${entry.date}`;
    if (!uniqueEntriesMap.has(key)) {
      uniqueEntriesMap.set(key, entry);
    }
  });
  const allJustifiedList = Array.from(uniqueEntriesMap.values());

  // Filter based on user query and selected filter
  const filteredList = allJustifiedList.filter(item => {
    const matchesSearch =
      item.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.studentRa.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.justification.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.medicalCertificate && item.medicalCertificate.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterType === 'justificadas') return item.status === 'falta_justificada';
    if (filterType === 'atestados') return item.status === 'atestado_medico';
    return true;
  });

  const totalJustified = allJustifiedList.filter(i => i.status === 'falta_justificada').length;
  const totalMedical = allJustifiedList.filter(i => i.status === 'atestado_medico').length;

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '—';
    const [year, month, day] = dateStr.split('-');
    if (day && month && year) {
      return `${day}/${month}/${year}`;
    }
    return dateStr;
  };

  return (
    <div className="space-y-6">
      {/* Teacher Restrictive Access Notice */}
      <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  Painel do Docente • Consulta de Justificativas e Atestados
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Acesso Restrito
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Justificativas de Ausência Registradas pela Gestão
              </h2>
              <p className="text-xs text-slate-600">
                Olá, <strong>{teacherName}</strong>. Conforme as diretrizes pedagógicas, você tem acesso às informações de <strong>justificativa de ausência</strong> e ao <strong>dia registrado pela Gestão</strong> para planejamento de aulas, reposições e suporte pedagógico.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Class and Date Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">Turma:</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-slate-50"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.grade} • {c.shift})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">Visualização:</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewAllDates(false)}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer border ${
                  !viewAllDates
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Por Dia
              </button>
              <button
                type="button"
                onClick={() => setViewAllDates(true)}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer border ${
                  viewAllDates
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todas as Datas da Turma
              </button>
            </div>
          </div>

          {!viewAllDates && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">Data / Dia da Ausência:</label>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filtrar por estudante, RA ou motivo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Total de Justificativas Registradas</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-900">{allJustifiedList.length}</div>
          <span className="text-[10px] text-slate-500">
            {viewAllDates ? `Turma ${currentClass?.name}` : `Dia ${formatDateDisplay(selectedDate)}`}
          </span>
        </div>

        <div className="bg-cyan-50/60 rounded-xl p-3.5 border border-cyan-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-cyan-800 mb-1">
            <span className="flex items-center gap-1">
              <span>Atestados Médicos (Abonados)</span>
              <InfoTooltip
                title="Atestados Médicos"
                content="Apresentação de atestado médico/laudo de saúde protocolado pela Gestão. Concede abono legal e NÃO contabiliza como falta na frequência escolar."
              />
            </span>
            <Stethoscope className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-xl font-extrabold text-cyan-900">{totalMedical}</div>
          <span className="text-[10px] text-cyan-700">Registrados e protocolados pela Gestão</span>
        </div>

        <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-1">
            <span className="flex items-center gap-1">
              <span>Faltas Justificadas</span>
              <InfoTooltip
                title="Faltas Justificadas"
                content="A família comunicou o motivo formalmente à Gestão Escolar. Registrado para conhecimento pedagógico do professor."
              />
            </span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-amber-900">{totalJustified}</div>
          <span className="text-[10px] text-amber-700">Comunicação formal acolhida pela Gestão</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
        <span className="font-bold text-slate-500 mr-2 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          Filtrar:
        </span>
        <button
          onClick={() => setFilterType('todas')}
          className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
            filterType === 'todas' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Todas as Justificativas ({allJustifiedList.length})
        </button>
        <button
          onClick={() => setFilterType('atestados')}
          className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
            filterType === 'atestados' ? 'bg-cyan-700 text-white' : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
          }`}
        >
          Atestados Médicos ({totalMedical})
        </button>
        <button
          onClick={() => setFilterType('justificadas')}
          className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
            filterType === 'justificadas' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
          }`}
        >
          Faltas Justificadas ({totalJustified})
        </button>
      </div>

      {/* Table of Absence Reasons and Days registered by Gestão */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
            Carregando justificativas registradas pela gestão...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">
              Nenhuma justificativa ou atestado registrado pela Gestão
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {viewAllDates
                ? `Não há justificativas de ausência ou atestados protocolados pela Gestão para a turma ${currentClass?.name}.`
                : `Não há justificativas de ausência ou atestados protocolados para o dia ${formatDateDisplay(selectedDate)} na turma ${currentClass?.name}.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Estudante & RA</th>
                  <th className="py-3 px-4">Dia / Data da Ausência</th>
                  <th className="py-3 px-4">Tipo de Registro</th>
                  <th className="py-3 px-4">Justificativa da Ausência (Registrada pela Gestão)</th>
                  <th className="py-3 px-4">Período / Detalhes</th>
                  <th className="py-3 px-4">Registrado Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {entry.studentName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">RA: {entry.studentRa}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        {formatDateDisplay(entry.date)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {entry.status === 'atestado_medico' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-900 border border-cyan-300">
                          <Stethoscope className="w-3.5 h-3.5 text-cyan-700" />
                          <span>Atestado Médico (Abonado)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                          <span>Falta Justificada</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-medium bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        {entry.justification}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {entry.status === 'atestado_medico' && (
                        <div className="text-cyan-900 font-semibold bg-cyan-50/60 p-2 rounded-lg border border-cyan-200 text-[11px]">
                          {entry.medicalDays ? (
                            <div>
                              <span>Atestado de <strong>{entry.medicalDays} dia(s)</strong></span>
                              {entry.medicalDayCurrent && (
                                <span className="block text-[10px] text-cyan-700 font-normal mt-0.5">
                                  Dia {entry.medicalDayCurrent} de {entry.medicalDays}
                                  {entry.medicalDaysRemaining !== undefined && entry.medicalDaysRemaining > 0 && ` (restam ${entry.medicalDaysRemaining} dia(s))`}
                                </span>
                              )}
                              {entry.medicalStartDate && entry.medicalEndDate && (
                                <span className="block text-[10px] text-cyan-600 font-mono mt-0.5">
                                  Vigência: {formatDateDisplay(entry.medicalStartDate)} a {formatDateDisplay(entry.medicalEndDate)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span>{entry.medicalCertificate || 'Atestado protocolado na secretaria'}</span>
                          )}
                          <span className="block text-[10px] text-cyan-700 mt-1 font-normal">
                            *Ausência abonada legalmente
                          </span>
                        </div>
                      )}

                      {entry.status === 'falta_justificada' && (
                        <div className="text-amber-900 text-[11px] bg-amber-50/50 p-2 rounded-lg border border-amber-200/60">
                          {entry.justificationDays && entry.justificationDays > 1 ? (
                            <div>
                              <span>Justificativa válida por <strong>{entry.justificationDays} dias</strong></span>
                              {entry.justificationDayCurrent && (
                                <span className="block text-[10px] text-amber-700 font-normal mt-0.5">
                                  Dia {entry.justificationDayCurrent} de {entry.justificationDays}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span>Ausência comunicada formalmente para este dia</span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
                        <ShieldCheck className="w-3 h-3 text-indigo-600" />
                        {entry.recordedBy}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
