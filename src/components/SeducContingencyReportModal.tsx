import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Check,
  X,
  Calendar,
  School,
  FileText,
  UserCheck,
  UserX,
  Stethoscope,
  Download,
  Share2,
  User,
  Search,
  ShieldAlert,
  Clock,
  PenTool,
  MessageSquare,
  Users,
  Award,
  AlertTriangle,
  ArrowRightCircle,
  ArrowLeftCircle,
  CheckCircle2,
  Phone
} from 'lucide-react';
import { SeducContingencyReport, SchoolClass, Student, GateRecord } from '../types';
import { storageService } from '../data/storageService';
import { lerCacheOcorrencias } from '../lib/sheetsSyncService';
import { formatDateBR, getLocalTodayStr } from '../utils/reportCalculator';

interface SeducContingencyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: SchoolClass[];
  students?: Student[];
  currentUser?: { id?: string; name?: string; role: string } | null;
}

export const SeducContingencyReportModal: React.FC<SeducContingencyReportModalProps> = ({
  isOpen,
  onClose,
  classes,
  students: propStudents,
  currentUser,
}) => {
  const isProfessor = currentUser?.role === 'professor';
  const todayStr = getLocalTodayStr();

  // Modos de Visualização do Relatório: Individual (Dossiê do Aluno com Ocorrências e Assinaturas) ou Geral por Turma
  const [viewMode, setViewMode] = useState<'individual' | 'coletivo'>('individual');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedClassId, setSelectedClassId] = useState<string>('todas');
  const [studentSearchTerm, setStudentSearchTerm] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [reportData, setReportData] = useState<SeducContingencyReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  // Carrega lista consolidada de alunos
  const allStudents: Student[] = useMemo(() => {
    if (propStudents && propStudents.length > 0) return propStudents;
    return storageService.getStudents();
  }, [propStudents]);

  // Alunos filtrados pela turma e busca
  const filteredStudents = useMemo(() => {
    return allStudents.filter(s => {
      const matchClass = selectedClassId === 'todas' || s.classId === selectedClassId;
      if (!matchClass) return false;
      if (!studentSearchTerm.trim()) return true;
      const term = studentSearchTerm.toLowerCase().trim();
      return s.name.toLowerCase().includes(term) || (s.ra && s.ra.toLowerCase().includes(term));
    });
  }, [allStudents, selectedClassId, studentSearchTerm]);

  // Define o aluno selecionado (inicia com o primeiro da lista filtrada se vazio)
  const currentStudent = useMemo(() => {
    if (selectedStudentId) {
      const found = allStudents.find(s => s.id === selectedStudentId);
      if (found) return found;
    }
    return filteredStudents[0] || allStudents[0] || null;
  }, [selectedStudentId, allStudents, filteredStudents]);

  // Busca relatório coletivo do backend
  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/seduc-contingency-report?date=${selectedDate}&classId=${selectedClassId}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error('Erro ao buscar dados do relatório:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, selectedDate, selectedClassId]);

  // Se o aluno ativo não estiver setado, seta o primeiro
  useEffect(() => {
    if (!selectedStudentId && filteredStudents.length > 0) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, selectedStudentId]);

  // DADOS ESPECÍFICOS DO ALUNO ATIVO (Frequência, Ocorrências, Tratativas e Portaria)
  const studentData = useMemo(() => {
    if (!currentStudent) return null;

    // 1. Registros de Frequência do Estudante
    const allAttendance = storageService.getAttendanceRecords();
    const studentAttendance = allAttendance.filter(r => r.studentId === currentStudent.id);

    const presencas = studentAttendance.filter(r => r.status === 'presente' || (r.status as any) === 'atraso').length;
    const faltasJust = studentAttendance.filter(r => r.status === 'falta_justificada').length;
    const faltasInjust = studentAttendance.filter(r => r.status === 'falta_injustificada').length;
    const atestados = studentAttendance.filter(r => r.status === 'atestado_medico').length;
    const totalAulasAvaliadas = presencas + faltasJust + faltasInjust + atestados;

    let taxaFrequencia = currentStudent.attendanceRate ?? 100;
    if (totalAulasAvaliadas > 0) {
      taxaFrequencia = Number(((presencas / totalAulasAvaliadas) * 100).toFixed(1));
    }

    // 2. Movimentações de Portaria
    const allGate = storageService.getGateRecords();
    const studentGate = allGate.filter(g => g.studentId === currentStudent.id);
    const entradasTardias = studentGate.filter(g => g.type === 'entrada_tardia');
    const saidasAntecipadas = studentGate.filter(g => g.type === 'saida_antecipada');

    // 3. Ocorrências Disciplinares e Mediações da Gestão
    const ocorrenciasDb = lerCacheOcorrencias();
    const norm = (str: string) => (str || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const stNameNorm = norm(currentStudent.name);

    const ocorrenciasEstudante = (ocorrenciasDb?.registros || []).filter((r: any) => {
      const oNorm = norm(r.estudante || r.aluno || '');
      return oNorm && (oNorm === stNameNorm || oNorm.includes(stNameNorm) || stNameNorm.includes(oNorm));
    });

    // 4. Conversas e Tratativas com a Família
    const tratativasFamiliaEstudante = (ocorrenciasDb?.tratativasFamilia || []).filter((t: any) => {
      const tNorm = norm(t.estudante || '');
      return tNorm && (tNorm === stNameNorm || tNorm.includes(stNameNorm) || stNameNorm.includes(tNorm));
    });

    // 5. Casos de Busca Ativa / Ações Realizadas
    const intervenções = storageService.getInterventions().filter(i => i.studentId === currentStudent.id);

    return {
      presencas,
      faltasJust,
      faltasInjust,
      atestados,
      totalAulasAvaliadas,
      taxaFrequencia,
      entradasTardias,
      saidasAntecipadas,
      ocorrencias: ocorrenciasEstudante,
      tratativasFamilia: tratativasFamiliaEstudante,
      intervenções,
      historicoFrequenciaRecente: studentAttendance.slice(0, 10)
    };
  }, [currentStudent]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyToWhatsApp = () => {
    if (viewMode === 'individual' && currentStudent && studentData) {
      let text = `📋 *SIGAESCOLA - RELATÓRIO OFICIAL DE ACOMPANHAMENTO DO ESTUDANTE*\n`;
      text += `🏫 *Unidade Escolar:* ${reportData?.schoolName || 'EE Professor Arlindo Silvestre'}\n`;
      text += `👤 *Estudante:* ${currentStudent.name} (RA: ${currentStudent.ra || 'S/N'})\n`;
      text += `📚 *Turma:* ${currentStudent.className || currentStudent.classId} | *Emissão:* ${formatDateBR(todayStr)}\n\n`;

      text += `📊 *1. ASSIDUIDADE & FREQUÊNCIA:*\n`;
      text += `• Taxa de Assiduidade: ${studentData.taxaFrequencia}%\n`;
      text += `• Presenças: ${studentData.presencas} | Faltas Justificadas: ${studentData.faltasJust}\n`;
      text += `• Faltas Injustificadas: ${studentData.faltasInjust} | Atestados Médicos: ${studentData.atestados}\n`;
      text += `• Faltas Consecutivas: ${currentStudent.consecutiveAbsences || 0} dias\n\n`;

      text += `⚠️ *2. OCORRÊNCIAS DISCIPLINARES (${studentData.ocorrencias.length}):*\n`;
      if (studentData.ocorrencias.length === 0) {
        text += `• Nenhuma ocorrência disciplinar registrada.\n`;
      } else {
        studentData.ocorrencias.forEach((oc: any, idx: number) => {
          text += `[${idx + 1}] *Data:* ${oc.data} (${oc.aula || 'Aula'})\n`;
          text += `   • *Professor:* ${oc.professor} - ${oc.ocorrencia}\n`;
          if (oc.descricao) text += `   • *Relato:* _${oc.descricao}_\n`;
          if (oc.medida) text += `   • *Medida em Sala:* ${oc.medida}\n`;
          if (oc.mediacao) text += `   • *Mediação Gestão:* ${oc.mediacao} (${oc.mediador || 'Gestão'})\n`;
        });
      }

      text += `\n🤝 *3. TRATATIVAS COM A FAMÍLIA (${studentData.tratativasFamilia.length}):*\n`;
      if (studentData.tratativasFamilia.length === 0) {
        text += `• Sem reuniões ou tratativas adicionais registradas no período.\n`;
      } else {
        studentData.tratativasFamilia.forEach((tr: any) => {
          text += `• *Data:* ${tr.data} - *Mediador:* ${tr.mediador}\n  _${tr.tratativa}_\n`;
        });
      }

      text += `\n✍️ *Documento Oficial com Termo de Assinatura da Gestão, Professor e Responsável Legal.*\n`;
      text += `SigaEscola • Portal Integrado de Gestão & Convivência Escolar`;

      navigator.clipboard.writeText(text);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 4000);
      return;
    }

    // Modo Coletivo por Turma
    if (!reportData) return;
    let text = `📢 *SIGAESCOLA - RELATÓRIO OFICIAL DE ACOMPANHAMENTO COLETIVO*\n`;
    text += `🏫 *Unidade Escolar:* ${reportData.schoolName}\n`;
    text += `📅 *Data de Referência:* ${reportData.formattedDate}\n\n`;
    text += `📊 *RESUMO CONSOLIDADO:*\n`;
    text += `• Total de Estudantes: ${reportData.summary.totalStudents}\n`;
    text += `• Presentes: ${reportData.summary.totalPresent} (${reportData.summary.overallAttendanceRate}%)\n`;
    text += `• Faltas Justificadas: ${reportData.summary.totalFaltaJustificada}\n`;
    text += `• Faltas Injustificadas: ${reportData.summary.totalFaltaInjustificada}\n`;
    text += `• Atestados Médicos Abonados: ${reportData.summary.totalAtestados}\n\n`;

    reportData.classReports.forEach(cls => {
      text += `🏫 *${cls.className.toUpperCase()}* (${cls.shift})\n`;
      text += `• Presentes: ${cls.presentCount}/${cls.totalEnrolled} (${cls.attendanceRate}%)\n`;
      if (cls.absentStudents.length > 0) {
        cls.absentStudents.forEach(st => {
          text += `  • ${st.name} (RA: ${st.ra}) - ${st.status.replace('_', ' ').toUpperCase()}\n`;
        });
      } else {
        text += `  ✅ 100% de presença!\n`;
      }
    });

    navigator.clipboard.writeText(text);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 4000);
  };

  const handleDownloadCSV = () => {
    if (viewMode === 'individual' && currentStudent && studentData) {
      const lines = [
        `SigaEscola - Relatório Oficial de Acompanhamento do Estudante`,
        `Estudante;"${currentStudent.name}"`,
        `RA;"${currentStudent.ra}"`,
        `Turma;"${currentStudent.className || currentStudent.classId}"`,
        `Responsavel;"${currentStudent.guardianName}"`,
        `Telefone;"${isProfessor ? '[RESTRITO]' : currentStudent.guardianPhone || 'N/A'}"`,
        `Taxa de Frequencia;"${studentData.taxaFrequencia}%"`,
        `Presencas Registradas;${studentData.presencas}`,
        `Faltas Justificadas;${studentData.faltasJust}`,
        `Faltas Injustificadas;${studentData.faltasInjust}`,
        `Atestados Medicos;${studentData.atestados}`,
        `Total Ocorrencias Disciplinares;${studentData.ocorrencias.length}`,
        `Total Tratativas Familia;${studentData.tratativasFamilia.length}`,
        ``,
        `--- OCORRENCIAS DISCIPLINARES DETALHADAS ---`,
        `Data;Aula;Professor;Ocorrencia;Descricao;Medida em Sala;Mediacao Gestao;Status`
      ];

      studentData.ocorrencias.forEach((oc: any) => {
        lines.push(`"${oc.data}";"${oc.aula || ''}";"${oc.professor}";"${oc.ocorrencia}";"${(oc.descricao || '').replace(/"/g, '""')}";"${(oc.medida || '').replace(/"/g, '""')}";"${(oc.mediacao || '').replace(/"/g, '""')}";"${oc.status || 'Pendente'}"`);
      });

      lines.push(``);
      lines.push(`--- TRATATIVAS COM A FAMILIA ---`);
      lines.push(`Data;Mediador;Tratativa / Alinhamento`);
      studentData.tratativasFamilia.forEach((tr: any) => {
        lines.push(`"${tr.data}";"${tr.mediador}";"${(tr.tratativa || '').replace(/"/g, '""')}"`);
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + lines.join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `SigaEscola_Acompanhamento_${currentStudent.name.replace(/\s+/g, '_')}_${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (!reportData) return;
    const headers = ['Turma', 'Turno', 'Nome do Aluno', 'RA', 'Situacao', 'Contabiliza Falta', 'Motivo Justificativa', 'Atestado Medico', 'Responsavel Legal'];
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
          `"${st.guardianName}"`
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SigaEscola_Relatorio_Acompanhamento_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const schoolNameDisplay = reportData?.schoolName || 'EE Professor Arlindo Silvestre';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      {/* Estilos dedicados para impressão formal em A4 sem poluição de interface */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-official-report, #printable-official-report * {
            visibility: visible !important;
          }
          #printable-official-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 15mm !important;
            background: white !important;
            color: #000 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden max-h-[96vh] flex flex-col">
        {/* Top Header com Identidade Comercial SigaEscola */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">
                  SigaEscola
                </span>
                <span className="text-xs font-bold text-slate-300">
                  Relatório Oficial de Acompanhamento
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Válido com Assinaturas
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                Instrumento Integrado de Frequência, Ocorrências, Mediação e Família
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyToWhatsApp}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Copiar dados formatados para envio via WhatsApp"
            >
              {copiedSuccess ? <Check className="w-4 h-4 text-emerald-200" /> : <Share2 className="w-4 h-4" />}
              <span className="hidden md:inline">{copiedSuccess ? 'Copiado!' : 'WhatsApp'}</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title="Exportar planilha CSV"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Imprimir documento em folha A4 oficial com campos de assinatura"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
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

        {/* Abas de Modo (Individual vs Turma) e Controles de Filtro */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 sm:px-6 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs shrink-0 no-print">
          {/* Seletor de Modo: Ficha Individual vs Relatório Geral */}
          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('individual')}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'individual'
                  ? 'bg-white text-indigo-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5 text-indigo-600" />
              <span>Ficha Individual do Estudante</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 font-extrabold">
                Reunião / Conselho
              </span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('coletivo')}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'coletivo'
                  ? 'bg-white text-indigo-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-slate-600" />
              <span>Relatório Consolidado da Turma</span>
            </button>
          </div>

          {/* Filtros Contextuais */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Turma */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700">Turma:</span>
              <select
                value={selectedClassId}
                onChange={e => {
                  setSelectedClassId(e.target.value);
                  setStudentSearchTerm('');
                }}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="todas">Todas as Turmas</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Seletor específico de aluno no modo individual */}
            {viewMode === 'individual' ? (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Estudante:</span>
                <select
                  value={currentStudent?.id || ''}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden max-w-xs"
                >
                  {filteredStudents.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.className} • RA: {st.ra || 'S/N'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-bold text-slate-700">Data:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CORPO DO DOCUMENTO OFICIAL (ÁREA IMPRESSA OFICIAL)                         */}
        {/* ========================================================================= */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 bg-slate-100/50">
          <div id="printable-official-report" className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* 1. CABEÇALHO OFICIAL TIMBRADO */}
            <div className="border-b-2 border-slate-900 pb-5 text-center space-y-1">
              <div className="flex items-center justify-between gap-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shrink-0">
                    <School className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] font-black text-indigo-700 tracking-wider uppercase block">
                      SigaEscola • Sistema Integrado de Gestão & Convivência Escolar
                    </span>
                    <h1 className="text-base sm:text-lg font-black text-slate-900 uppercase">
                      {schoolNameDisplay}
                    </h1>
                    <p className="text-xs text-slate-600 font-medium">
                      Secretaria da Educação • Diretoria Regional de Ensino • Ano Letivo 2026
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-slate-900 text-white uppercase tracking-wider">
                    {viewMode === 'individual' ? 'Ficha Individual Oficial' : 'Consolidado da Turma'}
                  </span>
                  <div className="text-[11px] text-slate-500 font-medium mt-1">
                    Emitido em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div className="pt-3 text-center">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 uppercase tracking-wide">
                  {viewMode === 'individual'
                    ? 'RELATÓRIO OFICIAL DE ACOMPANHAMENTO DO ESTUDANTE'
                    : 'RELATÓRIO COLETIVO DE FREQUÊNCIA & ACOMPANHAMENTO DIÁRIO'}
                </h2>
                <p className="text-xs text-slate-500 font-medium italic">
                  Instrumento institucional comprobatório para reuniões de conselho de classe, alinhamento com a família e órgãos de proteção da criança e do adolescente.
                </p>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* MODO 1: FICHA INDIVIDUAL DO ESTUDANTE COM FREQUÊNCIA, OCORRÊNCIAS E ASSINATURAS */}
            {/* ========================================================================= */}
            {viewMode === 'individual' && currentStudent && studentData && (
              <div className="space-y-6">
                {/* 1. DADOS DO ESTUDANTE */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-indigo-600" />
                    <span>1. Identificação do(a) Estudante & Responsáveis:</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block font-medium">Nome do Aluno:</span>
                      <strong className="text-slate-900 text-sm">{currentStudent.name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Registro do Aluno (RA):</span>
                      <strong className="text-slate-900 font-mono text-sm">{currentStudent.ra || 'Não informado'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Turma / Série:</span>
                      <strong className="text-indigo-800 font-bold">{currentStudent.className || currentStudent.classId}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Responsável Legal:</span>
                      <strong className="text-slate-900">{currentStudent.guardianName || 'Não cadastrado'}</strong>
                      {currentStudent.guardianRelationship && (
                        <span className="text-slate-500 ml-1">({currentStudent.guardianRelationship})</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Telefone de Contato:</span>
                      <strong className="text-slate-900">
                        {isProfessor ? '[RESTRITO À GESTÃO]' : (currentStudent.guardianPhone || 'Não informado')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Professor(a) Tutor(a):</span>
                      <strong className="text-slate-900">{currentStudent.tutor || 'Equipe Pedagógica'}</strong>
                    </div>
                  </div>
                </div>

                {/* 2. FREQUÊNCIA & ASSIDUIDADE */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-indigo-600" />
                      <span>2. Registro e Indicadores de Assiduidade Escolar:</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 lowercase">
                      Base oficial de chamadas registradas
                    </span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Taxa de Assiduidade</span>
                      <span className={`text-xl font-black ${
                        studentData.taxaFrequencia >= 75 ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {studentData.taxaFrequencia}%
                      </span>
                      <span className={`text-[10px] font-bold block ${studentData.taxaFrequencia >= 75 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {studentData.taxaFrequencia >= 75 ? 'Regular (LDB ✓)' : 'Crítico (< 75%)'}
                      </span>
                    </div>

                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                      <span className="text-[10px] text-emerald-800 font-bold uppercase block">Presenças</span>
                      <span className="text-xl font-black text-emerald-800">{studentData.presencas}</span>
                      <span className="text-[10px] text-emerald-700 block">dias computados</span>
                    </div>

                    <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                      <span className="text-[10px] text-amber-800 font-bold uppercase block">Faltas Justif.</span>
                      <span className="text-xl font-black text-amber-800">{studentData.faltasJust}</span>
                      <span className="text-[10px] text-amber-700 block">com justificativa</span>
                    </div>

                    <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-200">
                      <span className="text-[10px] text-rose-800 font-bold uppercase block">Injustificadas</span>
                      <span className="text-xl font-black text-rose-800">{studentData.faltasInjust}</span>
                      <span className="text-[10px] text-rose-700 block">sem comprovação</span>
                    </div>

                    <div className="bg-cyan-50/60 p-3 rounded-xl border border-cyan-200">
                      <span className="text-[10px] text-cyan-800 font-bold uppercase block">Atestados Médicos</span>
                      <span className="text-xl font-black text-cyan-800">{studentData.atestados}</span>
                      <span className="text-[10px] text-cyan-700 block">abonos legais</span>
                    </div>

                    <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200">
                      <span className="text-[10px] text-blue-800 font-bold uppercase block">Atrasos Portão</span>
                      <span className="text-xl font-black text-blue-800">{studentData.entradasTardias.length}</span>
                      <span className="text-[10px] text-blue-700 block">entradas tardias</span>
                    </div>
                  </div>

                  {studentData.entradasTardias.length > 0 && (
                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200 text-xs space-y-1">
                      <span className="font-bold text-blue-900 block">Anotações da Portaria Escolar:</span>
                      {studentData.entradasTardias.map((et, i) => (
                        <div key={i} className="text-slate-700">
                          • {formatDateBR(et.date)} às {et.time}: Motivo apresentado: <em>{et.reason}</em> (Autorizado por: {et.guardianOrAuthorizedPerson})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. HISTÓRICO DE OCORRÊNCIAS DISCIPLINARES, MEDIAÇÃO E CONVERSA COM A FAMÍLIA */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      <span>3. Registro de Ocorrências, Mediação da Gestão & Diálogo com a Família:</span>
                    </h3>
                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      {studentData.ocorrencias.length} Registros
                    </span>
                  </div>

                  {studentData.ocorrencias.length === 0 ? (
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>Conduta Exemplar:</strong> Não constam ocorrências disciplinares ou infrações registradas para este estudante.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {studentData.ocorrencias.map((oc: any, index: number) => (
                        <div key={oc.id || index} className="border border-slate-300 rounded-xl p-4 bg-white space-y-2.5 text-xs shadow-2xs">
                          {/* Cabeçalho da Ocorrência */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                Ocorrência #{index + 1}
                              </span>
                              <span className="font-semibold text-slate-700">
                                Data: <strong>{oc.data}</strong> ({oc.aula || 'Horário de Aula'})
                              </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                              oc.status === 'Concluída'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                              Status: {oc.status || 'Pendente'}
                            </span>
                          </div>

                          {/* 3.1 Relato do Professor */}
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 flex items-center gap-1">
                                <PenTool className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Relato do(a) Professor(a): {oc.professor}</span>
                              </span>
                              <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.2 rounded text-[11px]">
                                {oc.ocorrencia}
                              </span>
                            </div>
                            {oc.descricao && (
                              <p className="text-slate-700 italic">
                                "{oc.descricao}"
                              </p>
                            )}
                            {oc.medida && (
                              <div className="text-[11px] text-slate-600 pt-1">
                                <strong>Medida preliminar em sala:</strong> {oc.medida}
                              </div>
                            )}
                          </div>

                          {/* 3.2 Mediação da Gestão Escolar */}
                          <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-200 space-y-1">
                            <span className="font-bold text-indigo-950 flex items-center gap-1">
                              <Award className="w-3.5 h-3.5 text-indigo-700" />
                              <span>Parecer & Mediação da Equipe Gestora / PAAC:</span>
                            </span>
                            {oc.mediacao ? (
                              <p className="text-slate-800 font-medium">
                                {oc.mediacao}
                              </p>
                            ) : (
                              <p className="text-slate-400 italic">
                                Aguardando registro formal da mediação pela equipe gestora.
                              </p>
                            )}
                            {oc.mediador && (
                              <div className="text-[11px] text-indigo-900 font-semibold pt-0.5">
                                Mediador responsável: {oc.mediador}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 3.3 Tratativa e Diálogo com a Família */}
                  <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/70 space-y-2 text-xs">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5 uppercase text-[11px] tracking-wide">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span>Tratativas, Reuniões e Contato com a Família / Responsável:</span>
                    </span>

                    {studentData.tratativasFamilia.length === 0 ? (
                      <p className="text-slate-500 italic">
                        Não há tratativas extraordinárias registradas para este estudante. Os contatos de rotina foram realizados via canais oficiais.
                      </p>
                    ) : (
                      <div className="space-y-2 pt-1">
                        {studentData.tratativasFamilia.map((tr: any, idx: number) => (
                          <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                            <div className="flex items-center justify-between text-slate-700 font-semibold">
                              <span>Data: <strong>{tr.data}</strong></span>
                              <span className="text-[11px] text-slate-500">Atendido por: {tr.mediador || 'Gestão Escolar'}</span>
                            </div>
                            <p className="text-slate-800">
                              {tr.tratativa}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. TERMO DE CIÊNCIA E COMPROMISSO */}
                <div className="border border-slate-300 rounded-xl p-4 bg-slate-50 text-xs text-slate-700 leading-relaxed space-y-1.5">
                  <h4 className="font-black text-slate-900 uppercase text-[11px] tracking-wide">
                    4. Termo Oficial de Ciência, Compromisso e Acompanhamento:
                  </h4>
                  <p>
                    Declaramos, para os devidos fins institucionais e comprobatórios, que tomamos ciência integral dos registros de frequência, assiduidade, ocorrências disciplinares, medidas restaurativas e orientações prestadas pela equipe escolar constantes nesta ficha de acompanhamento. A equipe escolar, o estudante e os pais/responsáveis legais comprometem-se formalmente a cumprir o plano de assiduidade e convivência harmônica estabelecido, em observância à <strong>Lei de Diretrizes e Bases da Educação Nacional (LDB - Lei nº 9.394/1996)</strong> e ao <strong>Estatuto da Criança e do Adolescente (ECA - Lei nº 8.069/1990)</strong>.
                  </p>
                </div>

                {/* 5. CAMPOS PARA ASSINATURA FORMAL (3 BLOCOS) */}
                <div className="pt-6 border-t-2 border-slate-900 space-y-8">
                  <div className="text-center text-[11px] font-black uppercase text-slate-700 tracking-wider">
                    Assinaturas Oficiais de Homologação e Ciência:
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center text-xs">
                    {/* Assinatura 1: Gestão Escolar */}
                    <div className="space-y-1.5">
                      <div className="border-b border-slate-900 w-full pb-1 pt-8" />
                      <div className="font-extrabold text-slate-900">
                        Equipe Gestora / Direção
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {schoolNameDisplay} • Carimbo e Cargo
                      </div>
                    </div>

                    {/* Assinatura 2: Professor / Mediador */}
                    <div className="space-y-1.5">
                      <div className="border-b border-slate-900 w-full pb-1 pt-8" />
                      <div className="font-extrabold text-slate-900">
                        Professor(a) / Mediador(a)
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {currentStudent.tutor ? `Tutor(a): ${currentStudent.tutor}` : 'Orientador(a) Escolar'}
                      </div>
                    </div>

                    {/* Assinatura 3: Pai / Mãe / Responsável Legal */}
                    <div className="space-y-1.5">
                      <div className="border-b border-slate-900 w-full pb-1 pt-8" />
                      <div className="font-extrabold text-slate-900">
                        Pai / Mãe / Responsável Legal
                      </div>
                      <div className="text-[10px] text-slate-500">
                        RG / CPF: ____________________________
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-[10px] text-slate-400">
                    Documento gerado eletronicamente através da plataforma SigaEscola com autenticidade verificável nos registros internos da escola.
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* MODO 2: RELATÓRIO COLETIVO CONSOLIDADO DA TURMA OU ESCOLA                 */}
            {/* ========================================================================= */}
            {viewMode === 'coletivo' && (
              <div className="space-y-6">
                {isLoading ? (
                  <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
                    Gerando consolidado coletivo...
                  </div>
                ) : !reportData ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Nenhum dado encontrado para a data e turma selecionadas.
                  </div>
                ) : (
                  <>
                    {/* Resumo Numérico Coletivo */}
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
                      </div>
                      <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200 text-center">
                        <span className="text-[10px] text-rose-800 font-bold block uppercase">Injustificadas</span>
                        <span className="text-lg font-black text-rose-800">{reportData.summary.totalFaltaInjustificada}</span>
                      </div>
                      <div className="bg-cyan-50/70 p-3 rounded-xl border border-cyan-200 text-center">
                        <span className="text-[10px] text-cyan-800 font-bold block uppercase">Atestados</span>
                        <span className="text-lg font-black text-cyan-800">{reportData.summary.totalAtestados}</span>
                      </div>
                      <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-center">
                        <span className="text-[10px] text-blue-800 font-bold block uppercase">Atrasos</span>
                        <span className="text-lg font-black text-blue-800">{reportData.summary.totalAtrasos}</span>
                      </div>
                    </div>

                    {/* Turma por Turma */}
                    <div className="space-y-4">
                      {reportData.classReports.map(cls => (
                        <div key={cls.classId} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                          <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900">{cls.className}</span>
                              <span className="text-slate-500 font-medium">({cls.grade} • {cls.shift})</span>
                            </div>
                            <div className="flex items-center gap-3 font-semibold">
                              <span>Matriculados: {cls.totalEnrolled}</span>
                              <span className="text-emerald-700">Presentes: {cls.presentCount} ({cls.attendanceRate}%)</span>
                              <span className="text-rose-700">Ausentes: {cls.absentStudents.length}</span>
                            </div>
                          </div>

                          {cls.absentStudents.length === 0 ? (
                            <div className="p-3 text-center text-xs font-semibold text-emerald-700 bg-emerald-50/30">
                              ✅ 100% de presença confirmada nesta turma na data!
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
                                  <tr>
                                    <th className="py-2 px-4">Estudante & RA</th>
                                    <th className="py-2 px-4">Situação</th>
                                    <th className="py-2 px-4">Motivo / Atestado</th>
                                    <th className="py-2 px-4">Responsável Legal</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {cls.absentStudents.map(st => (
                                    <tr key={st.id} className="hover:bg-slate-50/60">
                                      <td className="py-2.5 px-4">
                                        <div className="font-bold text-slate-900">{st.name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono">RA: {st.ra}</div>
                                      </td>
                                      <td className="py-2.5 px-4">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          st.status === 'atestado_medico'
                                            ? 'bg-cyan-100 text-cyan-900'
                                            : st.status === 'falta_justificada'
                                            ? 'bg-amber-100 text-amber-900'
                                            : 'bg-rose-100 text-rose-900'
                                        }`}>
                                          {st.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-700">
                                        {st.justification || st.medicalCertificate || (st.gateRecord ? st.gateRecord.reason : 'Sem comunicação')}
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-700">
                                        <div>{st.guardianName}</div>
                                        {!isProfessor && st.guardianPhone && (
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

                    {/* Assinatura da Gestão no Relatório Coletivo */}
                    <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-center">
                      <div className="space-y-1">
                        <div className="border-b border-slate-900 w-64 pb-1 pt-6 mx-auto" />
                        <span className="font-bold text-slate-900 block">Direção / Coordenação Escolar</span>
                        <span className="text-[10px] text-slate-500">Homologação da Frequência Diária</span>
                      </div>
                      <div className="space-y-1">
                        <div className="border-b border-slate-900 w-64 pb-1 pt-6 mx-auto" />
                        <span className="font-bold text-slate-900 block">Secretaria Escolar</span>
                        <span className="text-[10px] text-slate-500">Conferência dos Registros Oficiais</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
