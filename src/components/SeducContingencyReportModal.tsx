import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Copy,
  Check,
  X,
  AlertOctagon,
  Calendar,
  School,
  FileText,
  UserCheck,
  UserX,
  Stethoscope,
  Download,
  Share2
} from 'lucide-react';
import { SeducContingencyReport, SchoolClass } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface SeducContingencyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: SchoolClass[];
  currentUser?: { id?: string; name?: string; role: string } | null;
}

export const SeducContingencyReportModal: React.FC<SeducContingencyReportModalProps> = ({
  isOpen,
  onClose,
  classes,
  currentUser,
}) => {
  const isProfessor = currentUser?.role === 'professor';
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedClassId, setSelectedClassId] = useState<string>('todas');
  const [reportData, setReportData] = useState<SeducContingencyReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/seduc-contingency-report?date=${selectedDate}&classId=${selectedClassId}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error('Erro ao buscar relatório SEDUC:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, selectedDate, selectedClassId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyToWhatsApp = () => {
    if (!reportData) return;

    let text = `📢 *EE PROFESSOR ARLINDO SILVESTRE - SEDUC SP*\n`;
    text += `📋 *RELATÓRIO DIÁRIO DE AUSÊNCIAS (CONTINGÊNCIA)*\n`;
    text += `📅 *Data:* ${reportData.formattedDate}\n`;
    text += `⚠️ _Disponibilizado pela Gestão Escolar devido à instabilidade no sistema oficial SEDUC._\n\n`;
    text += `📊 *RESUMO GERAL:*\n`;
    text += `• Total de Alunos: ${reportData.summary.totalStudents}\n`;
    text += `• Presentes: ${reportData.summary.totalPresent} (${reportData.summary.overallAttendanceRate}%)\n`;
    text += `• Faltas Justificadas: ${reportData.summary.totalFaltaJustificada}\n`;
    text += `• Faltas Injustificadas: ${reportData.summary.totalFaltaInjustificada}\n`;
    text += `• Atestados Médicos (Abonados): ${reportData.summary.totalAtestados}\n\n`;
    text += `───────────────────────\n`;

    reportData.classReports.forEach(cls => {
      text += `\n🏫 *${cls.className.toUpperCase()}* (${cls.shift})\n`;
      text += `• Presentes: ${cls.presentCount}/${cls.totalEnrolled} (${cls.attendanceRate}%)\n`;

      if (cls.absentStudents.length === 0) {
        text += `  ✅ *100% de presença! Nenhuma ausência registrada.*\n`;
      } else {
        text += `  *Alunos Ausentes & Motivos:*\n`;
        cls.absentStudents.forEach(st => {
          let statusBadge = '';
          if (st.status === 'atestado_medico') statusBadge = '🏥 [Atestado Médico]';
          else if (st.status === 'falta_justificada') statusBadge = '📝 [Falta Justificada]';
          else if (st.status === 'atraso') statusBadge = '⏰ [Atraso Portaria]';
          else statusBadge = '❌ [Falta Injustificada]';

          let motivoInfo = st.justification || st.medicalCertificate || (st.gateRecord ? st.gateRecord.reason : 'Sem justificativa informada');
          text += `  • *${st.name}* (RA: ${st.ra})\n    ${statusBadge} - _${motivoInfo}_\n`;
        });
      }
    });

    text += `\n───────────────────────\n`;
    text += `Equipe de Gestão / PAAC • EE Professor Arlindo Silvestre`;

    navigator.clipboard.writeText(text);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 4000);
  };

  const handleDownloadCSV = () => {
    if (!reportData) return;

    const headers = [
      'Turma',
      'Turno',
      'Nome do Aluno',
      'RA',
      'Situacao',
      'Contabiliza Falta',
      'Motivo Justificativa',
      'Atestado Medico',
      'Faltas Acumuladas',
      'Responsavel',
      'Telefone'
    ];

    const rows: string[][] = [];

    reportData.classReports.forEach(cls => {
      cls.allStudents.forEach(st => {
        rows.push([
          `"${cls.className}"`,
          `"${cls.shift}"`,
          `"${st.name}"`,
          `"${st.ra}"`,
          `"${st.status}"`,
          `"${st.isCountedAsAbsence ? 'Sim' : 'Nao'}"`,
          `"${st.justification || ''}"`,
          `"${st.medicalCertificate || ''}"`,
          `"${st.totalAbsences}"`,
          `"${st.guardianName}"`,
          `"${isProfessor ? '[RESTRITO À GESTÃO]' : st.guardianPhone}"`
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Frequencia_SEDUC_Contingencia_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Top bar with quick export actions */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Contingência SEDUC • Gestão Escolar
                </span>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/30">
                  Uso Emergencial
                </span>
              </div>
              <h2 className="text-base font-bold">Relatório Diário de Turma & Ausências para Professores</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyToWhatsApp}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Copiar texto pronto para envio no grupo de WhatsApp dos professores"
            >
              {copiedSuccess ? <Check className="w-4 h-4 text-emerald-200" /> : <Share2 className="w-4 h-4" />}
              <span>{copiedSuccess ? 'Copiado para WhatsApp!' : 'Copiar p/ WhatsApp dos Professores'}</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title="Exportar planilha"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title="Imprimir boletim"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer ml-1"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="font-bold text-slate-700">Data de Referência:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Filtrar Turma:</span>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="todas">Todas as Turmas da Escola</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Contingência SEDUC</span>
            <InfoTooltip
              title="Relatório de Contingência SEDUC"
              content="Documento oficial simplificado de frequência e ausências escolares para apoio imediato à equipe docente e direção escolar em caso de indisponibilidade ou instabilidade da plataforma SEDUC."
            />
          </div>
        </div>

        {/* Report Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {isLoading ? (
            <div className="p-16 text-center text-xs text-slate-400 animate-pulse">
              Gerando relatório consolidado de contingência...
            </div>
          ) : !reportData ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Nenhum dado encontrado para os parâmetros selecionados.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Document Header (Formal SEDUC Standard) */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white text-center space-y-1 shadow-2xs">
                <div className="text-[11px] font-extrabold text-slate-500 tracking-wider uppercase">
                  {reportData.officialHeader}
                </div>
                <h1 className="text-lg font-black text-slate-900 uppercase">
                  {reportData.subHeader}
                </h1>
                <div className="text-sm font-bold text-indigo-700">
                  {reportData.reportTitle}
                </div>
                <div className="text-xs text-slate-500 capitalize pt-1">
                  Referência: <strong>{reportData.formattedDate}</strong>
                </div>
              </div>

              {/* General Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Matriculados</span>
                  <span className="text-lg font-black text-slate-900">{reportData.summary.totalStudents}</span>
                </div>
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 text-center">
                  <span className="text-[10px] text-emerald-800 font-bold block uppercase">Presentes</span>
                  <span className="text-lg font-black text-emerald-800">{reportData.summary.totalPresent}</span>
                  <span className="text-[10px] text-emerald-700 block font-semibold">({reportData.summary.overallAttendanceRate}%)</span>
                </div>
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 text-center">
                  <span className="text-[10px] text-amber-800 font-bold block uppercase">Faltas Justif.</span>
                  <span className="text-lg font-black text-amber-800">{reportData.summary.totalFaltaJustificada}</span>
                  <span className="text-[10px] text-amber-700 block">com motivo</span>
                </div>
                <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200 text-center">
                  <span className="text-[10px] text-rose-800 font-bold block uppercase">Injustificadas</span>
                  <span className="text-lg font-black text-rose-800">{reportData.summary.totalFaltaInjustificada}</span>
                  <span className="text-[10px] text-rose-700 block">sem contato</span>
                </div>
                <div className="bg-cyan-50/70 p-3 rounded-xl border border-cyan-200 text-center">
                  <span className="text-[10px] text-cyan-800 font-bold block uppercase">Atestados Méd.</span>
                  <span className="text-lg font-black text-cyan-800">{reportData.summary.totalAtestados}</span>
                  <span className="text-[10px] text-cyan-700 block">abono legal</span>
                </div>
                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-center">
                  <span className="text-[10px] text-blue-800 font-bold block uppercase">Atrasos Portão</span>
                  <span className="text-lg font-black text-blue-800">{reportData.summary.totalAtrasos}</span>
                  <span className="text-[10px] text-blue-700 block">entradas tardias</span>
                </div>
              </div>

              {/* Class by Class Breakdown */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <School className="w-4 h-4 text-indigo-600" />
                  <span>Detalhamento por Turma para Envio aos Professores:</span>
                </h3>

                {reportData.classReports.map(cls => (
                  <div key={cls.classId} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    {/* Class header */}
                    <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{cls.className}</span>
                        <span className="text-xs text-slate-500 font-medium">({cls.grade} • Turno: {cls.shift})</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-600">
                          Matriculados: <strong>{cls.totalEnrolled}</strong>
                        </span>
                        <span className="text-emerald-700 font-semibold">
                          Presentes: <strong>{cls.presentCount}</strong> ({cls.attendanceRate}%)
                        </span>
                        <span className="text-rose-700 font-semibold">
                          Ausentes: <strong>{cls.absentStudents.length}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Table of absent students with reasons */}
                    {cls.absentStudents.length === 0 ? (
                      <div className="p-4 text-center text-xs font-semibold text-emerald-700 bg-emerald-50/30 flex items-center justify-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Presença integral (100%) confirmada nesta turma na data!</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
                            <tr>
                              <th className="py-2.5 px-4">Estudante & RA</th>
                              <th className="py-2.5 px-4">Situação</th>
                              <th className="py-2.5 px-4">Motivo Apresentado à Secretaria</th>
                              <th className="py-2.5 px-4">Comprovação Médica</th>
                              <th className="py-2.5 px-4">Responsável Legal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {cls.absentStudents.map(st => (
                              <tr key={st.id} className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4">
                                  <div className="font-bold text-slate-900">{st.name}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">RA: {st.ra}</div>
                                </td>
                                <td className="py-2.5 px-4 whitespace-nowrap">
                                  {st.status === 'atestado_medico' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-900 border border-cyan-300">
                                      <Stethoscope className="w-3 h-3 text-cyan-700" />
                                      <span>Atestado Médico (Abonado)</span>
                                    </span>
                                  )}
                                  {st.status === 'falta_justificada' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                      <FileText className="w-3 h-3 text-amber-600" />
                                      <span>Falta Justificada (Contabilizada)</span>
                                    </span>
                                  )}
                                  {st.status === 'falta_injustificada' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                                      <UserX className="w-3 h-3 text-rose-600" />
                                      <span>Falta Injustificada</span>
                                    </span>
                                  )}
                                  {st.status === 'atraso' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                                      <span>Atraso na Entrada</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 max-w-xs">
                                  {st.justification ? (
                                    <span className="text-slate-800 font-medium">{st.justification}</span>
                                  ) : st.gateRecord?.reason ? (
                                    <span className="text-blue-800 font-medium">{st.gateRecord.reason}</span>
                                  ) : st.status === 'falta_justificada' ? (
                                    <span className="text-amber-800 italic">Justificativa comunicada à secretaria</span>
                                  ) : (
                                    <span className="text-slate-400 italic">Sem comunicação da família</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4">
                                  {st.medicalCertificate ? (
                                    <span className="text-cyan-900 font-semibold bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200 text-[11px]">
                                      {st.medicalCertificate}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-slate-700">
                                  <div className="font-medium">{st.guardianName}</div>
                                  {isProfessor ? (
                                    <div className="text-[10px] text-slate-400 italic">Telefone restrito à gestão</div>
                                  ) : (
                                    <div className="text-[10px] text-slate-500">{st.guardianPhone}</div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
