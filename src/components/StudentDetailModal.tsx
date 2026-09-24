import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  MapPin,
  Calendar,
  AlertTriangle,
  Send,
  ShieldAlert,
  Clock,
  CheckCircle2,
  FileText,
  Activity,
  Smartphone,
  Lock,
  Printer,
  Shield,
  Users,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { Student, AttendanceRecord, ParentAlert, InterventionCase } from '../types';
import { storageService } from '../data/storageService';
import { getStudentPhones, cleanPhoneForWhatsApp } from '../utils/phoneUtils';
import { carregarOcorrenciasSeguro } from '../lib/sheetsSyncService';

interface OcorrenciaItem {
  id: string;
  data: string;
  aula: string;
  turma: string;
  estudante: string;
  professor: string;
  ocorrencia: string;
  medida: string;
  auxilio: string;
  descricao: string;
  status: string;
  mediacao?: string;
}

interface TratativaItem {
  id: string;
  data: string;
  estudante: string;
  tratativa: string;
  mediador: string;
}

interface StudentDetailModalProps {
  studentId: string | null;
  onClose: () => void;
  onOpenManualAlert: (student: Student) => void;
  currentUser?: { id?: string; name?: string; role: string } | null;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  studentId,
  onClose,
  onOpenManualAlert,
  currentUser,
}) => {
  const isProfessor = currentUser?.role === 'professor';
  const isGestaoOrAdmin = currentUser?.role === 'gestao_paac' || currentUser?.role === 'admin';
  const [data, setData] = useState<{
    student: Student;
    attendanceHistory: AttendanceRecord[];
    alerts: ParentAlert[];
    intervention?: InterventionCase;
    ocorrencias?: OcorrenciaItem[];
    tratativas?: TratativaItem[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper para formatar data BR
  const formatarDataBR = (dataStr: string) => {
    if (!dataStr) return '';
    if (dataStr.includes('/') && dataStr.length === 10) return dataStr;
    try {
      if (dataStr.includes('-') && dataStr.length === 10) {
        const [a, m, d] = dataStr.split('-');
        return `${d}/${m}/${a}`;
      }
      return dataStr;
    } catch {
      return dataStr;
    }
  };

  // Helper para carregar ocorrências e tratativas daquele estudante
  const carregarOcorrenciasETratativas = async (nomeEstudante: string) => {
    let ocorrencias: OcorrenciaItem[] = [];
    let tratativas: TratativaItem[] = [];

    try {
      const res = await carregarOcorrenciasSeguro();
      if (res && res.data) {
        const listaRegs = res.data.registros || [];
        const listaTrat = res.data.tratativasFamilia || [];

        ocorrencias = listaRegs.filter(
          (r: any) => r.estudante?.trim().toLowerCase() === nomeEstudante.trim().toLowerCase()
        );
        tratativas = listaTrat.filter(
          (t: any) => t.estudante?.trim().toLowerCase() === nomeEstudante.trim().toLowerCase()
        );
      }
    } catch (e) {
      console.warn('Erro ao carregar dados para o modal do estudante:', e);
    }

    return { ocorrencias, tratativas };
  };

  useEffect(() => {
    if (!studentId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadStudentData = async () => {
      let fetchedData: {
        student: Student;
        attendanceHistory: AttendanceRecord[];
        alerts: ParentAlert[];
        intervention?: InterventionCase;
      } | null = null;

      try {
        const res = await fetch(`/api/students/${studentId}`);
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          fetchedData = await res.json();
        }
      } catch (err) {
        console.warn('Backend indisponível ao buscar estudante, consultando banco local:', err);
      }

      if (fetchedData && fetchedData.student) {
        const extras = await carregarOcorrenciasETratativas(fetchedData.student.name);
        if (isMounted) {
          setData({
            ...fetchedData,
            ocorrencias: extras.ocorrencias,
            tratativas: extras.tratativas,
          });
          setLoading(false);
        }
        return;
      }

      // Fallback 1: Buscar do storageService (detalhes completos com histórico e alertas)
      const localData = storageService.getStudentDetails(studentId);
      if (localData && localData.student) {
        const extras = await carregarOcorrenciasETratativas(localData.student.name);
        if (isMounted) {
          setData({
            ...localData,
            ocorrencias: extras.ocorrencias,
            tratativas: extras.tratativas,
          });
          setLoading(false);
        }
        return;
      }

      // Fallback 2: Buscar pelo ID direto no catálogo de estudantes
      const studentObj = storageService.getStudentById(studentId);
      if (studentObj) {
        const history = storageService.getAttendanceRecords()
          .filter(r => r.studentId === studentId)
          .sort((a, b) => b.date.localeCompare(a.date));
        const studentAlerts = storageService.getAlerts()
          .filter(a => a.studentId === studentId)
          .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
        const studentIntervention = storageService.getInterventions().find(i => i.studentId === studentId);
        const extras = await carregarOcorrenciasETratativas(studentObj.name);

        if (isMounted) {
          setData({
            student: studentObj,
            attendanceHistory: history,
            alerts: studentAlerts,
            intervention: studentIntervention,
            ocorrencias: extras.ocorrencias,
            tratativas: extras.tratativas,
          });
          setLoading(false);
        }
        return;
      }

      if (isMounted) {
        setError('Estudante não localizado no cadastro escolar.');
        setLoading(false);
      }
    };

    loadStudentData();

    return () => {
      isMounted = false;
    };
  }, [studentId]);

  // Estatísticas calculadas dinamicamente a partir do histórico real de chamadas
  const computedStats = React.useMemo(() => {
    if (!data) {
      return {
        totalAbsences: 0,
        consecutiveAbsences: 0,
        lastPresenceDate: null,
        attendanceRate: 100,
      };
    }

    const history = data.attendanceHistory || [];

    // Se ainda não houver histórico de chamadas no diário, utiliza os dados cadastrais
    if (history.length === 0) {
      return {
        totalAbsences: data.student.totalAbsences || 0,
        consecutiveAbsences: data.student.consecutiveAbsences || 0,
        lastPresenceDate: data.student.lastAttendanceDate || null,
        attendanceRate: data.student.attendanceRate ?? 100,
      };
    }

    // Ordena do mais recente para o mais antigo cronologicamente
    const sorted = [...history].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Faltas reais registradas no diário eletrônico (contabiliza cada registro de ausência)
    const absenceRecords = sorted.filter(
      r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
    );
    const calculatedTotalAbsences = absenceRecords.length;

    // Faltas consecutivas a partir da chamada mais recente
    let calculatedConsecutive = 0;
    for (const r of sorted) {
      if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
        calculatedConsecutive++;
      } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
        break;
      }
    }

    // Última data em que o estudante esteve presente ('presente' ou 'atraso')
    const lastPresenceRecord = sorted.find(
      r => r.status === 'presente' || (r.status as any) === 'atraso'
    );
    const lastPresenceDate = lastPresenceRecord ? lastPresenceRecord.date : null;

    // Taxa de presença calculada sobre os dias letivos e faltas reais registradas
    const totalSchoolDays = data.student.totalSchoolDays || 46;
    const finalAbsences = calculatedTotalAbsences;
    const calculatedRate = Math.max(0, Math.min(100, Math.round(((totalSchoolDays - finalAbsences) / totalSchoolDays) * 100)));

    return {
      totalAbsences: finalAbsences,
      consecutiveAbsences: calculatedConsecutive,
      lastPresenceDate,
      attendanceRate: calculatedRate,
    };
  }, [data]);

  if (!studentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Dossiê Individual do Estudante
              </h3>
              <p className="text-xs text-slate-500">
                Ficha completa de assiduidade escolar e intervenções da Busca Ativa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200"
              title="Imprimir relatório completo do dossiê"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir Dossiê</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-12 text-center text-slate-400">Carregando ficha do estudante...</div>
          ) : error || !data ? (
            <div className="py-12 text-center text-rose-500">Erro: {error || 'Estudante não encontrado'}</div>
          ) : (
            <>
              {/* Student Overview Strip */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-900">{data.student.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      {data.student.className}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        data.student.riskLevel === 'critico'
                          ? 'bg-rose-100 text-rose-800'
                          : data.student.riskLevel === 'alto'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {data.student.riskLevel === 'critico' ? 'Evasão Crítica' : `Risco ${data.student.riskLevel}`}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                    <span>RA: <strong className="text-slate-700">{data.student.ra}</strong></span>
                    <span>•</span>
                    <span>Status: <strong className="capitalize text-slate-700">{data.student.status.replace('_', ' ')}</strong></span>
                    {data.student.tutor && (
                      <>
                        <span>•</span>
                        <span>Professor(a) Tutor(a): <strong className="text-indigo-700">{data.student.tutor}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                {!isProfessor && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onClose();
                        onOpenManualAlert(data.student);
                      }}
                      className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Disparar Alerta Agora</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Attendance Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-slate-500">Taxa de Presença</div>
                  <div className={`text-xl font-extrabold mt-0.5 ${computedStats.attendanceRate < 75 ? 'text-rose-600' : 'text-slate-900'}`}>
                    {computedStats.attendanceRate}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Mínimo legal: 75%</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-slate-500">Faltas Acumuladas</div>
                  <div className="text-xl font-extrabold text-slate-900 mt-0.5">{computedStats.totalAbsences}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Em {data.student.totalSchoolDays} dias letivos</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-slate-500">Faltas Consecutivas</div>
                  <div className="text-xl font-extrabold text-rose-600 mt-0.5">{computedStats.consecutiveAbsences}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Gatilho ativo aos 3 dias</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-slate-500">Última Presença</div>
                  <div className="text-sm font-bold text-slate-800 mt-1">
                    {computedStats.lastPresenceDate ? formatarDataBR(computedStats.lastPresenceDate) : 'Sem presença recente'}
                  </div>
                </div>
              </div>

              {/* Family & Contact Info */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2 text-xs">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 mb-2">
                  <Phone className="w-4 h-4 text-indigo-600" />
                  <span>Contatos e Localização da Família</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700">
                  <div>
                    <span className="text-slate-400 block">Responsável Principal:</span>
                    <strong className="text-slate-900">{data.student.guardianName}</strong> ({data.student.guardianRelationship})
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Telefone(s) / WhatsApp:</span>
                    {isProfessor ? (
                      <div className="flex items-center gap-2 p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-slate-600 font-medium text-xs">
                        <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Telefone restrito à equipe gestora e coordenação (LGPD)</span>
                      </div>
                    ) : (() => {
                      const phones = getStudentPhones(data.student.guardianPhone);
                      if (phones.length === 0) {
                        return <strong className="text-slate-900">{data.student.guardianPhone || 'Não informado'}</strong>;
                      }

                      return (
                        <div className="space-y-1.5">
                          {phones.length > 1 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                              <Smartphone className="w-2.5 h-2.5" /> {phones.length} telefones cadastrados
                            </span>
                          )}
                          <div className="flex flex-col gap-1">
                            {phones.map((p, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-slate-900">
                                  {p.formatted}
                                </span>
                                <a
                                  href={p.whatsAppUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                                  title={`Abrir WhatsApp com ${p.formatted}`}
                                >
                                  <Phone className="w-3 h-3 text-emerald-600" />
                                  <span>WhatsApp</span>
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <span className="text-slate-400 block">Endereço Residencial:</span>
                    <strong className="text-slate-900">{data.student.address}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Bairro:</span>
                    <strong className="text-slate-900">{data.student.neighborhood}</strong>
                  </div>
                </div>

                {data.student.vulnerabilityFactors && data.student.vulnerabilityFactors.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-200">
                    <span className="text-slate-500 font-semibold block mb-1">
                      Fatores de Risco / Vulnerabilidade Mapeados:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {data.student.vulnerabilityFactors.map((vf, i) => (
                        <span key={i} className="bg-rose-50 border border-rose-200 text-rose-800 px-2 py-0.5 rounded text-[11px] font-medium">
                          {vf}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Active Intervention Case Box if present */}
              {data.intervention && (
                <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/40 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-indigo-600" />
                      <span>Caso de Busca Ativa em Andamento</span>
                    </div>
                    <span className="bg-indigo-600 text-white font-bold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">
                      Fase: {data.intervention.stage.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-slate-700"><strong>Motivo:</strong> {data.intervention.reason}</p>
                  <p className="text-slate-700"><strong>Orientador(a) responsável:</strong> {data.intervention.assignedPedagogue}</p>

                  <div className="mt-2 text-slate-800">
                    <span className="font-bold block mb-1">Última Ação Realizada:</span>
                    {data.intervention.actionLog && data.intervention.actionLog[0] && (
                      <div className="bg-white p-2.5 rounded border border-indigo-100">
                        <div className="font-semibold text-slate-900">{data.intervention.actionLog[0].action}</div>
                        <div className="text-slate-600 text-[11px]">{data.intervention.actionLog[0].notes}</div>
                        <div className="text-emerald-700 font-semibold text-[11px] mt-0.5">
                          Resultado: {data.intervention.actionLog[0].result}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* History of Alerts sent to Guardians */}
              <div>
                <div className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-amber-600" />
                  <span>Histórico de Alertas aos Responsáveis ({data.alerts.length})</span>
                </div>

                {data.alerts.length === 0 ? (
                  <div className="text-xs text-slate-400 p-3 bg-slate-50 rounded-lg">
                    Nenhum alerta foi emitido para este aluno até o momento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.alerts.map(alt => (
                      <div key={alt.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{alt.triggerLabel}</span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {new Date(alt.sentAt).toLocaleString('pt-BR')} • {alt.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] line-clamp-2">{alt.messageContent}</p>
                        {alt.guardianFeedback && (
                          <div className="text-emerald-800 bg-emerald-50 p-1.5 rounded text-[11px]">
                            <strong>Retorno do Responsável:</strong> "{alt.guardianFeedback}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Attendance Records */}
              <div>
                <div className="font-bold text-slate-900 text-sm mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-slate-600" />
                    <span>Histórico de Frequência Escolar</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Taxa: <strong>{computedStats.attendanceRate.toFixed(1)}%</strong>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-2.5">Data</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Registrado Por</th>
                        <th className="p-2.5">Justificativa / Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.attendanceHistory.slice(0, 8).map(att => (
                        <tr key={att.id}>
                          <td className="p-2.5 font-medium text-slate-800">{att.date}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                                att.status === 'presente'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : att.status === 'atestado_medico'
                                  ? 'bg-cyan-100 text-cyan-800'
                                  : att.status === 'falta_justificada'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {att.status === 'atestado_medico' ? 'Atestado Médico' : att.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500">{att.recordedBy}</td>
                          <td className="p-2.5 text-slate-600">
                            {att.status === 'atestado_medico' ? (
                              <span className="font-medium text-cyan-900 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200 text-[11px] inline-block">
                                {att.medicalCertificate || att.justification || 'Atestado médico homologado'}
                              </span>
                            ) : att.status === 'falta_justificada' ? (
                              <span className="font-medium text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px] inline-block">
                                {att.justification || 'Falta justificada homologada'}
                              </span>
                            ) : (
                              att.justification || '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ocorrências Disciplinares Registradas */}
              <div>
                <div className="font-bold text-slate-900 text-sm mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Registro de Ocorrências Escolares ({data.ocorrencias?.length || 0})</span>
                  </span>
                </div>

                {!data.ocorrencias || data.ocorrencias.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 italic">
                    Nenhuma ocorrência disciplinar registrada para este estudante.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {data.ocorrencias.map(oc => {
                      const phones = getStudentPhones(data.student);
                      const primaryPhone = phones.length > 0 ? phones[0] : null;
                      const msgTexto = `Prezado(a) responsável pelo(a) estudante ${data.student.name} (${data.student.className}), informamos o registro de ocorrência escolar em ${formatarDataBR(oc.data)} (${oc.aula}): "${oc.ocorrencia}". Medida aplicada: "${oc.medida}". Docente: ${oc.professor}. Estamos à disposição na escola para alinhamento pedagógico.`;
                      const waUrl = primaryPhone ? `https://wa.me/${cleanPhoneForWhatsApp(primaryPhone.digits)}?text=${encodeURIComponent(msgTexto)}` : '#';

                      return (
                        <div key={oc.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-800">
                              📅 {formatarDataBR(oc.data)} ({oc.aula}) — Prof: {oc.professor}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              oc.status === 'Resolvido' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {oc.status}
                            </span>
                          </div>
                          <p className="text-slate-900 font-semibold">{oc.ocorrencia}</p>
                          <p className="text-slate-600 text-[11px]">
                            <strong>Medida:</strong> {oc.medida}
                          </p>
                          {oc.descricao && (
                            <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200">
                              "{oc.descricao}"
                            </p>
                          )}
                          {oc.mediacao && (
                            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-950">
                              <strong>📋 Parecer / Ação da Gestão:</strong> {oc.mediacao}
                            </div>
                          )}

                          {/* Envio via WhatsApp (Apenas Gestão/Admin) */}
                          {isGestaoOrAdmin && primaryPhone && (
                            <div className="pt-1.5 border-t border-slate-200 flex justify-end">
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                                title="Enviar notificação ao responsável via WhatsApp"
                              >
                                <Phone className="w-3 h-3" />
                                <span>Enviar aos Pais (WhatsApp)</span>
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tratativas Realizadas em Reunião com a Família */}
              <div>
                <div className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Tratativas Realizadas em Reunião com a Família ({data.tratativas?.length || 0})</span>
                </div>

                {!data.tratativas || data.tratativas.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 italic">
                    Nenhuma ata ou tratativa de reunião com responsáveis registrada até o momento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.tratativas.map((tr, idx) => (
                      <div key={tr.id || idx} className="p-3 bg-indigo-50/50 border border-indigo-100 border-l-4 border-l-indigo-600 rounded-r-xl text-xs">
                        <div className="flex justify-between items-center text-indigo-900 font-bold mb-1">
                          <span>📅 {tr.data}</span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            Mediador(a): {tr.mediador || 'Gestão'}
                          </span>
                        </div>
                        <p className="text-slate-800 whitespace-pre-line leading-relaxed">{tr.tratativa}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg cursor-pointer transition-colors"
          >
            Fechar Dossiê
          </button>
        </div>
      </div>
    </div>
  );
};
