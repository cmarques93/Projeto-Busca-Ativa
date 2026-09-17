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
  AlertCircle
} from 'lucide-react';
import { GateRecord, GateMovementType, Student, SchoolClass } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface GatePassManagerProps {
  students: Student[];
  classes: SchoolClass[];
  operatorName: string;
}

export const GatePassManager: React.FC<GatePassManagerProps> = ({
  students,
  classes,
  operatorName,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [records, setRecords] = useState<GateRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  // Form state
  const [formClassFilter, setFormClassFilter] = useState<string>('todas');
  const [studentId, setStudentId] = useState<string>('');
  const [type, setType] = useState<GateMovementType>('entrada_tardia');
  const [time, setTime] = useState<string>(
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const [reason, setReason] = useState<string>('');
  const [guardianOrAuthorizedPerson, setGuardianOrAuthorizedPerson] = useState<string>('');
  const [guardianPhone, setGuardianPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const url = `/api/gate-records?date=${selectedDate}&classId=${selectedClassFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (err) {
      console.error('Erro ao buscar registros de portaria:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedDate, selectedClassFilter]);

  // When studentId changes in form, auto-fill student details
  const handleStudentSelect = (id: string) => {
    setStudentId(id);
    const st = students.find(s => s.id === id);
    if (st) {
      setGuardianOrAuthorizedPerson(st.guardianName + ` (${st.guardianRelationship || 'Responsável'})`);
      setGuardianPhone(st.guardianPhone);
    }
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find(s => s.id === studentId);
    if (!st) return;

    setIsSubmitting(true);
    try {
      const payload = {
        studentId: st.id,
        studentName: st.name,
        classId: st.classId,
        className: st.className,
        date: selectedDate,
        time,
        type,
        reason,
        guardianOrAuthorizedPerson,
        guardianPhone,
        recordedBy: operatorName || 'AOE - Portaria',
        notes,
      };

      const res = await fetch('/api/gate-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccessMsg(`Movimentação de ${type === 'entrada_tardia' ? 'Entrada Tardia' : 'Saída Antecipada'} registrada com sucesso!`);
        setTimeout(() => setSuccessMsg(null), 4000);
        // Reset form
        setStudentId('');
        setReason('');
        setNotes('');
        setIsFormOpen(false);
        fetchRecords();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este registro de portaria?')) return;
    try {
      const res = await fetch(`/api/gate-records/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRecords(prev => prev.filter(r => r.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredRecords = records.filter(r => {
    const q = searchQuery.toLowerCase();
    return (
      r.studentName.toLowerCase().includes(q) ||
      r.className.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q) ||
      r.guardianOrAuthorizedPerson.toLowerCase().includes(q)
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

              {/* Time */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Horário da Passagem (HH:MM):</label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  required
                  className="w-full text-xs py-2 px-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

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
                disabled={isSubmitting || !studentId || !reason}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvar Registro de Portaria</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

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
        </div>

        <div className="relative w-full md:w-72">
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
            Carregando registros de portaria...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <DoorOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">Nenhum registro de portaria nesta data</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Não foram registradas entradas tardias ou saídas antecipadas para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Horário / Tipo</th>
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
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                          {record.time}
                        </span>
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
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{record.studentName}</div>
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
                        onClick={() => handleDelete(record.id)}
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
    </div>
  );
};
