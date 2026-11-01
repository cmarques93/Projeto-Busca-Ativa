import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Printer,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Award,
  Users,
  Building,
  Sparkles,
  RefreshCw,
  Search,
  Check,
  Info,
  Clock,
  ChevronRight,
  Database,
  Download,
  X,
  ShieldAlert,
  FileSpreadsheet,
  AlertOctagon
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import {
  MonthlyPedagogicalReport,
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  AttendanceRecord
} from '../types';
import { storageService } from '../data/storageService';
import { firestoreService, normalizeDateStr } from '../lib/firestoreService';
import { DateRangeCalendar } from './DateRangeCalendar';
import {
  calculatePedagogicalReport,
  formatDateBR,
  formatDateRangeLabel,
  getLocalTodayStr
} from '../utils/reportCalculator';

interface MonthlyReportProps {
  report?: MonthlyPedagogicalReport | null;
  onSelectMonth?: (monthIndex: number) => void;
  selectedMonthIndex?: number;
  classes?: SchoolClass[];
  students?: Student[];
  alerts?: ParentAlert[];
  interventions?: InterventionCase[];
  onRefreshData?: () => void;
}

const CAUSE_COLORS = ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6'];

export const MonthlyReport: React.FC<MonthlyReportProps> = ({
  report: initialReport,
  onSelectMonth,
  selectedMonthIndex = 9,
  classes: propClasses,
  students: propStudents,
  alerts: propAlerts,
  interventions: propInterventions,
  onRefreshData
}) => {
  // Data de hoje com fuso horário local correto
  const todayStr = getLocalTodayStr();

  // Estado do Filtro de Data: Inicia com a data de hoje (relatório diário por padrão)
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [isSingleDayMode, setIsSingleDayMode] = useState<boolean>(true);

  // Estados locais sincronizados diretamente com o Firestore
  const [reportClasses, setReportClasses] = useState<SchoolClass[]>(() => {
    if (propClasses && propClasses.length >= 10) return propClasses;
    const local = storageService.getClasses();
    return local && local.length >= 10 ? local : (propClasses || []);
  });

  const [reportStudents, setReportStudents] = useState<Student[]>(() => {
    if (propStudents && propStudents.length >= 50) return propStudents;
    const local = storageService.getStudents();
    return local && local.length >= 50 ? local : (propStudents || []);
  });

  const [reportAlerts, setReportAlerts] = useState<ParentAlert[]>(() => {
    if (propAlerts && propAlerts.length > 0) return propAlerts;
    return storageService.getAlerts();
  });

  const [reportInterventions, setReportInterventions] = useState<InterventionCase[]>(() => {
    if (propInterventions && propInterventions.length > 0) return propInterventions;
    return storageService.getInterventions();
  });

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    storageService.getAttendanceRecords()
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [classFilterSearch, setClassFilterSearch] = useState<string>('');

  // Estados da Modal Nominal de Alunos em Risco Crítico
  const [isCriticalModalOpen, setIsCriticalModalOpen] = useState<boolean>(false);
  const [criticalSearchQuery, setCriticalSearchQuery] = useState<string>('');
  const [criticalFilterOccurrences, setCriticalFilterOccurrences] = useState<'todos' | 'com_ocorrencia' | 'sem_ocorrencia'>('todos');

  // Atualiza estados caso as props mudem
  useEffect(() => {
    if (propClasses && propClasses.length >= 10) {
      setReportClasses(propClasses);
    }
  }, [propClasses]);

  useEffect(() => {
    if (propStudents && propStudents.length >= 50) {
      setReportStudents(propStudents);
    }
  }, [propStudents]);

  // Carrega registros de frequência e turmas diretamente do Firestore
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [cloudRecords, cloudClasses, cloudStudents, cloudAlerts, cloudInterventions] = await Promise.all([
        firestoreService.getAttendanceRecords().catch(() => []),
        firestoreService.getClasses().catch(() => []),
        firestoreService.getStudents().catch(() => []),
        firestoreService.getAlerts().catch(() => []),
        firestoreService.getInterventions().catch(() => []),
      ]);

      if (cloudClasses && cloudClasses.length > 0) {
        setReportClasses(cloudClasses);
        storageService.setClasses(cloudClasses);
      }
      if (cloudStudents && cloudStudents.length > 0) {
        setReportStudents(cloudStudents);
        storageService.setStudents(cloudStudents);
      }
      if (cloudAlerts && cloudAlerts.length > 0) {
        setReportAlerts(cloudAlerts);
        storageService.setAlerts(cloudAlerts);
      }
      if (cloudInterventions && cloudInterventions.length > 0) {
        setReportInterventions(cloudInterventions);
        storageService.setInterventions(cloudInterventions);
      }

      if (cloudRecords && cloudRecords.length > 0) {
        const local = storageService.getAttendanceRecords();
        const cloudIds = new Set(cloudRecords.map(r => r.id));
        const localOnly = local.filter(r => !cloudIds.has(r.id));
        const merged = [...cloudRecords, ...localOnly];
        setAttendanceRecords(merged);
        storageService.setAttendanceRecords(merged);
      } else {
        setAttendanceRecords(storageService.getAttendanceRecords());
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do Firestore para relatório pedagógico:', err);
      setAttendanceRecords(storageService.getAttendanceRecords());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Dados consolidados de turmas, alunos, alertas e intervenções
  const effectiveClasses = useMemo(() => {
    if (reportClasses && reportClasses.length > 0) return reportClasses;
    if (propClasses && propClasses.length > 0) return propClasses;
    return storageService.getClasses();
  }, [reportClasses, propClasses]);

  const effectiveStudents = useMemo(() => {
    if (reportStudents && reportStudents.length > 0) return reportStudents;
    if (propStudents && propStudents.length > 0) return propStudents;
    return storageService.getStudents();
  }, [reportStudents, propStudents]);

  const effectiveAlerts = useMemo(() => {
    if (reportAlerts && reportAlerts.length > 0) return reportAlerts;
    if (propAlerts && propAlerts.length > 0) return propAlerts;
    return storageService.getAlerts();
  }, [reportAlerts, propAlerts]);

  const effectiveInterventions = useMemo(() => {
    if (reportInterventions && reportInterventions.length > 0) return reportInterventions;
    if (propInterventions && propInterventions.length > 0) return propInterventions;
    return storageService.getInterventions();
  }, [reportInterventions, propInterventions]);

  // Conjunto de datas que contêm chamadas registradas (para indicador verde no calendário)
  const availableDatesWithAttendance = useMemo(() => {
    const dates = new Set<string>();
    attendanceRecords.forEach(r => {
      if (r.date) {
        dates.add(normalizeDateStr(r.date));
      }
    });
    return dates;
  }, [attendanceRecords]);

  // CÁLCULO DINÂMICO E REAL DO RELATÓRIO PEDAGÓGICO
  const liveReport = useMemo(() => {
    return calculatePedagogicalReport({
      startDate,
      endDate,
      classes: effectiveClasses,
      students: effectiveStudents,
      attendanceRecords,
      alerts: effectiveAlerts,
      interventions: effectiveInterventions
    });
  }, [startDate, endDate, effectiveClasses, effectiveStudents, attendanceRecords, effectiveAlerts, effectiveInterventions]);

  const handlePrint = () => {
    window.print();
  };

  const handleRefresh = async () => {
    if (onRefreshData) {
      onRefreshData();
    }
    await loadAllData();
  };

  // Exportação Geral para Planilha Excel/CSV (UTF-8 com BOM)
  const handleExportCSV = () => {
    const lines: string[] = [];
    const sep = ';';

    lines.push(`SigaEscola - Relatório Consolidado de Frequência e Assiduidade`);
    lines.push(`Período Avaliado${sep}"${formatDateRangeLabel(startDate, endDate)}"`);
    lines.push(`Dias Úteis Escolares (Seg-Sex)${sep}${liveReport.businessDaysCount || 1}`);
    lines.push(`Data e Hora da Extração${sep}"${new Date().toLocaleString('pt-BR')}"`);
    lines.push('');

    lines.push(`--- INDICADORES GERAIS DA UNIDADE ESCOLAR ---`);
    lines.push(`Métrica${sep}Valor`);
    lines.push(`Total de Alunos Matriculados${sep}${liveReport.totalEnrolled}`);
    lines.push(`Taxa Média Consolidada de Frequência${sep}"${liveReport.averageAttendanceRate}%"`);
    lines.push(`Total de Ausências Computadas${sep}${liveReport.totalAbsences}`);
    lines.push(`Estudantes em Frequência Crítica (< 75%)${sep}${liveReport.studentsWithCriticalAbsence}`);
    lines.push(`Reintegrações Efetivas da Busca Ativa${sep}${liveReport.successfulReintegrations}`);
    lines.push(`Casos em Acompanhamento${sep}${liveReport.activeSearchCasesCount}`);
    lines.push(`Alertas Enviados aos Pais/Responsáveis${sep}${liveReport.alertsDispatched}`);
    lines.push(`Alertas Confirmados / Respondidos${sep}${liveReport.alertsResponded}`);
    lines.push('');

    lines.push(`--- DESEMPENHO E ASSIDUIDADE POR TURMA ---`);
    lines.push(`Turma${sep}Total Alunos${sep}Presenças${sep}Faltas${sep}Taxa de Frequência (%)${sep}Alunos em Risco${sep}Status Chamada`);
    liveReport.riskByClass.forEach(c => {
      lines.push(`"${c.className}"${sep}${c.totalStudents}${sep}${c.presentCount || 0}${sep}${c.absentCount || 0}${sep}"${c.averageAttendance}%"${sep}${c.riskStudents}${sep}${c.isLaunched ? 'Concluída' : 'Pendente'}`);
    });
    lines.push('');

    lines.push(`--- LISTA NOMINAL DE ESTUDANTES EM RISCO CRÍTICO (< 75%) & OCORRÊNCIAS DISCIPLINARES ---`);
    lines.push(`Estudante${sep}RA${sep}Turma${sep}Frequência (%)${sep}Faltas Consecutivas${sep}Nível de Risco${sep}Ocorrências Disciplinares?${sep}Total Ocorrências${sep}Etapa Busca Ativa${sep}Responsável Legal${sep}Telefone do Responsável`);
    const criticalList = liveReport.criticalStudentsList || [];
    criticalList.forEach(s => {
      lines.push(`"${s.name}"${sep}"${s.ra}"${sep}"${s.className}"${sep}"${s.attendanceRate}%"${sep}${s.consecutiveAbsences}${sep}"${s.riskLevel}"${sep}"${s.hasDisciplinaryOccurrence ? 'SIM' : 'NÃO'}"${sep}${s.totalOccurrences}${sep}"${s.interventionStage || 'Não iniciado'}"${sep}"${s.guardianName || 'Não informado'}"${sep}"${s.guardianPhone || 'Não informado'}"`);
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SigaEscola_Relatorio_Pedagogico_${startDate}_a_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Exportação Específica da Lista Nominal de Alunos Críticos
  const handleExportCriticalCSV = () => {
    const lines: string[] = [];
    const sep = ';';
    lines.push(`SigaEscola - Lista Nominal de Estudantes em Frequência Crítica (< 75%)`);
    lines.push(`Período Avaliado${sep}"${formatDateRangeLabel(startDate, endDate)}"`);
    lines.push(`Dias Úteis Escolares (Seg-Sex)${sep}${liveReport.businessDaysCount || 1}`);
    lines.push(`Total de Alunos Críticos Identificados${sep}${liveReport.criticalStudentsList?.length || 0}`);
    lines.push(`Extraído em${sep}"${new Date().toLocaleString('pt-BR')}"`);
    lines.push('');
    lines.push(`Estudante${sep}RA${sep}Turma${sep}Frequência (%)${sep}Faltas Consecutivas${sep}Nível de Risco${sep}Ocorrências Disciplinares${sep}Qtd Ocorrências${sep}Etapa Busca Ativa${sep}Responsável Legal${sep}Telefone de Contato`);
    (liveReport.criticalStudentsList || []).forEach(s => {
      lines.push(`"${s.name}"${sep}"${s.ra}"${sep}"${s.className}"${sep}"${s.attendanceRate}%"${sep}${s.consecutiveAbsences}${sep}"${s.riskLevel}"${sep}"${s.hasDisciplinaryOccurrence ? 'SIM' : 'NÃO'}"${sep}${s.totalOccurrences}${sep}"${s.interventionStage || 'Pendente'}"${sep}"${s.guardianName || 'Não informado'}"${sep}"${s.guardianPhone || 'Não informado'}"`);
    });
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SigaEscola_Alunos_Criticos_${startDate}_a_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Contagem de turmas com chamada realizada no período selecionado
  const turmasLancadasCount = liveReport.riskByClass.filter(c => (c as any).isLaunched).length;
  const totalTurmas = effectiveClasses.length;
  const lancamentoCompleto = totalTurmas > 0 && turmasLancadasCount >= totalTurmas;

  // Turmas filtradas para a tabela analítica
  const filteredRiskClasses = liveReport.riskByClass.filter(c =>
    c.className.toLowerCase().includes(classFilterSearch.toLowerCase())
  );

  // Lista nominal de alunos críticos filtrada por busca e ocorrências
  const filteredCriticalStudents = useMemo(() => {
    const list = liveReport.criticalStudentsList || [];
    return list.filter(s => {
      const q = criticalSearchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.ra.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (criticalFilterOccurrences === 'com_ocorrencia') {
        return s.hasDisciplinaryOccurrence;
      }
      if (criticalFilterOccurrences === 'sem_ocorrencia') {
        return !s.hasDisciplinaryOccurrence;
      }
      return true;
    });
  }, [liveReport.criticalStudentsList, criticalSearchQuery, criticalFilterOccurrences]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Date Range Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
            <span>Diagnóstico Institucional em Tempo Real</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Relatório da Equipe Pedagógica & Assiduidade
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Análise consolidada com dados reais de chamadas, mapa de calor por turma e eficácia da Busca Ativa.
          </p>
        </div>

        {/* Controles de Data e Ações */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Calendário Único com Suporte a Dia Único (1 clique) e Sequência Preenchida */}
          <DateRangeCalendar
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end, isSingle) => {
              setStartDate(start);
              setEndDate(end);
              setIsSingleDayMode(isSingle);
            }}
            availableDatesWithAttendance={availableDatesWithAttendance}
          />

          {/* Botão Exportar Planilha (CSV / Excel) */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="p-2 sm:px-3 sm:py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            title="Exportar dados consolidados em planilha Excel/CSV com dias úteis e alunos críticos"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span className="hidden sm:inline">Exportar Planilha (CSV)</span>
            <span className="sm:hidden">CSV</span>
          </button>

          {/* Botão Atualizar / Sincronizar Nuvem */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            title="Sincronizar frequências diretamente da Nuvem Firestore"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>

          {/* Botão Imprimir */}
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Imprimir relatório analítico"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Banner Informativo de Frequência do Período */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
        lancamentoCompleto
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : turmasLancadasCount > 0
          ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
          : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            lancamentoCompleto ? 'bg-emerald-200 text-emerald-800' : 'bg-indigo-200 text-indigo-800'
          }`}>
            {lancamentoCompleto ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
          </div>
          <div>
            <div className="font-extrabold text-sm flex items-center gap-2 flex-wrap">
              <span>{formatDateRangeLabel(startDate, endDate)}</span>
              {isSingleDayMode ? (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 font-bold border border-current/20">
                  Relatório Diário
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 font-bold border border-current/20">
                  {liveReport.businessDaysCount || 1} dias úteis letivos
                </span>
              )}
            </div>
            <p className="mt-0.5 opacity-90">
              {turmasLancadasCount > 0
                ? `${turmasLancadasCount} de ${totalTurmas} turmas com chamada já registrada neste filtro (${liveReport.businessDaysCount || 1} dias úteis escolares considerados sem penalizar fins de semana).`
                : 'Nenhuma chamada encontrada para esta data. Selecione uma data com chamadas ou lance as frequências no painel.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-bold shrink-0">
          <span className="text-slate-600">Progresso de Lançamento:</span>
          <span className={`px-2.5 py-1 rounded-lg shadow-2xs font-extrabold border ${
            lancamentoCompleto
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-white text-slate-900 border-slate-200'
          }`}>
            {turmasLancadasCount} / {totalTurmas} turmas
          </span>
        </div>
      </div>

      {/* KPI Cards Strip com Dados Reais Calculados */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Taxa Média de Frequência</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-2xl font-extrabold ${
              liveReport.averageAttendanceRate >= 85
                ? 'text-emerald-700'
                : liveReport.averageAttendanceRate >= 75
                ? 'text-amber-700'
                : 'text-rose-700'
            }`}>
              {liveReport.averageAttendanceRate}%
            </span>
            <span className={`text-xs font-bold flex items-center gap-0.5 ${
              liveReport.averageAttendanceRate >= 75 ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {liveReport.averageAttendanceRate >= 75 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{liveReport.averageAttendanceRate >= 75 ? 'LDB ✓' : 'Abaixo'}</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {liveReport.totalAbsences} ausências computadas no filtro
          </div>
        </div>

        {/* Card Clicável com Acesso Direto à Lista Nominal e Cruzamento de Ocorrências */}
        <div
          onClick={() => setIsCriticalModalOpen(true)}
          className="bg-white border border-slate-200 hover:border-rose-400 hover:shadow-md transition-all rounded-xl p-4 shadow-xs cursor-pointer group relative overflow-hidden"
          title="Clique para abrir a lista nominal detalhada com RA, faltas e cruzamento de ocorrências disciplinares"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-slate-500">Alunos em Frequência Crítica</div>
            <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-bold group-hover:bg-rose-100 transition-colors flex items-center gap-0.5">
              <span>Nominal</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-rose-700">
              {liveReport.studentsWithCriticalAbsence}
            </span>
            <span className="text-xs text-rose-600 font-semibold">&lt; 75% assiduidade</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between flex-wrap gap-1">
            <span>Prioridade Busca Ativa</span>
            {liveReport.criticalStudentsList && liveReport.criticalStudentsList.filter(s => s.hasDisciplinaryOccurrence).length > 0 && (
              <span className="text-amber-700 font-bold text-[10px] bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                ⚠️ {liveReport.criticalStudentsList.filter(s => s.hasDisciplinaryOccurrence).length} c/ ocorrências
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Casos com Retorno Efetivo</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-emerald-700">
              {liveReport.successfulReintegrations}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">reintegrados</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            De {liveReport.activeSearchCasesCount} casos em acompanhamento
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Alertas Enviados aos Pais</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-indigo-700">
              {liveReport.alertsDispatched}
            </span>
            <span className="text-xs text-indigo-600 font-semibold">disparos</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {liveReport.alertsResponded} respondidos com retorno da família
          </div>
        </div>
      </div>

      {/* Gráficos Analíticos com Dados Reais */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico 1: Frequência Real por Turma */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Frequência Real por Turma (%)
              </h3>
              <p className="text-xs text-slate-500">
                Cruzamento das chamadas realizadas para o período selecionado
              </p>
            </div>
            <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold">
              Meta Legal: &gt; 75%
            </span>
          </div>

          <div className="h-64 w-full">
            {liveReport.riskByClass.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={liveReport.riskByClass}
                  margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="className"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(value: any, name: string, props: any) => [
                      `${value}% (${props.payload.totalStudents} alunos)`,
                      'Frequência'
                    ]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Bar
                    dataKey="averageAttendance"
                    name="Frequência (%)"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                  >
                    {liveReport.riskByClass.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.averageAttendance >= 85
                            ? '#10b981'
                            : entry.averageAttendance >= 75
                            ? '#6366f1'
                            : '#f43f5e'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Nenhuma turma cadastrada.
              </div>
            )}
          </div>
        </div>

        {/* Gráfico 2: Causas Primárias da Infrequência & Evasão */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="mb-3">
            <h3 className="font-bold text-slate-900 text-sm">
              Causas Primárias da Infrequência & Evasão
            </h3>
            <p className="text-xs text-slate-500">
              Mapeamento dinâmico cruzado com justificativas e intervenções
            </p>
          </div>

          <div className="space-y-3 mt-4">
            {liveReport.absenceCausesDistribution.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium truncate pr-2">{item.cause}</span>
                  <span className="font-bold text-slate-900 shrink-0">{item.percentage}% ({item.count})</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: CAUSE_COLORS[idx % CAUSE_COLORS.length]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
            <div className="font-bold flex items-center gap-1.5 mb-0.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-700" />
              <span>Diagnóstico Automático:</span>
            </div>
            Os dados indicam que o combate ao absenteísmo depende do monitoramento ágil de atestados e apoio ao transporte escolar nas primeiras aulas.
          </div>
        </div>
      </div>

      {/* Tabela Analítica Detalhada por Turma (Transparência Total) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-600" />
              <span>Detalhamento Real por Turma no Período</span>
            </h3>
            <p className="text-xs text-slate-500">
              Verifique o status do lançamento de cada turma e os índices apurados
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={classFilterSearch}
              onChange={e => setClassFilterSearch(e.target.value)}
              placeholder="Buscar turma..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
              <tr>
                <th className="py-3 px-4">Turma</th>
                <th className="py-3 px-3 text-center">Status Chamada</th>
                <th className="py-3 px-3 text-center">Matriculados</th>
                <th className="py-3 px-3 text-center">Presenças</th>
                <th className="py-3 px-3 text-center">Ausências</th>
                <th className="py-3 px-3 text-center">Frequência Apurada</th>
                <th className="py-3 px-3 text-center">Alunos em Alerta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredRiskClasses.length > 0 ? (
                filteredRiskClasses.map((clsItem: any) => (
                  <tr key={clsItem.classId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {clsItem.className}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {clsItem.isLaunched ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Lançada</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Pendente</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-800">
                      {clsItem.totalStudents}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-700">
                      {clsItem.isLaunched ? (clsItem.presentCount ?? 0) : '-'}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-rose-700">
                      {clsItem.isLaunched ? (clsItem.absentCount ?? 0) : '-'}
                    </td>
                    <td className="py-3 px-3 text-center font-extrabold">
                      <span className={`px-2 py-0.5 rounded-md ${
                        clsItem.averageAttendance >= 85
                          ? 'bg-emerald-50 text-emerald-700'
                          : clsItem.averageAttendance >= 75
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {clsItem.averageAttendance}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {clsItem.riskStudents > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                          {clsItem.riskStudents} em risco
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400 text-xs">
                    Nenhuma turma localizada com o filtro informado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parecer Técnico da Equipe Pedagógica (Construído Dinamicamente com Dados Reais) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 font-bold text-slate-900 text-base border-b border-slate-100 pb-3">
          <FileText className="w-5 h-5 text-indigo-600" />
          <span>Parecer Técnico da Equipe Pedagógica & Ações Estratégicas</span>
        </div>

        <div className="space-y-2.5 text-sm text-slate-700 leading-relaxed">
          {liveReport.pedagogicalInsights.map((insight, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <p className="text-xs sm:text-sm text-slate-800 font-medium">{insight}</p>
            </div>
          ))}
        </div>

        {/* Checklist de Intervenção Rápida */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            Plano de Intervenção Rápida para o Próximo Ciclo:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
              <div className="font-bold text-indigo-900 mb-1">1. Plantão de Busca Ativa In Loco</div>
              <p className="text-slate-600 text-[11px]">
                Visitas domiciliares prioritárias aos alunos da lista crítica com mais de 3 faltas consecutivas.
              </p>
            </div>

            <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
              <div className="font-bold text-emerald-900 mb-1">2. Articulação CRAS / Transporte</div>
              <p className="text-slate-600 text-[11px]">
                Acompanhamento das linhas de transporte escolar e encaminhamento de famílias vulneráveis para suporte de assistência social.
              </p>
            </div>

            <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100">
              <div className="font-bold text-purple-900 mb-1">3. Acolhimento & Recomposição</div>
              <p className="text-slate-600 text-[11px]">
                Oficina de nivelamento e acolhimento pedagógico para estudantes reintegrados à rotina de sala de aula.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Nominal de Alunos em Frequência Crítica & Cruzamento de Ocorrências */}
      {isCriticalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Cabeçalho da Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      Lista Nominal: Alunos em Frequência Crítica (&lt; 75%)
                    </h3>
                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                      {liveReport.studentsWithCriticalAbsence} Alunos
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cruzamento nominal com a base de Ocorrências Disciplinares e status de Busca Ativa • {formatDateRangeLabel(startDate, endDate)} ({liveReport.businessDaysCount || 1} dias úteis escolares).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCriticalCSV}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                  title="Baixar lista nominal em arquivo CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCriticalModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Fechar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Barra de Filtros e Busca Rápida */}
            <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Barra de Busca */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar por aluno, RA ou turma..."
                  value={criticalSearchQuery}
                  onChange={e => setCriticalSearchQuery(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              {/* Filtros por Ocorrência Disciplinar */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setCriticalFilterOccurrences('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    criticalFilterOccurrences === 'todos'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Todos ({liveReport.criticalStudentsList?.length || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setCriticalFilterOccurrences('com_ocorrencia')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                    criticalFilterOccurrences === 'com_ocorrencia'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span>⚠️ Com Ocorrências ({liveReport.criticalStudentsList?.filter(s => s.hasDisciplinaryOccurrence).length || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCriticalFilterOccurrences('sem_ocorrencia')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    criticalFilterOccurrences === 'sem_ocorrencia'
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Sem Ocorrências
                </button>
              </div>
            </div>

            {/* Tabela Nominal */}
            <div className="flex-1 overflow-y-auto">
              {filteredCriticalStudents.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">
                    Nenhum aluno atende aos filtros selecionados
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Não há alunos em frequência crítica com os critérios de busca aplicados.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-4">Estudante & RA</th>
                      <th className="py-3 px-4">Turma</th>
                      <th className="py-3 px-4 text-center">Frequência</th>
                      <th className="py-3 px-4 text-center">Faltas Consecutivas</th>
                      <th className="py-3 px-4">Ocorrências Disciplinares</th>
                      <th className="py-3 px-4">Responsável Legal</th>
                      <th className="py-3 px-4">Etapa Busca Ativa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCriticalStudents.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{student.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">RA: {student.ra}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {student.className}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs">
                            {student.attendanceRate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                            student.consecutiveAbsences >= 4
                              ? 'bg-rose-100 text-rose-900 font-extrabold'
                              : student.consecutiveAbsences >= 2
                              ? 'bg-amber-100 text-amber-900'
                              : 'text-slate-600'
                          }`}>
                            {student.consecutiveAbsences} {student.consecutiveAbsences === 1 ? 'dia' : 'dias'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {student.hasDisciplinaryOccurrence ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                              <span>{student.totalOccurrences} {student.totalOccurrences === 1 ? 'ocorrência' : 'ocorrências'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sem registros</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800 font-medium">{student.guardianName || 'Não cadastrado'}</div>
                          {student.guardianPhone && (
                            <div className="text-[11px] text-slate-500">{student.guardianPhone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {student.interventionStage ? student.interventionStage.replace('_', ' ') : 'Em Triagem'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Rodapé da Modal */}
            <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Exibindo {filteredCriticalStudents.length} de {liveReport.criticalStudentsList?.length || 0} alunos críticos
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCriticalCSV}
                  className="sm:hidden px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs"
                >
                  Baixar CSV
                </button>
                <button
                  type="button"
                  onClick={() => setIsCriticalModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
