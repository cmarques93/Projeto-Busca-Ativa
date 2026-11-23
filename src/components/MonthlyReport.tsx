import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Printer,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Users,
  Building,
  Sparkles,
  RefreshCw,
  Search,
  Check,
  Clock,
  ChevronRight,
  Download,
  X,
  ShieldAlert,
  AlertOctagon,
  DoorOpen,
  Laptop,
  MessageSquare,
  Archive,
  Lock,
  Wrench
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid
} from 'recharts';
import {
  MonthlyPedagogicalReport,
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  AttendanceRecord,
  GateRecord,
  EquipmentItem,
  TeacherScheduleSlot
} from '../types';
import { storageService } from '../data/storageService';
import { firestoreService, normalizeDateStr } from '../lib/firestoreService';
import { carregarOcorrenciasSeguro, carregarTabletsSeguro } from '../lib/sheetsSyncService';
import { DateRangeCalendar } from './DateRangeCalendar';
import {
  calculatePedagogicalReport,
  formatDateRangeLabel,
  getLocalTodayStr
} from '../utils/reportCalculator';
import { getCalendarMetricsSummary } from '../utils/calendarUtils';

interface MonthlyReportProps {
  report?: MonthlyPedagogicalReport | null;
  onSelectMonth?: (monthIndex: number) => void;
  selectedMonthIndex?: number;
  classes?: SchoolClass[];
  students?: Student[];
  allStudents?: Student[];
  alerts?: ParentAlert[];
  interventions?: InterventionCase[];
  onRefreshData?: () => void;
}

type ReportTab =
  | 'frequencia'
  | 'busca_ativa'
  | 'ocorrencias'
  | 'equipamentos'
  | 'portaria'
  | 'transferidos';

const CAUSE_COLORS = ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6'];

function parseAnyDateToIso(raw?: string): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const datePart = trimmed.split(/[T,\s]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(datePart)) {
    const [d, m, y] = datePart.split('/');
    return `${y}-${m}-${d}`;
  }
  const brMatch = trimmed.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return '';
}

function isIsoInRange(iso: string, start: string, end: string): boolean {
  if (!iso) return false;
  return iso >= start && iso <= end;
}

