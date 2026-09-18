import React, { useState, useEffect, useMemo } from 'react';
import {
  BellRing,
  CheckCircle,
  Clock,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Smartphone,
  ExternalLink,
  Search,
  Filter,
  CheckCheck,
  AlertCircle,
  Users,
  Calendar,
  Eye,
  Copy,
  Check,
  FileText,
  Stethoscope,
  DoorOpen,
  UserCheck,
  UserX,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import {
  ParentAlert,
  AlertStatus,
  Student,
  SchoolClass,
  UserSession,
  AttendanceRecord,
  GateRecord,
  AlertChannel,
  AlertTrigger
} from '../types';
import { BulkWhatsAppModal } from './BulkWhatsAppModal';
import { storageService } from '../data/storageService';

interface DailyAbsenteeItem {
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  ra?: string;
  absenceType: 'falta_injustificada' | 'falta_justificada' | 'atestado_medico' | 'atraso_portaria';
  absenceLabel: string;
  detail?: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelationship?: string;
  consecutiveAbsences: number;
  attendanceRate: number;
  existingAlert?: ParentAlert;
}

interface AlertsManagerProps {
  alerts: ParentAlert[];
  onUpdateAlertStatus: (alertId: string, status: AlertStatus, feedback?: string) => Promise<void>;
  onOpenNewAlertModal: () => void;
  onOpenStudentDetail: (studentId: string) => void;
  students?: Student[];
  classes?: SchoolClass[];
  currentUser?: UserSession;
  onSendAlertDirect?: (alertData: {
    studentId: string;
    channel: AlertChannel;
    messageContent: string;
    triggerReason?: AlertTrigger;
    triggerLabel?: string;
  }) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export const AlertsManager: React.FC<AlertsManagerProps> = ({
  alerts,
  onUpdateAlertStatus,
  onOpenNewAlertModal,
  onOpenStudentDetail,
  students = [],
  classes = [],
  currentUser,
  onSendAlertDirect,
  onRefresh,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Sub-tabs: "Ausências do Dia para WhatsApp" vs "Histórico de Alertas"
  const [activeSubTab, setActiveSubTab] = useState<'daily_absences' | 'all_alerts'>('daily_absences');

  // Daily absences state
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('todas');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('todas');
  const [dailySearch, setDailySearch] = useState<string>('');
  const [dailyRecords, setDailyRecords] = useState<AttendanceRecord[]>([]);
  const [dailyGateRecords, setDailyGateRecords] = useState<GateRecord[]>([]);
  const [isLoadingDaily, setIsLoadingDaily] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Bulk WhatsApp state
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);
  const [bulkAlertsList, setBulkAlertsList] = useState<ParentAlert[]>([]);

  // History tab state
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterChannel, setFilterChannel] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAlertForReply, setSelectedAlertForReply] = useState<ParentAlert | null>(null);
  const [customReplyText, setCustomReplyText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Load daily attendance records and gate records for the chosen date
  const loadDailyAbsences = async (date: string) => {
    setIsLoadingDaily(true);
    let fetchedAttendance: AttendanceRecord[] = [];
    let fetchedGate: GateRecord[] = [];

    try {
      const res = await fetch(`/api/attendance-records?date=${date}`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          fetchedAttendance = data;
        }
      }
    } catch (e) {
      console.warn('Backend indisponível para registros diários, consultando storageService:', e);
    }

    if (fetchedAttendance.length === 0) {
      fetchedAttendance = storageService.getAttendanceRecords(undefined, date);
    }

    try {
      const resGate = await fetch(`/api/gate-records?date=${date}`);
      if (resGate.ok && resGate.headers.get('content-type')?.includes('application/json')) {
        const dataGate = await resGate.json();
        if (Array.isArray(dataGate)) {
          fetchedGate = dataGate;
        }
      }
    } catch (e) {
      // ignore
    }

    if (fetchedGate.length === 0) {
      fetchedGate = storageService.getGateRecords(date);
    }

    setDailyRecords(fetchedAttendance);
    setDailyGateRecords(fetchedGate);
    setIsLoadingDaily(false);
  };

  useEffect(() => {
    loadDailyAbsences(selectedDate);
  }, [selectedDate]);

  // Combine attendance records and gate entries to build list of absent students
  const dailyAbsentees: DailyAbsenteeItem[] = useMemo(() => {
    const list: DailyAbsenteeItem[] = [];
    const allStudents = students.length > 0 ? students : storageService.getStudents();

    // 1. Process attendance records where status is not "presente"
    dailyRecords.forEach(rec => {
      if (rec.status === 'presente') return;

      const student = allStudents.find(s => s.id === rec.studentId) || storageService.getStudentById(rec.studentId);
      const studentName = rec.studentName || student?.name || 'Estudante';
      const className = student?.className || rec.className || rec.classId;
      const guardianName = student?.guardianName || 'Responsável';
      const guardianPhone = student?.guardianPhone || '(11) 99999-9999';

      let absenceLabel = 'Falta Injustificada';
      let detail = '';
      if (rec.status === 'falta_justificada') {
        absenceLabel = 'Falta Justificada';
        detail = rec.justification || 'Comunicação familiar';
      } else if (rec.status === 'atestado_medico') {
        absenceLabel = 'Atestado Médico';
        detail = rec.medicalCertificate || `${rec.medicalDays || 1} dia(s) de afastamento`;
      } else if (rec.status === 'atraso') {
        absenceLabel = 'Atraso em Sala';
      }

      // Check if an alert was already triggered for this student on this date
      const existingAlert = alerts.find(
        a => a.studentId === rec.studentId && a.sentAt.startsWith(selectedDate)
      );

      list.push({
        studentId: rec.studentId,
        studentName,
        className,
        classId: rec.classId || student?.classId || '',
        ra: student?.ra,
        absenceType: rec.status as any,
        absenceLabel,
        detail,
        guardianName,
        guardianPhone,
        guardianRelationship: student?.guardianRelationship || 'Responsável',
        consecutiveAbsences: student?.consecutiveAbsences || 1,
        attendanceRate: student?.attendanceRate || 85,
        existingAlert,
      });
    });

    // 2. Also check students who entered late via gate if not already marked
    dailyGateRecords
      .filter(g => g.type === 'entrada_tardia')
      .forEach(gate => {
        const alreadyInList = list.some(i => i.studentId === gate.studentId);
        if (!alreadyInList) {
          const student = allStudents.find(s => s.id === gate.studentId) || storageService.getStudentById(gate.studentId);
          const existingAlert = alerts.find(
            a => a.studentId === gate.studentId && a.sentAt.startsWith(selectedDate)
          );

          list.push({
            studentId: gate.studentId,
            studentName: gate.studentName,
            className: gate.className,
            classId: gate.classId,
            ra: student?.ra,
            absenceType: 'atraso_portaria',
            absenceLabel: 'Atraso na Portaria',
            detail: `Entrada às ${gate.time} • Motivo: ${gate.reason}`,
            guardianName: student?.guardianName || gate.guardianOrAuthorizedPerson || 'Responsável',
            guardianPhone: student?.guardianPhone || gate.guardianPhone || '(11) 99999-9999',
            guardianRelationship: student?.guardianRelationship || 'Responsável',
            consecutiveAbsences: student?.consecutiveAbsences || 0,
            attendanceRate: student?.attendanceRate || 90,
            existingAlert,
          });
        }
      });

    return list;
  }, [dailyRecords, dailyGateRecords, students, alerts, selectedDate]);

  // Filtered daily absentees according to class, type, and search query
  const filteredDailyAbsentees = useMemo(() => {
    return dailyAbsentees.filter(item => {
      const matchesClass = selectedClassFilter === 'todas' || item.classId === selectedClassFilter;
      const matchesType = selectedTypeFilter === 'todas' || item.absenceType === selectedTypeFilter;
      const matchesSearch =
        dailySearch.trim() === '' ||
        item.studentName.toLowerCase().includes(dailySearch.toLowerCase()) ||
        item.guardianName.toLowerCase().includes(dailySearch.toLowerCase()) ||
        item.className.toLowerCase().includes(dailySearch.toLowerCase()) ||
        (item.ra && item.ra.toLowerCase().includes(dailySearch.toLowerCase()));

      return matchesClass && matchesType && matchesSearch;
    });
  }, [dailyAbsentees, selectedClassFilter, selectedTypeFilter, dailySearch]);

  // Counts for the daily dashboard metrics
  const totalDailyAbsences = dailyAbsentees.length;
  const unjustifiedCount = dailyAbsentees.filter(i => i.absenceType === 'falta_injustificada').length;
  const justifiedOrMedicalCount = dailyAbsentees.filter(
    i => i.absenceType === 'falta_justificada' || i.absenceType === 'atestado_medico'
  ).length;
  const alreadyNotifiedCount = dailyAbsentees.filter(i => Boolean(i.existingAlert)).length;
  const pendingNotificationCount = totalDailyAbsences - alreadyNotifiedCount;

  // Generate WhatsApp message text for a specific absentee
  const generateWhatsAppMessage = (item: DailyAbsenteeItem): string => {
    const formattedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR');

    if (item.absenceType === 'atestado_medico') {
      return `Prezado(a) ${item.guardianName}, confirmamos o recebimento e registro de atestado médico/justificativa de saúde do(a) estudante ${item.studentName} (${item.className}) para a data de ${formattedDate}. Informamos que as ausências amparadas por laudo de saúde não prejudicam seu cômputo legal de frequência. EE Professor Arlindo Silvestre.`;
    }

    if (item.absenceType === 'falta_justificada') {
      return `Prezado(a) ${item.guardianName}, informamos que registramos a justificativa ("${item.detail || 'comunicação familiar'}") referente à ausência do(a) estudante ${item.studentName} (${item.className}) no dia ${formattedDate}. Lembramos que, conforme legislação da SEDUC-SP, a presença diária às aulas é fundamental para a aprendizagem. EE Professor Arlindo Silvestre.`;
    }

    if (item.absenceType === 'atraso_portaria') {
      return `Prezado(a) ${item.guardianName}, informamos que o(a) estudante ${item.studentName} (${item.className}) deu entrada tardia na unidade escolar no dia ${formattedDate} (${item.detail}). Solicitamos atenção aos horários regulares das aulas. EE Professor Arlindo Silvestre.`;
    }

    // Padrão: Falta Injustificada
    if (item.consecutiveAbsences >= 3) {
      return `Prezado(a) ${item.guardianName}, a EE Professor Arlindo Silvestre comunica com URGÊNCIA que o(a) estudante ${item.studentName} (${item.className}) não compareceu à escola no dia ${formattedDate}, acumulando ${item.consecutiveAbsences} ausências consecutivas (índice atual de ${item.attendanceRate}%). Solicitamos entrar em contato imediatamente com a Coordenação/Direção Escolar para justificar a ausência e evitar o acionamento do Conselho Tutelar via Sistema de Busca Ativa SEDUC-SP.`;
    }

    return `Prezado(a) ${item.guardianName}, informamos que o(a) estudante ${item.studentName} (${item.className}) registrou ausência às aulas no dia ${formattedDate}. Solicitamos que entre em contato com a escola ou envie a justificativa. A frequência escolar diária é essencial para o desenvolvimento pedagógico. EE Professor Arlindo Silvestre.`;
  };

  // Direct WhatsApp single dispatch
  const handleDirectWhatsApp = async (item: DailyAbsenteeItem) => {
    const message = generateWhatsAppMessage(item);
    const rawPhone = item.guardianPhone.replace(/\D/g, '');
    const cleanPhone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    // Open WhatsApp Web or mobile app in a new tab
    window.open(url, '_blank');

    // Persist alert in database
    if (onSendAlertDirect) {
      try {
        await onSendAlertDirect({
          studentId: item.studentId,
          channel: 'whatsapp',
          messageContent: message,
          triggerReason: item.consecutiveAbsences >= 3 ? '3_faltas_consecutivas' : 'alerta_manual',
          triggerLabel: item.absenceLabel,
        });
      } catch (err) {
        console.error('Erro ao registrar alerta no banco:', err);
      }
    } else {
      // Fallback local
      const newAlert: ParentAlert = {
        id: `alt-${Date.now()}-${item.studentId}`,
        studentId: item.studentId,
        studentName: item.studentName,
        classId: item.classId,
        className: item.className,
        guardianName: item.guardianName,
        guardianPhone: item.guardianPhone,
        channel: 'whatsapp',
        triggerReason: item.consecutiveAbsences >= 3 ? '3_faltas_consecutivas' : 'alerta_manual',
        triggerLabel: item.absenceLabel,
        messageContent: message,
        status: 'enviado',
        sentAt: new Date().toISOString(),
        autoGenerated: true,
      };
      storageService.addAlert(newAlert);
      if (onRefresh) onRefresh();
    }
  };

  // Copy message to clipboard
  const handleCopyMessage = (item: DailyAbsenteeItem) => {
    const text = generateWhatsAppMessage(item);
    navigator.clipboard.writeText(text);
    setCopiedId(item.studentId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Open Bulk WhatsApp Modal populated with the day's absences
  const handleOpenBulkForDaily = () => {
    const preparedAlerts: ParentAlert[] = filteredDailyAbsentees.map(item => {
      if (item.existingAlert) {
        return item.existingAlert;
      }
      return {
        id: `alt-bulk-${item.studentId}-${selectedDate}`,
        studentId: item.studentId,
        studentName: item.studentName,
        classId: item.classId,
        className: item.className,
        guardianName: item.guardianName,
        guardianPhone: item.guardianPhone,
        channel: 'whatsapp',
        triggerReason: item.consecutiveAbsences >= 3 ? '3_faltas_consecutivas' : 'alerta_manual',
        triggerLabel: item.absenceLabel,
        messageContent: generateWhatsAppMessage(item),
        status: 'pendente' as any,
        sentAt: new Date().toISOString(),
        autoGenerated: true,
      };
    });

    setBulkAlertsList(preparedAlerts);
    setIsBulkWhatsAppOpen(true);
  };

  // Filter alerts for general history tab
  const filteredAlerts = alerts.filter(a => {
    const matchesStatus = filterStatus === 'todos' || a.status === filterStatus;
    const matchesChannel = filterChannel === 'todos' || a.channel === filterChannel;
    const matchesSearch =
      a.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.guardianName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.className.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.triggerLabel.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesChannel && matchesSearch;
  });

  const totalAlerts = alerts.length;
  const deliveredCount = alerts.filter(a => a.status === 'entregue' || a.status === 'lido' || a.status === 'respondido').length;
  const readCount = alerts.filter(a => a.status === 'lido' || a.status === 'respondido').length;
  const respondedCount = alerts.filter(a => a.status === 'respondido' || a.guardianFeedback).length;
  const responseRate = totalAlerts > 0 ? ((respondedCount / totalAlerts) * 100).toFixed(0) : '0';

  const handleSimulateStatus = async (alertId: string, status: AlertStatus, defaultFeedback?: string) => {
    setIsUpdating(true);
    try {
      await onUpdateAlertStatus(alertId, status, defaultFeedback);
      if (selectedAlertForReply?.id === alertId) {
        setSelectedAlertForReply(null);
        setCustomReplyText('');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Sub-Tab Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              <span>Painel de Gestão & Notificações de Ausências</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              Painel de Ausências do Dia & Disparo WhatsApp aos Pais
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Visualização unificada de faltas injustificadas, justificadas, atestados e atrasos para contato direto com as famílias.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {activeSubTab === 'daily_absences' && filteredDailyAbsentees.length > 0 && (
              <button
                type="button"
                onClick={handleOpenBulkForDaily}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                title="Disparar mensagens em lote no WhatsApp para todos os ausentes desta data"
              >
                <Smartphone className="w-4 h-4" />
                <span>Disparo em Lote WhatsApp ({filteredDailyAbsentees.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenNewAlertModal}
              className="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Emitir Alerta Manual</span>
            </button>
          </div>
        </div>

        {/* View Switcher: Daily Absences vs All History */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveSubTab('daily_absences')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'daily_absences'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Ausências Registradas na Data</span>
            {totalDailyAbsences > 0 && (
              <span
                className={`text-[11px] font-extrabold px-2 py-0.2 rounded-full ${
                  activeSubTab === 'daily_absences' ? 'bg-emerald-800 text-white' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {totalDailyAbsences}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('all_alerts')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'all_alerts'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <BellRing className="w-4 h-4" />
            <span>Histórico de Alertas & Respostas</span>
            <span
              className={`text-[11px] font-extrabold px-2 py-0.2 rounded-full ${
                activeSubTab === 'all_alerts' ? 'bg-indigo-800 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {totalAlerts}
            </span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SUB-VIEW 1: PAINEL DE AUSÊNCIAS DO DIA & DISPARO WHATSAPP       */}
      {/* ============================================================== */}
      {activeSubTab === 'daily_absences' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Daily Absence Metric tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-600" />
                <span>Total de Ausências no Dia</span>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalDailyAbsences}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Data: {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-rose-800 font-bold flex items-center gap-1.5">
                <UserX className="w-4 h-4 text-rose-600" />
                <span>Faltas Injustificadas</span>
              </div>
              <div className="text-2xl font-black text-rose-950 mt-1">{unjustifiedCount}</div>
              <div className="text-[11px] text-rose-700 mt-0.5">Prioridade de notificação WhatsApp</div>
            </div>

            <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-cyan-800 font-bold flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-cyan-600" />
                <span>Atestados & Justificadas</span>
              </div>
              <div className="text-2xl font-black text-cyan-950 mt-1">{justifiedOrMedicalCount}</div>
              <div className="text-[11px] text-cyan-700 mt-0.5">Formalizados pela família</div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-emerald-800 font-bold flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>Status de Notificação</span>
              </div>
              <div className="text-2xl font-black text-emerald-950 mt-1">
                {alreadyNotifiedCount} <span className="text-xs font-normal text-slate-500">enviados</span>
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                {pendingNotificationCount > 0 ? (
                  <span className="text-amber-800 font-bold">{pendingNotificationCount} pendentes de envio</span>
                ) : (
                  <span className="text-emerald-700 font-semibold">Todos notificados</span>
                )}
              </div>
            </div>
          </div>

          {/* Filter Bar for Daily Absences */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Date selector */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Data:</span>
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="text-xs bg-indigo-50/60 border border-indigo-200 rounded-lg px-2.5 py-1.5 font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                />
              </div>

              {/* Class selector */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-700">Turma:</label>
                <select
                  value={selectedClassFilter}
                  onChange={e => setSelectedClassFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="todas">Todas as Turmas</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.shift})
                    </option>
                  ))}
                </select>
              </div>

              {/* Absence type selector */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo:</label>
                <select
                  value={selectedTypeFilter}
                  onChange={e => setSelectedTypeFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="todas">Todos os Tipos de Ausência</option>
                  <option value="falta_injustificada">Falta Injustificada</option>
                  <option value="falta_justificada">Falta Justificada</option>
                  <option value="atestado_medico">Atestado Médico</option>
                  <option value="atraso_portaria">Atraso na Portaria</option>
                </select>
              </div>

              {/* Search text */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar aluno por nome, RA ou responsável..."
                  value={dailySearch}
                  onChange={e => setDailySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadDailyAbsences(selectedDate)}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer self-end lg:self-auto"
              title="Recarregar ausências desta data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingDaily ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          {/* Table of Absent Students */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Estudante & Turma</th>
                    <th className="py-3 px-3">Tipo de Ausência</th>
                    <th className="py-3 px-3">Motivo / Detalhes</th>
                    <th className="py-3 px-3">Responsável & Contato</th>
                    <th className="py-3 px-3">Status Notificação</th>
                    <th className="py-3 px-4 text-right">Ação de Contato (WhatsApp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDailyAbsentees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        {isLoadingDaily ? (
                          <div className="flex items-center justify-center gap-2 text-indigo-600 font-medium">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Consultando registros escolares...</span>
                          </div>
                        ) : (
                          <div>
                            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                            <p className="font-semibold text-slate-700 text-sm">
                              Nenhuma ausência registrada para os filtros selecionados.
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Se a chamada da data {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')} já foi realizada, todos os alunos constam como presentes ou não há faltas nos filtros.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredDailyAbsentees.map(item => {
                      const isUnjustified = item.absenceType === 'falta_injustificada';
                      const isJustified = item.absenceType === 'falta_justificada';
                      const isMedical = item.absenceType === 'atestado_medico';
                      const isLate = item.absenceType === 'atraso_portaria';
                      const isNotified = Boolean(item.existingAlert);

                      return (
                        <tr key={item.studentId} className="hover:bg-slate-50/80 transition-colors">
                          {/* Student */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isUnjustified
                                    ? 'bg-rose-100 text-rose-800'
                                    : isMedical
                                    ? 'bg-cyan-100 text-cyan-800'
                                    : isJustified
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {item.studentName.charAt(0)}
                              </div>
                              <div>
                                <button
                                  type="button"
                                  onClick={() => onOpenStudentDetail(item.studentId)}
                                  className="font-bold text-slate-900 hover:text-indigo-600 text-left transition-colors cursor-pointer text-xs"
                                >
                                  {item.studentName}
                                </button>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  <span className="font-semibold text-slate-700">{item.className}</span>
                                  {item.ra && <span>• RA: {item.ra}</span>}
                                  {item.consecutiveAbsences >= 3 && (
                                    <span className="bg-rose-100 text-rose-800 font-extrabold px-1.5 py-0.2 rounded text-[10px]">
                                      {item.consecutiveAbsences} seguidas
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Absence Type */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                                isUnjustified
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : isMedical
                                  ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                                  : isJustified
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-purple-50 text-purple-800 border-purple-200'
                              }`}
                            >
                              {isUnjustified && <UserX className="w-3 h-3" />}
                              {isMedical && <Stethoscope className="w-3 h-3" />}
                              {isJustified && <FileText className="w-3 h-3" />}
                              {isLate && <DoorOpen className="w-3 h-3" />}
                              <span>{item.absenceLabel}</span>
                            </span>
                          </td>

                          {/* Details / Justification */}
                          <td className="py-3.5 px-3">
                            {item.detail ? (
                              <div className="text-xs text-slate-700 max-w-[200px] truncate" title={item.detail}>
                                {item.detail}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Sem justificativa</span>
                            )}
                          </td>

                          {/* Guardian & Contact */}
                          <td className="py-3.5 px-3">
                            <div className="text-xs font-semibold text-slate-900">{item.guardianName}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span className="font-mono">{item.guardianPhone}</span>
                            </div>
                          </td>

                          {/* Notification Status */}
                          <td className="py-3.5 px-3">
                            {isNotified ? (
                              <div className="flex flex-col">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                                  <span>WhatsApp Enviado</span>
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(item.existingAlert!.sentAt).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Pendente de Envio</span>
                              </span>
                            )}
                          </td>

                          {/* Actions: Send WhatsApp, Copy, View Details */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* WhatsApp Direct Button */}
                              <button
                                type="button"
                                onClick={() => handleDirectWhatsApp(item)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                                title="Abrir conversa no WhatsApp com texto formatado pronto para envio"
                              >
                                <Smartphone className="w-3.5 h-3.5" />
                                <span>{isNotified ? 'Reenviar WhatsApp' : 'Enviar WhatsApp'}</span>
                              </button>

                              {/* Copy message button */}
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(item)}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  copiedId === item.studentId
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                                title="Copiar texto da mensagem de ausência"
                              >
                                {copiedId === item.studentId ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {/* Student dossier */}
                              <button
                                type="button"
                                onClick={() => onOpenStudentDetail(item.studentId)}
                                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                                title="Ver ficha completa do estudante"
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
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-VIEW 2: HISTÓRICO GERAL DE ALERTAS & RESPOSTAS DOS PAIS   */}
      {/* ============================================================== */}
      {activeSubTab === 'all_alerts' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Overview Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div className="text-xs text-slate-500 font-medium">Total de Alertas Emitidos</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalAlerts}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Gatilho automático e manual</div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3.5">
              <div className="text-xs text-blue-700 font-medium">Entregues com Sucesso</div>
              <div className="text-2xl font-extrabold text-blue-950 mt-1">{deliveredCount}</div>
              <div className="text-[11px] text-blue-700 mt-0.5">Confirmação de envio</div>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3.5">
              <div className="text-xs text-indigo-700 font-medium">Lidos pelos Pais</div>
              <div className="text-2xl font-extrabold text-indigo-950 mt-1">{readCount}</div>
              <div className="text-[11px] text-indigo-700 mt-0.5">Confirmação de leitura</div>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3.5">
              <div className="text-xs text-emerald-700 font-medium">Taxa de Resposta / Retorno</div>
              <div className="text-2xl font-extrabold text-emerald-950 mt-1">{responseRate}%</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">{respondedCount} respostas registradas</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por estudante, responsável ou turma..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterChannel}
                onChange={e => setFilterChannel(e.target.value)}
                className="text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="todos">Todos os Canais</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="ligacao">Ligação Telefônica</option>
              </select>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="todos">Todos os Status</option>
                <option value="enviado">Enviado</option>
                <option value="entregue">Entregue</option>
                <option value="lido">Lido</option>
                <option value="respondido">Respondido pelos Pais</option>
              </select>
            </div>
          </div>

          {/* Feed of Alerts */}
          <div className="space-y-4">
            {filteredAlerts.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
                Nenhum alerta encontrado com os filtros atuais.
              </div>
            ) : (
              filteredAlerts.map(alert => {
                const isWhatsApp = alert.channel === 'whatsapp';
                const hasFeedback = Boolean(alert.guardianFeedback);

                return (
                  <div
                    key={alert.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isWhatsApp
                              ? 'bg-emerald-100 text-emerald-700'
                              : alert.channel === 'sms'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {isWhatsApp ? <Smartphone className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenStudentDetail(alert.studentId)}
                              className="font-bold text-slate-900 hover:text-indigo-600 text-left transition-colors cursor-pointer text-sm"
                            >
                              {alert.studentName}
                            </button>
                            <span className="text-xs text-slate-500">({alert.className})</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {alert.triggerLabel}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>
                              Responsável: <strong>{alert.guardianName}</strong>
                            </span>
                            <span>•</span>
                            <span className="font-mono text-slate-500">{alert.guardianPhone}</span>
                            <span>•</span>
                            <span className="text-slate-400">
                              {new Date(alert.sentAt).toLocaleString('pt-BR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                            alert.status === 'respondido'
                              ? 'bg-emerald-100 text-emerald-800'
                              : alert.status === 'lido'
                              ? 'bg-indigo-100 text-indigo-800'
                              : alert.status === 'entregue'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {alert.status === 'respondido' && <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />}
                          {alert.status === 'lido' && <CheckCheck className="w-3.5 h-3.5 text-indigo-600" />}
                          {alert.status === 'entregue' && <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                          {alert.status === 'enviado' && <Clock className="w-3.5 h-3.5 text-slate-500" />}
                          <span className="capitalize">{alert.status}</span>
                        </span>
                      </div>
                    </div>

                    {/* Message content */}
                    <div className="mt-3.5 bg-slate-50/70 border border-slate-200/80 rounded-lg p-3 text-xs text-slate-700 leading-relaxed font-sans">
                      {alert.messageContent}
                    </div>

                    {/* Feedback if responded */}
                    {hasFeedback && (
                      <div className="mt-3 bg-emerald-50/60 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
                        <div className="font-bold flex items-center gap-1.5 text-emerald-800 mb-1">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Resposta registrada pelo responsável:</span>
                        </div>
                        <p className="italic">"{alert.guardianFeedback}"</p>
                      </div>
                    )}

                    {/* Action bar for simulating response / updating status */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span>Atualizar status:</span>
                        <button
                          type="button"
                          onClick={() => handleSimulateStatus(alert.id, 'entregue')}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold cursor-pointer"
                        >
                          Entregue
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSimulateStatus(alert.id, 'lido')}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-semibold cursor-pointer"
                        >
                          Lido
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedAlertForReply(alert)}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-semibold cursor-pointer flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Registrar Resposta</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {isWhatsApp && (
                          <a
                            href={`https://wa.me/${alert.guardianPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                              alert.messageContent
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir no WhatsApp</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenStudentDetail(alert.studentId)}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Ver Ficha Completa &rarr;
                        </button>
                      </div>
                    </div>

                    {/* Inline Reply Form if chosen */}
                    {selectedAlertForReply?.id === alert.id && (
                      <div className="mt-3 p-3 bg-slate-100 rounded-lg border border-slate-300 space-y-2">
                        <label className="text-xs font-bold text-slate-700 block">
                          Registrar resposta dada pelo responsável ({alert.guardianName}):
                        </label>
                        <textarea
                          rows={2}
                          value={customReplyText}
                          onChange={e => setCustomReplyText(e.target.value)}
                          placeholder="Ex: Mãe informou que o aluno esteve doente e levará atestado amanhã."
                          className="w-full text-xs p-2 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAlertForReply(null)}
                            className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800 font-semibold cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={!customReplyText.trim() || isUpdating}
                            onClick={() => handleSimulateStatus(alert.id, 'respondido', customReplyText)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-md disabled:opacity-50 cursor-pointer"
                          >
                            Salvar Resposta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bulk WhatsApp Modal */}
      <BulkWhatsAppModal
        isOpen={isBulkWhatsAppOpen}
        onClose={() => setIsBulkWhatsAppOpen(false)}
        alerts={bulkAlertsList.length > 0 ? bulkAlertsList : alerts.filter(a => a.channel === 'whatsapp')}
        onMarkAsDelivered={async (alertId: string) => {
          await onUpdateAlertStatus(alertId, 'entregue');
        }}
      />
    </div>
  );
};
