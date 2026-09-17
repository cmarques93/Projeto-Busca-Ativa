import React, { useState, useEffect } from 'react';
import {
  FileText,
  UserCheck,
  UserX,
  Clock,
  Search,
  Calendar,
  ShieldCheck,
  AlertCircle,
  Stethoscope,
  Info,
  CheckCircle2
} from 'lucide-react';
import { SchoolClass, Student, AttendanceStatus, AttendanceRecord } from '../types';
import { InfoTooltip } from './InfoTooltip';

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
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'todas' | 'justificadas' | 'atestados' | 'injustificadas'>('todas');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/attendance-records?classId=${selectedClassId}&date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (e) {
      console.error('Erro ao buscar faltas da turma:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedClassId, selectedDate]);

  const currentClass = classes.find(c => c.id === selectedClassId) || classes[0];
  const classStudents = students.filter(s => s.classId === selectedClassId);

  // Combine students in the class with their recorded absence info
  const combinedList = classStudents.map(student => {
    const rec = records.find(r => r.studentId === student.id);
    let status: AttendanceStatus = rec ? rec.status : (student.consecutiveAbsences >= 3 ? 'falta_injustificada' : 'presente');
    let justification = rec?.justification || '';
    let medicalCertificate = rec?.medicalCertificate || '';

    // If student has note with atestado and no record was saved yet
    if (!rec && student.notes?.includes('Atestado')) {
      status = 'atestado_medico';
      medicalCertificate = student.notes;
    }

    return {
      student,
      status,
      justification,
      medicalCertificate,
      isAbsent: status === 'falta_injustificada' || status === 'falta_justificada' || status === 'atestado_medico',
    };
  });

  const absentList = combinedList.filter(item => item.isAbsent || item.status === 'atraso');

  const filteredAbsences = absentList.filter(item => {
    const matchesSearch =
      item.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.student.ra.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.justification.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.medicalCertificate.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'justificadas') return item.status === 'falta_justificada';
    if (filterType === 'atestados') return item.status === 'atestado_medico';
    if (filterType === 'injustificadas') return item.status === 'falta_injustificada';
    return true;
  });

  const totalJustified = absentList.filter(i => i.status === 'falta_justificada').length;
  const totalMedical = absentList.filter(i => i.status === 'atestado_medico').length;
  const totalUnjustified = absentList.filter(i => i.status === 'falta_injustificada').length;

  return (
    <div className="space-y-6">
      {/* Teacher Restrictive Access Notice */}
      <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  Painel do Docente • Consulta de Ausências
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Acesso Restrito
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Motivos de Ausências e Atestados Médicos da Turma
              </h2>
              <p className="text-xs text-slate-600">
                Olá, <strong>{teacherName}</strong>. Este ambiente permite consultar com segurança as justificativas e atestados médicos apresentados pelos estudantes para planejamento pedagógico e reposição de atividades.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Class and Date Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">Turma do Professor:</label>
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
            <label className="text-[11px] font-bold text-slate-500 block mb-1">Data da Aula (Diário):</label>
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
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filtrar por nome, RA ou motivo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Metric Cards for the Class Day */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Total Ausentes no Dia</span>
            <UserX className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-900">{absentList.length}</div>
          <span className="text-[10px] text-slate-500">de {classStudents.length} matriculados</span>
        </div>

        <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-1">
            <span className="flex items-center gap-1">
              <span>Faltas Justificadas</span>
              <InfoTooltip
                title="Faltas Justificadas"
                content="A família comunicou o motivo formalmente à escola. Conforme a LDB, a justificativa fica registrada no prontuário, mas a ausência continua sendo contabilizada na apuração da frequência."
              />
            </span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-amber-900">{totalJustified}</div>
        </div>

        <div className="bg-cyan-50/60 rounded-xl p-3.5 border border-cyan-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-cyan-800 mb-1">
            <span className="flex items-center gap-1">
              <span>Atestados Médicos</span>
              <InfoTooltip
                title="Atestados Médicos"
                content="Apresentação de atestado médico/laudo de saúde. Concede abono legal e NÃO é computado como falta na frequência escolar do estudante."
              />
            </span>
            <Stethoscope className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-xl font-extrabold text-cyan-900">{totalMedical}</div>
        </div>

        <div className="bg-rose-50/60 rounded-xl p-3.5 border border-rose-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-rose-800 mb-1">
            <span className="flex items-center gap-1">
              <span>Faltas Injustificadas</span>
              <InfoTooltip
                title="Faltas Injustificadas"
                content="Ausência sem comunicação prévia ou justificativa legal apresentada pela família. Contabiliza integralmente e aciona os gatilhos de Busca Ativa."
              />
            </span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-extrabold text-rose-900">{totalUnjustified}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
        <span className="font-bold text-slate-500 mr-2">Filtrar:</span>
        <button
          onClick={() => setFilterType('todas')}
          className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
            filterType === 'todas' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Todas as Ocorrências ({absentList.length})
        </button>
        <button
          onClick={() => setFilterType('justificadas')}
          className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
            filterType === 'justificadas' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
          }`}
        >
          Faltas Justificadas ({totalJustified})
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
          onClick={() => setFilterType('injustificadas')}
          className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
            filterType === 'injustificadas' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
          }`}
        >
          Sem Justificativa ({totalUnjustified})
        </button>
      </div>

      {/* Table of Absences with Reasons */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
            Carregando ausências da turma...
          </div>
        ) : filteredAbsences.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">
              Nenhuma ocorrência encontrada para o filtro selecionado
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Todos os estudantes constam como presentes ou não há justificativas cadastradas nesta categoria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Estudante & RA</th>
                  <th className="py-3 px-4">Situação da Ausência</th>
                  <th className="py-3 px-4">Motivo / Justificativa Apresentada</th>
                  <th className="py-3 px-4">Comprovação Médica (Atestado)</th>
                  <th className="py-3 px-4 text-center">Faltas Acumuladas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAbsences.map(({ student, status, justification, medicalCertificate }) => (
                  <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm">{student.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">RA: {student.ra}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {status === 'falta_justificada' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                          <span>Falta Justificada</span>
                        </span>
                      )}
                      {status === 'atestado_medico' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-900 border border-cyan-300">
                          <Stethoscope className="w-3.5 h-3.5 text-cyan-700" />
                          <span>Atestado Médico (Abonado)</span>
                        </span>
                      )}
                      {status === 'falta_injustificada' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                          <UserX className="w-3.5 h-3.5 text-rose-600" />
                          <span>Falta Injustificada</span>
                        </span>
                      )}
                      {status === 'atraso' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>Atraso na Entrada</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {justification ? (
                        <div className="text-slate-800 font-medium bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                          "{justification}"
                        </div>
                      ) : status === 'falta_justificada' ? (
                        <span className="text-amber-700 italic">Justificativa comunicada pela secretaria</span>
                      ) : (
                        <span className="text-slate-400 italic">Nenhum motivo comunicado pela família</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {status === 'atestado_medico' || medicalCertificate ? (
                        <div className="text-cyan-900 font-semibold bg-cyan-50/60 p-2 rounded-lg border border-cyan-200 text-[11px]">
                          {medicalCertificate || 'Atestado médico protocolado na secretaria escolar.'}
                          <span className="block text-[10px] text-cyan-700 mt-0.5 font-normal">
                            *Não penaliza o índice de presença
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-slate-800 text-xs">
                        {student.totalAbsences} faltas
                      </span>
                      {student.consecutiveAbsences >= 3 && (
                        <span className="block text-[10px] text-rose-600 font-semibold mt-0.5">
                          {student.consecutiveAbsences} seguidas
                        </span>
                      )}
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