export const MonthlyReport: React.FC<MonthlyReportProps> = ({
  classes: propClasses,
  students: propStudents,
  allStudents: propAllStudents,
  alerts: propAlerts,
  interventions: propInterventions,
  onRefreshData
}) => {
  const todayStr = getLocalTodayStr();

  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('frequencia');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [isSingleDayMode, setIsSingleDayMode] = useState<boolean>(true);

  const [reportClasses, setReportClasses] = useState<SchoolClass[]>(() => {
    if (propClasses && propClasses.length >= 10) return propClasses;
    const local = storageService.getClasses();
    return local && local.length >= 10 ? local : (propClasses || []);
  });

  const [reportStudents, setReportStudents] = useState<Student[]>(() => {
    if (propAllStudents && propAllStudents.length > 0) return propAllStudents;
    const local = storageService.getStudents();
    if (local && local.length > 0) return local;
    return propStudents || [];
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
  const [gateRecords, setGateRecords] = useState<GateRecord[]>(() =>
    storageService.getGateRecords()
  );
  const [ocorrenciasData, setOcorrenciasData] = useState<{
    registros: any[];
    tratativasFamilia: any[];
  }>({ registros: [], tratativasFamilia: [] });
  const [equipamentosData, setEquipamentosData] = useState<{
    agendamentos: any[];
    equipamentos: EquipmentItem[];
    maxTablets?: number;
  }>({ agendamentos: [], equipamentos: [], maxTablets: 23 });
  const [teacherSchedules, setTeacherSchedules] = useState<TeacherScheduleSlot[]>(() =>
    storageService.getTeacherSchedules()
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [classFilterSearch, setClassFilterSearch] = useState<string>('');
  const [moduleSearchQuery, setModuleSearchQuery] = useState<string>('');

  // Modal Nominal de Alunos em Risco Crítico
  const [isCriticalModalOpen, setIsCriticalModalOpen] = useState<boolean>(false);
  const [criticalSearchQuery, setCriticalSearchQuery] = useState<string>('');
  const [criticalFilterOccurrences, setCriticalFilterOccurrences] = useState<
    'todos' | 'com_ocorrencia' | 'sem_ocorrencia'
  >('todos');

  useEffect(() => {
    if (propClasses && propClasses.length >= 10) {
      setReportClasses(propClasses);
    }
  }, [propClasses]);

  useEffect(() => {
    if (propAllStudents && propAllStudents.length > 0) {
      setReportStudents(propAllStudents);
    } else if (propStudents && propStudents.length >= 50) {
      const localAll = storageService.getStudents();
      const transferredLocal = localAll.filter(s => s.status === 'transferido');
      const ids = new Set(propStudents.map(s => s.id));
      setReportStudents([...propStudents, ...transferredLocal.filter(t => !ids.has(t.id))]);
    }
  }, [propAllStudents, propStudents]);

  const loadAllData = async () => {
    setIsLoading(true);
    const sId = storageService.getActiveSchoolId();
    try {
      const [
        cloudRecords,
        cloudClasses,
        cloudStudents,
        cloudAlerts,
        cloudInterventions,
        cloudGate,
        ocorrRes,
        tabletsRes,
        cloudSchedules
      ] = await Promise.all([
        firestoreService.getAttendanceRecords(undefined, sId).catch(() => []),
        firestoreService.getClasses(sId).catch(() => []),
        firestoreService.getStudents(sId).catch(() => []),
        firestoreService.getAlerts(sId).catch(() => []),
        firestoreService.getInterventions(sId).catch(() => []),
        firestoreService.getGateRecords(undefined, sId).catch(() => []),
        carregarOcorrenciasSeguro().catch(() => ({ data: null })),
        carregarTabletsSeguro(propClasses || []).catch(() => ({ data: null })),
        firestoreService.getTeacherSchedules(sId).catch(() => []),
      ]);

      if (cloudClasses && cloudClasses.length > 0) {
        setReportClasses(cloudClasses);
        storageService.setClasses(cloudClasses, sId);
      }
      if (cloudStudents && cloudStudents.length > 0) {
        setReportStudents(cloudStudents);
        storageService.setStudents(cloudStudents, sId);
      }
      if (cloudAlerts && cloudAlerts.length > 0) {
        setReportAlerts(cloudAlerts);
        storageService.setAlerts(cloudAlerts, sId);
      }
      if (cloudInterventions && cloudInterventions.length > 0) {
        setReportInterventions(cloudInterventions);
        storageService.setInterventions(cloudInterventions, sId);
      }

      if (cloudRecords && cloudRecords.length > 0) {
        const local = storageService.getAttendanceRecords(undefined, undefined, sId);
        const cloudIds = new Set(cloudRecords.map(r => r.id));
        const localOnly = local.filter(r => !cloudIds.has(r.id));
        const merged = [...cloudRecords, ...localOnly];
        setAttendanceRecords(merged);
        storageService.setAttendanceRecords(merged, sId);
      } else {
        setAttendanceRecords(storageService.getAttendanceRecords(undefined, undefined, sId));
      }

      if (cloudGate && cloudGate.length > 0) {
        const localGate = storageService.getGateRecords(undefined, undefined, sId);
        const cloudIds = new Set(cloudGate.map(g => g.id));
        const mergedGate = [...cloudGate, ...localGate.filter(g => !cloudIds.has(g.id))];
        setGateRecords(mergedGate);
        storageService.setGateRecords(mergedGate, sId);
      } else {
        setGateRecords(storageService.getGateRecords(undefined, undefined, sId));
      }

      if (ocorrRes?.data) {
        setOcorrenciasData({
          registros: Array.isArray(ocorrRes.data.registros) ? ocorrRes.data.registros : [],
          tratativasFamilia: Array.isArray(ocorrRes.data.tratativasFamilia)
            ? ocorrRes.data.tratativasFamilia
            : [],
        });
      }

      if (tabletsRes?.data) {
        const rawEq = Array.isArray(tabletsRes.data.equipamentos) ? tabletsRes.data.equipamentos : [];
        const equips: EquipmentItem[] =
          rawEq.length > 0
            ? rawEq
            : Array.from({ length: tabletsRes.data.maxTablets || 23 }, (_, idx) => ({
                id: `eq-tablet-${String(idx + 1).padStart(2, '0')}`,
                nome: `Tablet ${String(idx + 1).padStart(2, '0')}`,
                tipo: 'Tablet',
                patrimonio: '',
                condicao: 'em_uso' as const,
              }));
        setEquipamentosData({
          agendamentos: Array.isArray(tabletsRes.data.agendamentos)
            ? tabletsRes.data.agendamentos
            : [],
          equipamentos: equips,
          maxTablets: tabletsRes.data.maxTablets,
        });
      }

      if (cloudSchedules && cloudSchedules.length > 0) {
        setTeacherSchedules(cloudSchedules);
        storageService.setTeacherSchedules(cloudSchedules, sId);
      } else {
        setTeacherSchedules(storageService.getTeacherSchedules(sId));
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do relatório pedagógico:', err);
      setAttendanceRecords(storageService.getAttendanceRecords());
      setGateRecords(storageService.getGateRecords());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const effectiveClasses = useMemo(() => {
    if (reportClasses && reportClasses.length > 0) return reportClasses;
    if (propClasses && propClasses.length > 0) return propClasses;
    return storageService.getClasses();
  }, [reportClasses, propClasses]);

  const effectiveAllStudents = useMemo(() => {
    if (reportStudents && reportStudents.length > 0) return reportStudents;
    if (propAllStudents && propAllStudents.length > 0) return propAllStudents;
    const local = storageService.getStudents();
    if (local && local.length > 0) return local;
    return propStudents || [];
  }, [reportStudents, propAllStudents, propStudents]);

  const effectiveActiveStudents = useMemo(
    () => effectiveAllStudents.filter(s => s.status !== 'transferido'),
    [effectiveAllStudents]
  );

  const transferredStudents = useMemo(
    () => effectiveAllStudents.filter(s => s.status === 'transferido'),
    [effectiveAllStudents]
  );

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

  const calendarConfig = useMemo(() => storageService.getSchoolCalendar(), [isLoading]);
  const calendarSummary = useMemo(() => getCalendarMetricsSummary(calendarConfig), [calendarConfig]);

  const availableDatesWithAttendance = useMemo(() => {
    const dates = new Set<string>();
    attendanceRecords.forEach(r => {
      if (r.date) dates.add(normalizeDateStr(r.date));
    });
    return dates;
  }, [attendanceRecords]);

  // 1. Relatório de Frequências
  const liveReport = useMemo(() => {
    return calculatePedagogicalReport({
      startDate,
      endDate,
      classes: effectiveClasses,
      students: effectiveActiveStudents,
      attendanceRecords,
      alerts: effectiveAlerts,
      interventions: effectiveInterventions,
    });
  }, [
    startDate,
    endDate,
    effectiveClasses,
    effectiveActiveStudents,
    attendanceRecords,
    effectiveAlerts,
    effectiveInterventions,
  ]);

  // 2. Relatório de Busca Ativa & Alertas no Período
  const activeSearchStats = useMemo(() => {
    const alertsInRange = effectiveAlerts.filter(a =>
      isIsoInRange(parseAnyDateToIso(a.sentAt), startDate, endDate)
    );
    const byChannel = {
      whatsapp: alertsInRange.filter(a => a.channel === 'whatsapp').length,
      ligacao: alertsInRange.filter(a => a.channel === 'ligacao').length,
      sms: alertsInRange.filter(a => a.channel === 'sms').length,
    };
    const byStatus = {
      enviado: alertsInRange.filter(a => a.status === 'enviado').length,
      visualizado: alertsInRange.filter(a => a.status === 'visualizado').length,
      respondido: alertsInRange.filter(a => a.status === 'respondido').length,
    };

    const attendanceInRange = attendanceRecords.filter(r =>
      isIsoInRange(normalizeDateStr(r.date), startDate, endDate)
    );
    const justifiedInRange = attendanceInRange.filter(r => r.status === 'justificada');
    const medicalInRange = attendanceInRange.filter(
      r => r.status === 'atestado' || Boolean(r.medicalCertificate)
    );

    const interventionsByStage = new Map<string, number>();
    effectiveInterventions.forEach(c => {
      const stage = c.stage || 'sem_etapa';
      interventionsByStage.set(stage, (interventionsByStage.get(stage) || 0) + 1);
    });

    return {
      alertsInRange,
      byChannel,
      byStatus,
      justifiedInRange,
      medicalInRange,
      interventionsByStage: Array.from(interventionsByStage.entries()),
    };
  }, [effectiveAlerts, attendanceRecords, effectiveInterventions, startDate, endDate]);

  // 3. Relatório de Ocorrências & Mediação no Período
  const occurrencesStats = useMemo(() => {
    const q = moduleSearchQuery.trim().toLowerCase();
    const inRange = (ocorrenciasData.registros || []).filter(reg => {
      const iso = parseAnyDateToIso(reg.criadoEm || reg.dataPreenchimento || reg.data);
      if (iso && !isIsoInRange(iso, startDate, endDate)) return false;
      if (!iso) return false;
      return true;
    });

    const filtered = inRange.filter(reg => {
      if (!q) return true;
      return (
        (reg.estudante || '').toLowerCase().includes(q) ||
        (reg.turma || '').toLowerCase().includes(q) ||
        (reg.professor || '').toLowerCase().includes(q) ||
        (reg.ocorrencia || '').toLowerCase().includes(q)
      );
    });

    const pendentes = inRange.filter(r => !r.mediacao || !String(r.mediacao).trim()).length;
    const concluidas = inRange.filter(
      r => (r.status || '').toLowerCase().includes('conclu') || Boolean(r.mediacao && String(r.mediacao).trim())
    ).length;

    const byTurma = new Map<string, number>();
    const byProfessor = new Map<string, number>();
    const byMotivo = new Map<string, number>();

    inRange.forEach(r => {
      const t = r.turma || 'Sem Turma';
      byTurma.set(t, (byTurma.get(t) || 0) + 1);
      const p = r.professor || 'Não informado';
      byProfessor.set(p, (byProfessor.get(p) || 0) + 1);
      const m = (r.ocorrencia || 'Não especificado').split(':')[0].trim();
      byMotivo.set(m, (byMotivo.get(m) || 0) + 1);
    });

    const tratativasInRange = (ocorrenciasData.tratativasFamilia || []).filter(tf => {
      const iso = parseAnyDateToIso(tf.data || tf.criadoEm);
      return iso ? isIsoInRange(iso, startDate, endDate) : false;
    });

    return {
      totalInRange: inRange.length,
      filtered,
      pendentes,
      concluidas,
      tratativasInRange,
      topTurmas: Array.from(byTurma.entries()).sort((a, b) => b[1] - a[1]),
      topProfessores: Array.from(byProfessor.entries()).sort((a, b) => b[1] - a[1]),
      topMotivos: Array.from(byMotivo.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [ocorrenciasData, startDate, endDate, moduleSearchQuery]);

  // 4. Relatório de Equipamentos, Condição & Agendamentos
  const equipmentStats = useMemo(() => {
    const q = moduleSearchQuery.trim().toLowerCase();
    const equips = equipamentosData.equipamentos || [];
    const condCounts = {
      em_uso: equips.filter(e => e.condicao === 'em_uso').length,
      quebrado: equips.filter(e => e.condicao === 'quebrado').length,
      em_manutencao: equips.filter(e => e.condicao === 'em_manutencao').length,
    };

    const byTypeInventory = new Map<
      string,
      { total: number; em_uso: number; quebrado: number; em_manutencao: number }
    >();
    equips.forEach(eq => {
      const t = (eq.tipo || 'Tablet').trim();
      const entry = byTypeInventory.get(t) || { total: 0, em_uso: 0, quebrado: 0, em_manutencao: 0 };
      entry.total += 1;
      if (eq.condicao === 'quebrado') entry.quebrado += 1;
      else if (eq.condicao === 'em_manutencao') entry.em_manutencao += 1;
      else entry.em_uso += 1;
      byTypeInventory.set(t, entry);
    });

    const bookingsInRange = (equipamentosData.agendamentos || []).filter(ag => {
      const iso = parseAnyDateToIso(ag.data);
      return iso ? isIsoInRange(iso, startDate, endDate) : false;
    });

    const filteredBookings = bookingsInRange.filter(ag => {
      if (!q) return true;
      return (
        (ag.professor || '').toLowerCase().includes(q) ||
        (ag.turma || '').toLowerCase().includes(q) ||
        (ag.equipmentType || 'Tablet').toLowerCase().includes(q) ||
        (ag.aula || '').toLowerCase().includes(q)
      );
    });

    const totalUnitsBooked = bookingsInRange.reduce(
      (acc, cur) => acc + (Number(cur.quantity ?? cur.tablets) || 0),
      0
    );
    const byTeacherBookings = new Map<string, { count: number; units: number }>();
    const byTypeBookings = new Map<string, { count: number; units: number }>();

    bookingsInRange.forEach(ag => {
      const qty = Number(ag.quantity ?? ag.tablets) || 0;
      const prof = ag.professor || 'Não informado';
      const tp = (ag.equipmentType || 'Tablet').trim();
      const pStats = byTeacherBookings.get(prof) || { count: 0, units: 0 };
      pStats.count += 1;
      pStats.units += qty;
      byTeacherBookings.set(prof, pStats);

      const tStats = byTypeBookings.get(tp) || { count: 0, units: 0 };
      tStats.count += 1;
      tStats.units += qty;
      byTypeBookings.set(tp, tStats);
    });

    const platformLockedSlots = teacherSchedules.filter(s => s.hasPlatform);

    return {
      totalEquipments: equips.length,
      condCounts,
      byTypeInventory: Array.from(byTypeInventory.entries()),
      bookingsInRange,
      filteredBookings,
      totalUnitsBooked,
      byTeacherBookings: Array.from(byTeacherBookings.entries()).sort((a, b) => b[1].count - a[1].count),
      byTypeBookings: Array.from(byTypeBookings.entries()).sort((a, b) => b[1].units - a[1].units),
      platformLockedSlots,
    };
  }, [equipamentosData, teacherSchedules, startDate, endDate, moduleSearchQuery]);

  // 5. Relatório de Portaria (Entradas & Saídas)
  const gateStats = useMemo(() => {
    const q = moduleSearchQuery.trim().toLowerCase();
    const inRange = gateRecords.filter(g =>
      isIsoInRange(parseAnyDateToIso(g.date), startDate, endDate)
    );
    const filtered = inRange.filter(g => {
      if (!q) return true;
      const periodLabel = g.classPeriodName || (g as any).periodName || '';
      const guardianLabel = g.guardianOrAuthorizedPerson || (g as any).authorizedBy || '';
      return (
        (g.studentName || '').toLowerCase().includes(q) ||
        (g.className || '').toLowerCase().includes(q) ||
        (g.reason || '').toLowerCase().includes(q) ||
        periodLabel.toLowerCase().includes(q) ||
        guardianLabel.toLowerCase().includes(q)
      );
    });
    const entradas = inRange.filter(g => g.type === 'entrada_tardia').length;
    const saidas = inRange.filter(g => g.type === 'saida_antecipada').length;

    const byPeriod = new Map<string, number>();
    inRange.forEach(g => {
      const p = g.classPeriodName || (g as any).periodName || 'Horário não vinculado';
      byPeriod.set(p, (byPeriod.get(p) || 0) + 1);
    });

    return {
      total: inRange.length,
      entradas,
      saidas,
      filtered,
      byPeriod: Array.from(byPeriod.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [gateRecords, startDate, endDate, moduleSearchQuery]);

  const handlePrint = () => {
    window.print();
  };

  const handleRefresh = async () => {
    if (onRefreshData) onRefreshData();
    await loadAllData();
  };

  // Exportação Geral Unificada para CSV (Todos os módulos)
  const handleExportCSV = () => {
    const lines: string[] = [];
    const sep = ';';

    lines.push(`SigaEscola - Relatórios Pedagógicos Unificados`);
    lines.push(`Período Avaliado${sep}"${formatDateRangeLabel(startDate, endDate)}"`);
    lines.push(`Dias Úteis Escolares${sep}${liveReport.businessDaysCount || 1}`);
    lines.push(`Data e Hora da Extração${sep}"${new Date().toLocaleString('pt-BR')}"`);
    lines.push('');

    lines.push(`--- 1. INDICADORES DE FREQUÊNCIA E BUSCA ATIVA ---`);
    lines.push(`Métrica${sep}Valor`);
    lines.push(`Estudantes Ativos${sep}${liveReport.totalEnrolled}`);
    lines.push(`Taxa Média de Frequência${sep}"${liveReport.averageAttendanceRate}%"`);
    lines.push(`Ausências Computadas no Período${sep}${liveReport.totalAbsences}`);
    lines.push(`Estudantes em Risco Crítico (<75%)${sep}${liveReport.studentsWithCriticalAbsence}`);
    lines.push(`Alertas Enviados no Período${sep}${activeSearchStats.alertsInRange.length}`);
    lines.push(`Casos de Busca Ativa${sep}${effectiveInterventions.length}`);
    lines.push(`Reintegrações Efetivas${sep}${liveReport.successfulReintegrations}`);
    lines.push('');

    lines.push(`--- 2. ASSIDUIDADE POR TURMA ---`);
    lines.push(`Turma${sep}Alunos${sep}Presenças${sep}Faltas${sep}Frequência (%)${sep}Em Risco${sep}Chamada`);
    liveReport.riskByClass.forEach(c => {
      lines.push(
        `"${c.className}"${sep}${c.totalStudents}${sep}${c.presentCount || 0}${sep}${c.absentCount || 0}${sep}"${c.averageAttendance}%"${sep}${c.riskStudents}${sep}${c.isLaunched ? 'Concluída' : 'Pendente'}`
      );
    });
    lines.push('');

    lines.push(`--- 3. OCORRÊNCIAS NO PERÍODO (${occurrencesStats.totalInRange}) ---`);
    lines.push(`Data${sep}Estudante${sep}Turma${sep}Professor${sep}Motivo${sep}Status${sep}Mediação`);
    occurrencesStats.filtered.forEach(o => {
      lines.push(
        `"${o.criadoEm || o.dataPreenchimento || ''}"${sep}"${o.estudante || ''}"${sep}"${o.turma || ''}"${sep}"${o.professor || ''}"${sep}"${o.ocorrencia || ''}"${sep}"${o.status || ''}"${sep}"${(o.mediacao || '').replace(/"/g, '""')}"`
      );
    });
    lines.push('');

    lines.push(`--- 4. EQUIPAMENTOS: INVENTÁRIO POR CONDIÇÃO (${equipmentStats.totalEquipments}) ---`);
    lines.push(`Tipo${sep}Total${sep}1. Em Uso${sep}2. Quebrado${sep}3. Em manutenção`);
    equipmentStats.byTypeInventory.forEach(([tipo, st]) => {
      lines.push(`"${tipo}"${sep}${st.total}${sep}${st.em_uso}${sep}${st.quebrado}${sep}${st.em_manutencao}`);
    });
    lines.push('');

    lines.push(`--- 5. AGENDAMENTOS DE EQUIPAMENTOS NO PERÍODO (${equipmentStats.bookingsInRange.length}) ---`);
    lines.push(`Data${sep}Aula${sep}Tipo de Equipamento${sep}Quantidade${sep}Turma${sep}Professor`);
    equipmentStats.bookingsInRange.forEach(ag => {
      lines.push(
        `"${ag.data || ''}"${sep}"${ag.aula || ''}"${sep}"${ag.equipmentType || 'Tablet'}"${sep}${ag.quantity ?? ag.tablets ?? 0}${sep}"${ag.turma || ''}"${sep}"${ag.professor || ''}"`
      );
    });
    lines.push('');

    lines.push(`--- 6. PORTARIA NO PERÍODO (${gateStats.total}) ---`);
    lines.push(`Data${sep}Hora${sep}Tipo${sep}Estudante${sep}Turma${sep}Aula/Intervalo${sep}Motivo${sep}Responsável`);
    gateStats.filtered.forEach(g => {
      const periodLabel = g.classPeriodName || (g as any).periodName || '';
      const guardianLabel = g.guardianOrAuthorizedPerson || (g as any).authorizedBy || g.recordedBy || '';
      lines.push(
        `"${g.date}"${sep}"${g.time}"${sep}"${g.type === 'entrada_tardia' ? 'Entrada Tardia' : 'Saída Antecipada'}"${sep}"${g.studentName}"${sep}"${g.className}"${sep}"${periodLabel}"${sep}"${g.reason || ''}"${sep}"${guardianLabel}"`
      );
    });
    lines.push('');

    lines.push(`--- 7. ESTUDANTES TRANSFERIDOS (${transferredStudents.length}) ---`);
    lines.push(`Estudante${sep}RA${sep}Turma Origem${sep}Data Transferência${sep}Destino${sep}Motivo${sep}Total Faltas`);
    transferredStudents.forEach(s => {
      lines.push(
        `"${s.name}"${sep}"${s.ra}"${sep}"${s.className}"${sep}"${s.transferredAt || (s as any).transferDate || ''}"${sep}"${s.transferDestination || ''}"${sep}"${s.transferReason || ''}"${sep}${s.totalAbsences || 0}`
      );
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SigaEscola_Relatorios_Pedagogicos_${startDate}_a_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCriticalCSV = () => {
    const lines: string[] = [];
    const sep = ';';
    lines.push(`SigaEscola - Lista Nominal de Estudantes em Frequência Crítica (< 75%)`);
    lines.push(`Período Avaliado${sep}"${formatDateRangeLabel(startDate, endDate)}"`);
    lines.push('');
    lines.push(`Estudante${sep}RA${sep}Turma${sep}Frequência (%)${sep}Faltas Consecutivas${sep}Nível de Risco${sep}Ocorrências Disciplinares${sep}Qtd Ocorrências${sep}Etapa Busca Ativa${sep}Responsável Legal${sep}Telefone`);
    (liveReport.criticalStudentsList || []).forEach(s => {
      lines.push(
        `"${s.name}"${sep}"${s.ra}"${sep}"${s.className}"${sep}"${s.attendanceRate}%"${sep}${s.consecutiveAbsences}${sep}"${s.riskLevel}"${sep}"${s.hasDisciplinaryOccurrence ? 'SIM' : 'NÃO'}"${sep}${s.totalOccurrences}${sep}"${s.interventionStage || 'Pendente'}"${sep}"${s.guardianName || 'Não informado'}"${sep}"${s.guardianPhone || 'Não informado'}"`
      );
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

  const turmasLancadasCount = liveReport.riskByClass.filter(c => (c as any).isLaunched).length;
  const totalTurmas = effectiveClasses.length;
  const lancamentoCompleto = totalTurmas > 0 && turmasLancadasCount >= totalTurmas;

  const filteredRiskClasses = liveReport.riskByClass.filter(c =>
    c.className.toLowerCase().includes(classFilterSearch.toLowerCase())
  );

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
      if (criticalFilterOccurrences === 'com_ocorrencia') return s.hasDisciplinaryOccurrence;
      if (criticalFilterOccurrences === 'sem_ocorrencia') return !s.hasDisciplinaryOccurrence;
      return true;
    });
  }, [liveReport.criticalStudentsList, criticalSearchQuery, criticalFilterOccurrences]);

  const filteredTransferredStudents = useMemo(() => {
    const q = moduleSearchQuery.trim().toLowerCase();
    return transferredStudents.filter(s => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.ra || '').toLowerCase().includes(q) ||
        (s.className || '').toLowerCase().includes(q) ||
        (s.transferDestination || '').toLowerCase().includes(q)
      );
    });
  }, [transferredStudents, moduleSearchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Controles */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
            <span>Central Unificada de Relatórios Institucionais</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Relatórios Pedagógicos
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Consolidado completo de frequências, busca ativa, ocorrências, uso e agendamento de equipamentos, portaria e transferências.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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

          <button
            type="button"
            onClick={handleExportCSV}
            className="p-2 sm:px-3 sm:py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            title="Exportar todos os relatórios do período em planilha CSV"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span className="hidden sm:inline">Exportar Geral (CSV)</span>
            <span className="sm:hidden">CSV</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            title="Sincronizar todos os módulos com a nuvem"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Imprimir relatório"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Navegação por Abas de Todos os Relatórios */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-2xs flex overflow-x-auto no-scrollbar gap-1">
        <button
          type="button"
          onClick={() => {
            setActiveReportTab('frequencia');
            setModuleSearchQuery('');
          }}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeReportTab === 'frequencia'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Frequências & Geral ({liveReport.averageAttendanceRate}%)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveReportTab('busca_ativa');
            setModuleSearchQuery('');
          }}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeReportTab === 'busca_ativa'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Busca Ativa & Alertas ({activeSearchStats.alertsInRange.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveReportTab('ocorrencias');
            setModuleSearchQuery('');
          }}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeReportTab === 'ocorrencias'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          <span>Ocorrências & Mediação ({occurrencesStats.totalInRange})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveReportTab('equipamentos');
            setModuleSearchQuery('');
          }}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeReportTab === 'equipamentos'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>Equipamentos & Agendamentos ({equipmentStats.bookingsInRange.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveReportTab('portaria');
            setModuleSearchQuery('');
          }}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeReportTab === 'portaria'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <DoorOpen className="w-4 h-4" />
          <span>Portaria ({gateStats.total})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveReportTab('transferidos');
            setModuleSearchQuery('');
          }}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeReportTab === 'transferidos'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Transferidos ({transferredStudents.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: FREQUÊNCIAS & GERAL                                                */}
      {/* ========================================================================= */}
      {activeReportTab === 'frequencia' && (
        <div className="space-y-6">
          {/* Banner Informativo */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              lancamentoCompleto
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : turmasLancadasCount > 0
                ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  lancamentoCompleto ? 'bg-emerald-200 text-emerald-800' : 'bg-indigo-200 text-indigo-800'
                }`}
              >
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
                    ? `${turmasLancadasCount} de ${totalTurmas} turmas com chamada lançada • Calendário Letivo ${calendarSummary.year}: ${calendarSummary.elapsedSchoolDays}/${calendarSummary.totalPlannedSchoolDays} dias letivos (${calendarSummary.currentBimester?.name || 'Ano Letivo'}).`
                    : 'Nenhuma chamada encontrada para esta data. Selecione uma data com chamadas no calendário.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-bold shrink-0">
              <span className="text-slate-600">Lançamento:</span>
              <span
                className={`px-2.5 py-1 rounded-lg shadow-2xs font-extrabold border ${
                  lancamentoCompleto
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-slate-900 border-slate-200'
                }`}
              >
                {turmasLancadasCount} / {totalTurmas} turmas
              </span>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Taxa Média de Frequência</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`text-2xl font-extrabold ${
                    liveReport.averageAttendanceRate >= 85
                      ? 'text-emerald-700'
                      : liveReport.averageAttendanceRate >= 75
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  {liveReport.averageAttendanceRate}%
                </span>
                <span
                  className={`text-xs font-bold flex items-center gap-0.5 ${
                    liveReport.averageAttendanceRate >= 75 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {liveReport.averageAttendanceRate >= 75 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  <span>{liveReport.averageAttendanceRate >= 75 ? 'LDB ✓' : 'Abaixo'}</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {liveReport.totalAbsences} ausências computadas no filtro
              </div>
            </div>

            <div
              onClick={() => setIsCriticalModalOpen(true)}
              className="bg-white border border-slate-200 hover:border-rose-400 hover:shadow-md transition-all rounded-xl p-4 shadow-xs cursor-pointer group"
              title="Clique para abrir lista nominal"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-500">Alunos em Frequência Crítica</div>
                <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                  <span>Nominal</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-rose-700">
                  {liveReport.studentsWithCriticalAbsence}
                </span>
                <span className="text-xs text-rose-600 font-semibold">&lt; 75% assiduidade</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Prioridade Busca Ativa
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
                {liveReport.alertsResponded} respondidos com retorno
              </div>
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Frequência Real por Turma (%)</h3>
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
                    <BarChart data={liveReport.riskByClass} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="className" tick={{ fontSize: 10, fill: '#64748b' }} angle={-20} textAnchor="end" interval={0} />
                      <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        formatter={(value: any, _name: string, props: any) => [
                          `${value}% (${props.payload.totalStudents} alunos)`,
                          'Frequência',
                        ]}
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Bar dataKey="averageAttendance" name="Frequência (%)" fill="#6366f1" radius={[4, 4, 0, 0]}>
                        {liveReport.riskByClass.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.averageAttendance >= 85 ? '#10b981' : entry.averageAttendance >= 75 ? '#6366f1' : '#f43f5e'}
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

            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Causas Primárias da Infrequência</h3>
                <p className="text-xs text-slate-500">Mapeamento cruzado com justificativas e intervenções</p>
              </div>
              <div className="space-y-3 mt-4">
                {liveReport.absenceCausesDistribution.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 font-medium truncate pr-2">{item.cause}</span>
                      <span className="font-bold text-slate-900 shrink-0">
                        {item.percentage}% ({item.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${item.percentage}%`, backgroundColor: CAUSE_COLORS[idx % CAUSE_COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabela Analítica por Turma */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-600" />
                  <span>Detalhamento Real por Turma no Período</span>
                </h3>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={classFilterSearch}
                  onChange={e => setClassFilterSearch(e.target.value)}
                  placeholder="Buscar turma..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
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
                  {filteredRiskClasses.map((clsItem: any) => (
                    <tr key={clsItem.classId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{clsItem.className}</td>
                      <td className="py-3 px-3 text-center">
                        {clsItem.isLaunched ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Check className="w-3 h-3" />
                            <span>Lançada</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            <span>Pendente</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">{clsItem.totalStudents}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700">
                        {clsItem.isLaunched ? (clsItem.presentCount ?? 0) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-rose-700">
                        {clsItem.isLaunched ? (clsItem.absentCount ?? 0) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-extrabold">
                        <span
                          className={`px-2 py-0.5 rounded-md ${
                            clsItem.averageAttendance >= 85
                              ? 'bg-emerald-50 text-emerald-700'
                              : clsItem.averageAttendance >= 75
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parecer Técnico */}
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
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: BUSCA ATIVA, ALERTAS & JUSTIFICATIVAS                              */}
      {/* ========================================================================= */}
      {activeReportTab === 'busca_ativa' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Alertas no Período</div>
              <div className="text-2xl font-black text-indigo-700 mt-1">
                {activeSearchStats.alertsInRange.length}
              </div>
              <div className="text-[11px] text-slate-500">
                WhatsApp: {activeSearchStats.byChannel.whatsapp} • Ligação: {activeSearchStats.byChannel.ligacao}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Respondidos pela Família</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {activeSearchStats.byStatus.respondido}
              </div>
              <div className="text-[11px] text-slate-500">
                Visualizados: {activeSearchStats.byStatus.visualizado}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Faltas Justificadas</div>
              <div className="text-2xl font-black text-sky-700 mt-1">
                {activeSearchStats.justifiedInRange.length}
              </div>
              <div className="text-[11px] text-slate-500">No período selecionado</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Atestados Médicos</div>
              <div className="text-2xl font-black text-purple-700 mt-1">
                {activeSearchStats.medicalInRange.length}
              </div>
              <div className="text-[11px] text-slate-500">Lançados no período</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Casos de Busca Ativa</div>
              <div className="text-2xl font-black text-rose-700 mt-1">
                {effectiveInterventions.length}
              </div>
              <div className="text-[11px] text-slate-500">
                {liveReport.successfulReintegrations} reintegrados
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Lista de Alertas no Período */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Histórico de Alertas ({activeSearchStats.alertsInRange.length})
                </h3>
                <span className="text-[11px] text-slate-500">{formatDateRangeLabel(startDate, endDate)}</span>
              </div>
              {activeSearchStats.alertsInRange.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Nenhum alerta disparado no período selecionado.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Estudante</th>
                        <th className="py-2.5 px-3">Canal</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Motivo / Retorno</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeSearchStats.alertsInRange.map(a => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{a.studentName}</div>
                            <div className="text-[10px] text-slate-500">{a.className} • {a.guardianPhone}</div>
                          </td>
                          <td className="py-2.5 px-3 uppercase font-bold text-[10px]">{a.channel}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                a.status === 'respondido'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : a.status === 'visualizado'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {a.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                            {a.responseNote || a.absenceReason || a.message?.slice(0, 60)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Casos de Busca Ativa */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Casos de Intervenção / Busca Ativa ({effectiveInterventions.length})
                </h3>
              </div>
              {effectiveInterventions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Nenhum caso formal de Busca Ativa registrado.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Estudante</th>
                        <th className="py-2.5 px-3">Etapa</th>
                        <th className="py-2.5 px-3">Motivo</th>
                        <th className="py-2.5 px-3">Responsável</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {effectiveInterventions.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{c.studentName}</div>
                            <div className="text-[10px] text-slate-500">{c.className}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[10px]">
                              {c.stage.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{c.primaryReason}</td>
                          <td className="py-2.5 px-3 text-slate-600">{c.assignedTo || 'Equipe PAAC'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: OCORRÊNCIAS & MEDIAÇÃO                                             */}
      {/* ========================================================================= */}
      {activeReportTab === 'ocorrencias' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Ocorrências no Período</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{occurrencesStats.totalInRange}</div>
              <div className="text-[11px] text-slate-400">{formatDateRangeLabel(startDate, endDate)}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-amber-800">Pendentes de Mediação</div>
              <div className="text-2xl font-black text-amber-900 mt-1">{occurrencesStats.pendentes}</div>
              <div className="text-[11px] text-amber-700">Aguardando devolutiva da Gestão</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-emerald-800">Com Mediação / Concluídas</div>
              <div className="text-2xl font-black text-emerald-900 mt-1">{occurrencesStats.concluidas}</div>
              <div className="text-[11px] text-emerald-700">Atendimento registrado</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-indigo-800">Tratativas com Famílias</div>
              <div className="text-2xl font-black text-indigo-900 mt-1">
                {occurrencesStats.tratativasInRange.length}
              </div>
              <div className="text-[11px] text-indigo-700">Atendimentos/reuniões no período</div>
            </div>
          </div>

          {/* Quebras por Motivo e Turma */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
                Principais Motivos no Período
              </h3>
              {occurrencesStats.topMotivos.length === 0 ? (
                <p className="text-xs text-slate-400">Sem ocorrências registradas no período.</p>
              ) : (
                <div className="space-y-2">
                  {occurrencesStats.topMotivos.slice(0, 6).map(([motivo, count]) => (
                    <div key={motivo} className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                      <span className="font-semibold text-slate-800 truncate pr-2">{motivo}</span>
                      <span className="font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
                Ocorrências por Turma no Período
              </h3>
              {occurrencesStats.topTurmas.length === 0 ? (
                <p className="text-xs text-slate-400">Sem registros por turma no período.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {occurrencesStats.topTurmas.map(([turma, count]) => (
                    <div key={turma} className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-800">{turma}</span>
                      <span className="font-black text-indigo-700">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabela Nominal de Ocorrências */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                Listagem Nominal de Ocorrências ({occurrencesStats.filtered.length})
              </h3>
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={moduleSearchQuery}
                  onChange={e => setModuleSearchQuery(e.target.value)}
                  placeholder="Filtrar aluno, turma, docente ou motivo..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>
            </div>
            {occurrencesStats.filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhuma ocorrência encontrada para o período/filtro selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Data / Aula</th>
                      <th className="py-2.5 px-3">Estudante</th>
                      <th className="py-2.5 px-3">Turma</th>
                      <th className="py-2.5 px-3">Professor(a)</th>
                      <th className="py-2.5 px-3">Motivo</th>
                      <th className="py-2.5 px-3">Mediação / Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {occurrencesStats.filtered.map((o, i) => (
                      <tr key={o.id || i} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                          <div className="font-mono font-bold text-slate-800">{o.criadoEm || o.dataPreenchimento}</div>
                          <div className="text-[10px]">{o.aula}</div>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{o.estudante}</td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-800">{o.turma}</td>
                        <td className="py-2.5 px-3 text-slate-700">{o.professor}</td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-xs">{o.ocorrencia}</td>
                        <td className="py-2.5 px-3">
                          {o.mediacao && String(o.mediacao).trim() ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              Mediada
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              Pendente
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
      )}

      {/* ========================================================================= */}
      {/* ABA 4: EQUIPAMENTOS (INVENTÁRIO POR CONDIÇÃO + USO & AGENDAMENTOS)        */}
      {/* ========================================================================= */}
      {activeReportTab === 'equipamentos' && (
        <div className="space-y-5">
          {/* KPIs Gerais */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Agendamentos no Período</div>
              <div className="text-2xl font-black text-sky-700 mt-1">
                {equipmentStats.bookingsInRange.length}
              </div>
              <div className="text-[11px] text-slate-500">
                {equipmentStats.totalUnitsBooked} unidades reservadas
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-emerald-800">1. Em Uso</div>
              <div className="text-2xl font-black text-emerald-900 mt-1">
                {equipmentStats.condCounts.em_uso}
              </div>
              <div className="text-[11px] text-emerald-700">Disponíveis na escola</div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-rose-800">2. Quebrado</div>
              <div className="text-2xl font-black text-rose-900 mt-1">
                {equipmentStats.condCounts.quebrado}
              </div>
              <div className="text-[11px] text-rose-700">Fora de operação</div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-amber-800">3. Em manutenção</div>
              <div className="text-2xl font-black text-amber-900 mt-1">
                {equipmentStats.condCounts.em_manutencao}
              </div>
              <div className="text-[11px] text-amber-700">Em assistência técnica</div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-purple-800">Aulas c/ Plataforma</div>
              <div className="text-2xl font-black text-purple-900 mt-1">
                {equipmentStats.platformLockedSlots.length}
              </div>
              <div className="text-[11px] text-purple-700 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Com trava ativa na grade</span>
              </div>
            </div>
          </div>

          {/* Inventário por Tipo & Ranking de Uso por Professor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                <span>Condição do Inventário por Tipo</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Tipo</th>
                      <th className="py-2 px-2 text-center">Total</th>
                      <th className="py-2 px-2 text-center">1. Em Uso</th>
                      <th className="py-2 px-2 text-center">2. Quebrado</th>
                      <th className="py-2 px-2 text-center">3. Manutenção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {equipmentStats.byTypeInventory.map(([tipo, st]) => (
                      <tr key={tipo}>
                        <td className="py-2 px-3 font-bold text-slate-900">{tipo}</td>
                        <td className="py-2 px-2 text-center font-bold">{st.total}</td>
                        <td className="py-2 px-2 text-center font-bold text-emerald-700">{st.em_uso}</td>
                        <td className="py-2 px-2 text-center font-bold text-rose-700">{st.quebrado}</td>
                        <td className="py-2 px-2 text-center font-bold text-amber-700">{st.em_manutencao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
                Uso por Professor no Período
              </h3>
              {equipmentStats.byTeacherBookings.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum agendamento registrado no período selecionado.</p>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {equipmentStats.byTeacherBookings.map(([prof, info]) => (
                    <div
                      key={prof}
                      className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-100"
                    >
                      <span className="font-bold text-slate-800">{prof}</span>
                      <span className="text-sky-800 font-bold">
                        {info.count} reserva(s) • {info.units} un.
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabela Nominal de Agendamentos no Período */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                Agendamentos de Equipamentos ({equipmentStats.filteredBookings.length})
              </h3>
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={moduleSearchQuery}
                  onChange={e => setModuleSearchQuery(e.target.value)}
                  placeholder="Filtrar professor, turma, tipo ou aula..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>
            </div>
            {equipmentStats.filteredBookings.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhum agendamento encontrado para o período selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Aula</th>
                      <th className="py-2.5 px-3">Tipo de Equipamento</th>
                      <th className="py-2.5 px-3 text-center">Qtd</th>
                      <th className="py-2.5 px-3">Turma</th>
                      <th className="py-2.5 px-3">Professor(a)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {equipmentStats.filteredBookings.map((ag, i) => (
                      <tr key={ag.id || i} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{ag.data}</td>
                        <td className="py-2.5 px-3 text-slate-700">{ag.aula}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[10px]">
                            {ag.equipmentType || 'Tablet'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-slate-900">
                          {ag.quantity ?? ag.tablets ?? 0}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-800">{ag.turma}</td>
                        <td className="py-2.5 px-3 text-slate-800">{ag.professor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 5: PORTARIA (ENTRADAS TARDIAS & SAÍDAS ANTECIPADAS)                   */}
      {/* ========================================================================= */}
      {activeReportTab === 'portaria' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Movimentações no Período</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{gateStats.total}</div>
              <div className="text-[11px] text-slate-400">{formatDateRangeLabel(startDate, endDate)}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-blue-800">Entradas Tardias</div>
              <div className="text-2xl font-black text-blue-900 mt-1">{gateStats.entradas}</div>
              <div className="text-[11px] text-blue-700">Chegadas após início</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-amber-800">Saídas Antecipadas</div>
              <div className="text-2xl font-black text-amber-900 mt-1">{gateStats.saidas}</div>
              <div className="text-[11px] text-amber-700">Liberações antecipadas</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-slate-700">Aula / Intervalo Mais Frequente</div>
              <div className="text-sm font-black text-slate-900 mt-1 truncate">
                {gateStats.byPeriod[0]?.[0] || '—'}
              </div>
              <div className="text-[11px] text-slate-500">
                {gateStats.byPeriod[0] ? `${gateStats.byPeriod[0][1]} registro(s)` : 'Sem movimentações'}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                Registros de Portaria ({gateStats.filtered.length})
              </h3>
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={moduleSearchQuery}
                  onChange={e => setModuleSearchQuery(e.target.value)}
                  placeholder="Filtrar estudante, turma, aula ou motivo..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>
            </div>
            {gateStats.filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhum registro de portaria encontrado no período selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Data / Hora</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Estudante</th>
                      <th className="py-2.5 px-3">Turma</th>
                      <th className="py-2.5 px-3">Aula / Intervalo Vinculada</th>
                      <th className="py-2.5 px-3">Motivo</th>
                      <th className="py-2.5 px-3">Autorizado por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gateStats.filtered.map(g => (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {g.date} • {g.time}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              g.type === 'entrada_tardia'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {g.type === 'entrada_tardia' ? 'Entrada Tardia' : 'Saída Antecipada'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{g.studentName}</td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-800">{g.className}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-semibold">{g.classPeriodName || (g as any).periodName || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{g.reason || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{g.guardianOrAuthorizedPerson || (g as any).authorizedBy || g.recordedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 6: ESTUDANTES TRANSFERIDOS (HISTÓRICO PRESERVADO)                     */}
      {/* ========================================================================= */}
      {activeReportTab === 'transferidos' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 flex items-center justify-between gap-3">
            <div>
              <strong className="text-sm block">Registro Permanente de Estudantes Transferidos</strong>
              <span>
                Estes estudantes não entram nas médias de chamadas atuais, mas seus históricos de faltas, justificativas e ocorrências seguem preservados para consultas futuras da escola.
              </span>
            </div>
            <span className="px-3 py-1 rounded-xl bg-white border border-amber-300 font-black text-amber-900 shrink-0">
              {transferredStudents.length} Transferido(s)
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                Relação de Estudantes Transferidos ({filteredTransferredStudents.length})
              </h3>
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={moduleSearchQuery}
                  onChange={e => setModuleSearchQuery(e.target.value)}
                  placeholder="Filtrar estudante, RA, turma ou destino..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>
            </div>

            {filteredTransferredStudents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhum estudante transferido registrado na unidade escolar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3">Estudante & RA</th>
                      <th className="py-2.5 px-3">Turma de Origem</th>
                      <th className="py-2.5 px-3">Data Transferência</th>
                      <th className="py-2.5 px-3">Destino</th>
                      <th className="py-2.5 px-3">Motivo</th>
                      <th className="py-2.5 px-3 text-center">Faltas Acumuladas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransferredStudents.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{s.name}</div>
                          <div className="text-[10px] font-mono text-slate-500">RA: {s.ra}</div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-800">{s.className}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{s.transferredAt || (s as any).transferDate || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-700">{s.transferDestination || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{s.transferReason || '—'}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                          {s.totalAbsences || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Nominal de Alunos em Frequência Crítica */}
      {isCriticalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
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
                    Cruzamento com Ocorrências Disciplinares e Busca Ativa • {formatDateRangeLabel(startDate, endDate)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCriticalCSV}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCriticalModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar por aluno, RA ou turma..."
                  value={criticalSearchQuery}
                  onChange={e => setCriticalSearchQuery(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setCriticalFilterOccurrences('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer whitespace-nowrap ${
                    criticalFilterOccurrences === 'todos'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Todos ({liveReport.criticalStudentsList?.length || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setCriticalFilterOccurrences('com_ocorrencia')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer whitespace-nowrap ${
                    criticalFilterOccurrences === 'com_ocorrencia'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-900 border-amber-200'
                  }`}
                >
                  ⚠️ Com Ocorrências ({liveReport.criticalStudentsList?.filter(s => s.hasDisciplinaryOccurrence).length || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setCriticalFilterOccurrences('sem_ocorrencia')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer whitespace-nowrap ${
                    criticalFilterOccurrences === 'sem_ocorrencia'
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Sem Ocorrências
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredCriticalStudents.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">
                    Nenhum aluno atende aos filtros selecionados
                  </h4>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-4">Estudante & RA</th>
                      <th className="py-3 px-4">Turma</th>
                      <th className="py-3 px-4 text-center">Frequência</th>
                      <th className="py-3 px-4 text-center">Faltas Consecutivas</th>
                      <th className="py-3 px-4">Ocorrências</th>
                      <th className="py-3 px-4">Responsável</th>
                      <th className="py-3 px-4">Etapa Busca Ativa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCriticalStudents.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50/80">
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
                        <td className="py-3 px-4 text-center font-bold">
                          {student.consecutiveAbsences} {student.consecutiveAbsences === 1 ? 'dia' : 'dias'}
                        </td>
                        <td className="py-3 px-4">
                          {student.hasDisciplinaryOccurrence ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>{student.totalOccurrences}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">Sem registros</span>
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

            <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Exibindo {filteredCriticalStudents.length} de {liveReport.criticalStudentsList?.length || 0} alunos críticos
              </span>
              <button
                type="button"
                onClick={() => setIsCriticalModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
