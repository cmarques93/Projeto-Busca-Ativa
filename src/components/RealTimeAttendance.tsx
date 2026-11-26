import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCheck,
  UserX,
  Clock,
  Search,
  Calendar,
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  Users,
  ChevronRight,
  Filter,
  Check,
  X,
  Sparkles,
  School,
  ArrowRight,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  Eye,
  Lock
} from 'lucide-react';
import { Student, SchoolClass, AttendanceStatus, ParentAlert, AttendanceRecord } from '../types';
import { storageService } from '../data/storageService';
import { firestoreService, isSameDay, normalizeDateStr, deduplicateAttendanceRecords } from '../lib/firestoreService';
import { getCalendarDayStatus, getCalendarMetricsSummary, calculateCalendarAttendanceRate } from '../utils/calendarUtils';
import {
  generateAtestadoRecordsSequence,
  generateJustifiedAbsenceSequence,
  formatMedicalDaysInfo,
  formatJustificationDaysInfo,
  findActiveAbsenceForDate
} from '../utils/atestadoUtils';
import { getLocalTodayStr } from '../utils/reportCalculator';

// Helper flexível para associar estudante à turma
export const isStudentInClass = (s: { classId?: string; className?: string }, cls: { id: string; name: string }): boolean => {
  if (!s || !cls) return false;
  const sClassId = (s.classId || '').trim().toLowerCase();
  const sClassName = (s.className || '').trim().toLowerCase();
  const cId = (cls.id || '').trim().toLowerCase();
  const cName = (cls.name || '').trim().toLowerCase();

  if (sClassId && (sClassId === cId || sClassId === cName)) return true;
  if (sClassName && (sClassName === cName || sClassName === cId)) return true;

  const normSId = sClassId.replace(/[^a-z0-9]/gi, '');
  const normCId = cId.replace(/[^a-z0-9]/gi, '');
  const normCName = cName.replace(/[^a-z0-9]/gi, '');
  if (normSId && (normSId === normCId || normSId === normCName)) return true;

  const normSName = sClassName.replace(/[^a-z0-9]/gi, '');
  if (normSName && (normSName === normCName || normSName === normCId)) return true;

  return false;
};

// Helper flexível para associar registro de frequência à turma
export const isRecordInClass = (r: AttendanceRecord, cls: { id: string; name: string }): boolean => {
  if (!r || !cls) return false;
  const rClassId = (r.classId || '').trim().toLowerCase();
  const rClassName = (r.className || '').trim().toLowerCase();
  const cId = (cls.id || '').trim().toLowerCase();
  const cName = (cls.name || '').trim().toLowerCase();

  if (rClassId && (rClassId === cId || rClassId === cName)) return true;
  if (rClassName && (rClassName === cName || rClassName === cId)) return true;

  const normRId = rClassId.replace(/[^a-z0-9]/gi, '');
  const normCId = cId.replace(/[^a-z0-9]/gi, '');
  const normCName = cName.replace(/[^a-z0-9]/gi, '');
  if (normRId && (normRId === normCId || normRId === normCName)) return true;

  const normRName = rClassName.replace(/[^a-z0-9]/gi, '');
  if (normRName && (normRName === normCName || normRName === normCId)) return true;

  // Marcador de classe específico (sem usar .includes em IDs de estudantes para não colidir entre turmas como 8A e 8B)
  if (r.studentId && (
    r.studentId === `cls-marker-${cls.id}` ||
    r.studentId === `cls-marker-${cId}` ||
    (normCId && r.studentId.toLowerCase() === `cls-marker-${normCId}`)
  )) return true;

  if (r.id && (
    r.id.startsWith(`att-cls-${cls.id}-`) ||
    r.id.startsWith(`att-cls-${cId}-`) ||
    (normCId && r.id.toLowerCase().startsWith(`att-cls-${normCId}-`))
  )) return true;

  return false;
};

// Helper para determinar se a frequência da turma foi efetivamente lançada e concluída nesta data.
// Quando há apenas registros pré-existentes de atestados médicos ou faltas justificadas de dias anteriores,
// a turma deve PERMANECER com o status Pendente (com o pré-preenchimento visível), aguardando a chamada do dia.
export const isClassAttendanceCompleted = (
  classRecords: AttendanceRecord[],
  classStudents: Student[]
): boolean => {
  if (!classRecords || classRecords.length === 0) return false;

  // Marcador explícito de chamada concluída da turma
  if (classRecords.some(r => r.studentId.startsWith('cls-marker-') || r.id.startsWith('att-cls-'))) {
    return true;
  }

  // Turma sem estudantes cadastrados
  if (classStudents.length === 0) {
    return classRecords.length > 0;
  }

  // Se todos os estudantes da turma possuem registros gravados no dia
  if (classRecords.length >= classStudents.length) {
    return true;
  }

  // Se há registros de chamada convencional (alunos presentes, faltas injustificadas ou atrasos)
  const hasRollCallRecords = classRecords.some(
    r => r.status === 'presente' || r.status === 'falta_injustificada' || (r.status as any) === 'atraso'
  );
  if (hasRollCallRecords && classRecords.length >= Math.min(classStudents.length, 2)) {
    return true;
  }

  // Caso tenha apenas registros isolados de atestados ou justificativas sem a chamada dos demais alunos
  return false;
};

interface RealTimeAttendanceProps {
  classes: SchoolClass[];
  selectedClassId?: string;
  onSelectClass?: (classId: string) => void;
  students: Student[];
  currentUser?: { id: string; name: string; role: string } | null;
  onSaveAttendance: (
    items: {
      studentId: string;
      status: AttendanceStatus;
      durationDays?: number;
      justification?: string;
      justificationDays?: number;
      justificationDayCurrent?: number;
      justificationDaysRemaining?: number;
      justificationStartDate?: string;
      justificationEndDate?: string;
      medicalCertificate?: string;
      medicalDays?: number;
      medicalDayCurrent?: number;
      medicalDaysRemaining?: number;
      medicalStartDate?: string;
      medicalEndDate?: string;
      studentName?: string;
      className?: string;
    }[],
    classId: string,
    teacherName: string,
    date?: string
  ) => Promise<{ newAlerts: ParentAlert[]; cloudSynced?: boolean; cloudError?: string } | void>;
  onOpenStudentDetail: (studentId: string) => void;
  onManualAlert: (student: Student) => void;
  onGoToAlerts?: () => void;
}

export const RealTimeAttendance: React.FC<RealTimeAttendanceProps> = ({
  classes,
  students,
  currentUser,
  onSaveAttendance,
  onOpenStudentDetail,
  onGoToAlerts,
}) => {
  const todayStr = getLocalTodayStr();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [teacherName, setTeacherName] = useState<string>(
    currentUser?.name || 'AOE / Equipe Escolar'
  );

  // Update teacherName if currentUser changes
  useEffect(() => {
    if (currentUser?.name) {
      setTeacherName(currentUser.name);
    }
  }, [currentUser]);

  // Filters for classes grid
  const [classSearch, setClassSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'realizadas' | 'pendentes'>('todos');

  // Daily attendance records loaded for the selectedDate
  const [dailyRecords, setDailyRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Modo de visualização: Lançamento vs Consulta (somente leitura)
  const [viewMode, setViewMode] = useState<'lancamento' | 'consulta'>('lancamento');
  const [consultScope, setConsultScope] = useState<'data_turma' | 'estudante'>('data_turma');
  const [consultClassId, setConsultClassId] = useState<string>('todas');
  const [consultStatusFilter, setConsultStatusFilter] = useState<string>('todos');
  const [consultSearch, setConsultSearch] = useState<string>('');
  const [consultStudentId, setConsultStudentId] = useState<string>('');

  // Modal State for "Lançar Frequência"
  const [activeModalClass, setActiveModalClass] = useState<SchoolClass | null>(null);
  const [modalAttendanceState, setModalAttendanceState] = useState<
    Record<
      string,
      {
        status: AttendanceStatus;
        durationDays?: number;
        justification?: string;
        justificationDays?: number;
        justificationDayCurrent?: number;
        justificationDaysRemaining?: number;
        justificationStartDate?: string;
        justificationEndDate?: string;
        medicalDays?: number;
        medicalCertificate?: string;
        medicalDayCurrent?: number;
        medicalDaysRemaining?: number;
        medicalStartDate?: string;
        medicalEndDate?: string;
      }
    >
  >({});
  const [modalStudentSearch, setModalStudentSearch] = useState('');
  const [modalRiskFilter, setModalRiskFilter] = useState<string>('todos');
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);

  // Modal State for "Consultar Frequência (Somente Leitura)"
  const [consultModalClass, setConsultModalClass] = useState<SchoolClass | null>(null);
  const [consultModalSearch, setConsultModalSearch] = useState('');
  const [consultModalStatusFilter, setConsultModalStatusFilter] = useState<string>('todos');

  // Delete Attendance Modal state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetClass, setDeleteTargetClass] = useState<SchoolClass | null>(null);
  const [isDeletingRecords, setIsDeletingRecords] = useState(false);

  // Edit / Replacement Confirmation Modal state
  const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);

  const handleOpenDeleteModal = (targetClass: SchoolClass | null = null) => {
    setDeleteTargetClass(targetClass);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDeleteAttendance = async () => {
    setIsDeletingRecords(true);
    try {
      const classId = deleteTargetClass?.id;

      // Atualização de estado imediata (UI otimista instantânea)
      if (classId) {
        setDailyRecords(prev => prev.filter(r => !(isSameDay(r.date, selectedDate) && isRecordInClass(r, deleteTargetClass!))));
      } else {
        setDailyRecords([]);
      }

      // 1. Apaga do storageService e atualiza Firebase Firestore
      await storageService.deleteAttendanceByDate(selectedDate, classId);

      // 2. Recarrega registros da tela
      await loadDailyRecords(selectedDate);

      const formattedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR');
      const targetText = deleteTargetClass ? `da turma "${deleteTargetClass.name}"` : 'de todas as turmas';
      setSaveSuccessMsg(`Registros de frequência ${targetText} do dia ${formattedDate} foram excluídos com sucesso e a base do Firebase foi atualizada.`);
      setTimeout(() => setSaveSuccessMsg(null), 6000);

      setIsDeleteDialogOpen(false);
      setDeleteTargetClass(null);
      if (activeModalClass && (!classId || activeModalClass.id === classId)) {
        setActiveModalClass(null);
      }
    } catch (err) {
      console.error('Erro ao excluir registros de frequência:', err);
      setSaveErrorMsg('Ocorreu um erro ao excluir os registros. Tente novamente.');
      setTimeout(() => setSaveErrorMsg(null), 6000);
    } finally {
      setIsDeletingRecords(false);
    }
  };

  // Fetch daily attendance records when date changes (instant local read + fresh authoritative cloud sync)
  const loadDailyRecords = async (date: string, forceRefresh = true) => {
    const sId = storageService.getActiveSchoolId();

    // 1. Leitura instantânea do cache local da escola ativa para zero latência ao trocar datas
    const localInitial = deduplicateAttendanceRecords(
      storageService.getAttendanceRecords(undefined, date, sId)
    );
    if (localInitial.length > 0) {
      setDailyRecords(localInitial);
    } else {
      setIsLoadingRecords(true);
    }

    let records: AttendanceRecord[] = localInitial;

    // 2. Sincronização em nuvem filtrada pela unidade escolar ativa (fonte autoritativa do Firebase)
    try {
      const firestoreRecords = await firestoreService.getAttendanceRecords(undefined, sId, forceRefresh);
      if (Array.isArray(firestoreRecords)) {
        const dedupedCloud = deduplicateAttendanceRecords(firestoreRecords);
        // Quando o Firebase retorna dados (ou quando não está em cooldown de cota), ele é a fonte de verdade
        if (dedupedCloud.length > 0 || !firestoreService.isQuotaCurrentlyExceeded()) {
          storageService.setAttendanceRecords(dedupedCloud, sId);
          records = dedupedCloud.filter(r => isSameDay(r.date, date));
        }
      }
    } catch (err) {
      console.warn('Falha ao obter frequências do Firestore:', err);
    }

    setDailyRecords(records);
    setIsLoadingRecords(false);
    return records;
  };

  useEffect(() => {
    loadDailyRecords(selectedDate, true);
  }, [selectedDate]);

  // Atualiza automaticamente a tela quando outra máquina (ex.: secretaria/AOE) salva frequência em tempo real
  useEffect(() => {
    const handleLiveSync = () => {
      const sId = storageService.getActiveSchoolId();
      const updatedForDate = deduplicateAttendanceRecords(
        storageService.getAttendanceRecords(undefined, selectedDate, sId)
      );
      setDailyRecords(updatedForDate);
    };
    window.addEventListener('sigaescola-data-synced', handleLiveSync);
    return () => window.removeEventListener('sigaescola-data-synced', handleLiveSync);
  }, [selectedDate]);

  // Open Pop-up modal for a specific class
  const handleOpenAttendanceModal = (cls: SchoolClass) => {
    const classStudents = students.filter(s => isStudentInClass(s, cls));
    const existingForClass = dailyRecords.filter(r => isRecordInClass(r, cls));
    const allStoredRecords = storageService.getAttendanceRecords();

    const initialMap: Record<
      string,
      {
        status: AttendanceStatus;
        durationDays?: number;
        justification?: string;
        justificationDays?: number;
        justificationDayCurrent?: number;
        justificationDaysRemaining?: number;
        justificationStartDate?: string;
        justificationEndDate?: string;
        medicalDays?: number;
        medicalCertificate?: string;
        medicalDayCurrent?: number;
        medicalDaysRemaining?: number;
        medicalStartDate?: string;
        medicalEndDate?: string;
      }
    > = {};

    classStudents.forEach(s => {
      // Prioridade 1: Verifica se o estudante possui atestado médico ou falta justificada em vigência na data selecionada
      const activeAbsence = findActiveAbsenceForDate(allStoredRecords, s.id, selectedDate);

      if (activeAbsence) {
        const isMed = activeAbsence.status === 'atestado_medico';
        const totalDays = isMed
          ? (activeAbsence.medicalDays || activeAbsence.durationDays || 1)
          : (activeAbsence.justificationDays || activeAbsence.durationDays || 1);
        const curDay = isMed
          ? (activeAbsence.medicalDayCurrent || 1)
          : (activeAbsence.justificationDayCurrent || 1);
        const remDays = isMed
          ? (activeAbsence.medicalDaysRemaining !== undefined ? activeAbsence.medicalDaysRemaining : Math.max(0, totalDays - curDay))
          : (activeAbsence.justificationDaysRemaining !== undefined ? activeAbsence.justificationDaysRemaining : Math.max(0, totalDays - curDay));

        if (isMed) {
          initialMap[s.id] = {
            status: 'atestado_medico',
            durationDays: totalDays,
            justification: activeAbsence.justification || '',
            medicalDays: totalDays,
            medicalCertificate: activeAbsence.medicalCertificate || '',
            medicalDayCurrent: curDay,
            medicalDaysRemaining: remDays,
            medicalStartDate: activeAbsence.medicalStartDate,
            medicalEndDate: activeAbsence.medicalEndDate,
          };
        } else {
          initialMap[s.id] = {
            status: 'falta_justificada',
            durationDays: totalDays,
            justification: activeAbsence.justification || '',
            justificationDays: totalDays,
            justificationDayCurrent: curDay,
            justificationDaysRemaining: remDays,
            justificationStartDate: activeAbsence.justificationStartDate,
            justificationEndDate: activeAbsence.justificationEndDate,
          };
        }
      } else {
        // Prioridade 2: Verifica se já há registro na lista do dia
        const existing = existingForClass.find(r => r.studentId === s.id);
        if (existing) {
          initialMap[s.id] = {
            status: existing.status,
            durationDays: existing.durationDays || 1,
            justification: existing.justification || '',
            justificationDays: existing.justificationDays || (existing.status === 'falta_justificada' ? existing.durationDays || 1 : undefined),
            justificationDayCurrent: existing.justificationDayCurrent || 1,
            justificationDaysRemaining: existing.justificationDaysRemaining,
            justificationStartDate: existing.justificationStartDate,
            justificationEndDate: existing.justificationEndDate,
            medicalDays: existing.medicalDays || (existing.status === 'atestado_medico' ? existing.durationDays || 1 : undefined),
            medicalCertificate: existing.medicalCertificate,
            medicalDayCurrent: existing.medicalDayCurrent || 1,
            medicalDaysRemaining: existing.medicalDaysRemaining,
            medicalStartDate: existing.medicalStartDate,
            medicalEndDate: existing.medicalEndDate,
          };
        } else {
          // Baseline: if student has chronic absence risk, highlight or default presente
          initialMap[s.id] = {
            status: s.consecutiveAbsences >= 3 ? 'falta_injustificada' : 'presente',
            durationDays: 1,
          };
        }
      }
    });

    setModalAttendanceState(initialMap);
    setModalStudentSearch('');
    setModalRiskFilter('todos');
    setActiveModalClass(cls);
  };

  // Status changes inside modal
  const handleModalStatusChange = (studentId: string, status: AttendanceStatus) => {
    setModalAttendanceState(prev => {
      const current = prev[studentId];
      const medDays = current?.medicalDays || (current?.status === 'atestado_medico' ? current?.durationDays : 1) || 1;
      const justDays = current?.justificationDays || (current?.status === 'falta_justificada' ? current?.durationDays : 1) || 1;

      return {
        ...prev,
        [studentId]: {
          ...current,
          status,
          durationDays: status === 'atestado_medico' ? medDays : status === 'falta_justificada' ? justDays : 1,
          medicalDays: status === 'atestado_medico' ? medDays : undefined,
          medicalDayCurrent: status === 'atestado_medico' ? (current?.medicalDayCurrent || 1) : undefined,
          medicalDaysRemaining: status === 'atestado_medico' ? Math.max(0, medDays - (current?.medicalDayCurrent || 1)) : undefined,
          medicalCertificate: status === 'atestado_medico' 
            ? (current?.medicalCertificate || formatMedicalDaysInfo(current?.medicalDayCurrent || 1, medDays))
            : undefined,
          justificationDays: status === 'falta_justificada' ? justDays : undefined,
          justificationDayCurrent: status === 'falta_justificada' ? (current?.justificationDayCurrent || 1) : undefined,
          justificationDaysRemaining: status === 'falta_justificada' ? Math.max(0, justDays - (current?.justificationDayCurrent || 1)) : undefined,
        },
      };
    });
  };

  const handleModalJustificationChange = (studentId: string, text: string) => {
    setModalAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        justification: text,
      },
    }));
  };

  const handleModalJustificationDaysChange = (studentId: string, days: number) => {
    const cleanDays = Math.max(1, days);
    setModalAttendanceState(prev => {
      const current = prev[studentId];
      const curDay = current?.justificationDayCurrent || 1;
      const rem = Math.max(0, cleanDays - curDay);
      return {
        ...prev,
        [studentId]: {
          ...current,
          justificationDays: cleanDays,
          durationDays: cleanDays,
          justificationDayCurrent: curDay,
          justificationDaysRemaining: rem,
        },
      };
    });
  };

  const handleModalMedicalDaysChange = (studentId: string, days: number) => {
    const cleanDays = Math.max(1, days);
    setModalAttendanceState(prev => {
      const current = prev[studentId];
      const curDay = current?.medicalDayCurrent || 1;
      const rem = Math.max(0, cleanDays - curDay);
      return {
        ...prev,
        [studentId]: {
          ...current,
          medicalDays: cleanDays,
          durationDays: cleanDays,
          medicalDayCurrent: curDay,
          medicalDaysRemaining: rem,
          medicalCertificate: `${cleanDays} dia(s) de atestado • ${formatMedicalDaysInfo(curDay, cleanDays)}`,
        },
      };
    });
  };

  const handleModalMarkAllPresent = () => {
    if (!activeModalClass) return;
    const classStudents = students.filter(s => isStudentInClass(s, activeModalClass));
    const allStoredRecords = storageService.getAttendanceRecords();

    setModalAttendanceState(prev => {
      const updated = { ...prev };
      classStudents.forEach(s => {
        // Se o estudante possui atestado médico ou falta justificada ativa para a data, preserva!
        const activeAbs = findActiveAbsenceForDate(allStoredRecords, s.id, selectedDate);
        if (activeAbs) {
          return;
        }
        updated[s.id] = { status: 'presente', durationDays: 1 };
      });
      return updated;
    });
  };

  // Trigger modal save (with confirmation if editing already recorded attendance)
  const handleTriggerSaveModalAttendance = () => {
    if (!activeModalClass) return;
    const isAlreadyRecorded = dailyRecords.some(
      r => isSameDay(r.date, selectedDate) && isRecordInClass(r, activeModalClass)
    );
    if (isAlreadyRecorded) {
      setIsEditConfirmOpen(true);
    } else {
      executeSaveModalAttendance();
    }
  };

  // Submit modal attendance and return to grid (completely deleting previous records on edit)
  const executeSaveModalAttendance = async () => {
    if (!activeModalClass) return;
    setIsSubmittingModal(true);
    setIsEditConfirmOpen(false);

    try {
      // 1. Apaga prévia e explicitamente os registros antigos desta turma nesta data (local + Firestore isolado por schoolId)
      await storageService.deleteAttendanceByDate(selectedDate, activeModalClass.id);

      const classStudents = students.filter(s => isStudentInClass(s, activeModalClass));
      const items = classStudents.map(s => {
        const entry = modalAttendanceState[s.id] || { status: 'presente' as AttendanceStatus, durationDays: 1 };
        const duration = entry.status === 'atestado_medico'
          ? (entry.medicalDays || entry.durationDays || 1)
          : entry.status === 'falta_justificada'
          ? (entry.justificationDays || entry.durationDays || 1)
          : 1;

        return {
          studentId: s.id,
          studentName: s.name,
          className: s.className || activeModalClass.name,
          status: entry.status,
          durationDays: duration,
          justification: entry.justification,
          justificationDays: entry.justificationDays,
          justificationDayCurrent: entry.justificationDayCurrent,
          justificationDaysRemaining: entry.justificationDaysRemaining,
          justificationStartDate: entry.justificationStartDate,
          justificationEndDate: entry.justificationEndDate,
          medicalCertificate: entry.medicalCertificate,
          medicalDays: entry.medicalDays,
          medicalDayCurrent: entry.medicalDayCurrent,
          medicalDaysRemaining: entry.medicalDaysRemaining,
          medicalStartDate: entry.medicalStartDate,
          medicalEndDate: entry.medicalEndDate,
        };
      });

      // Atualização otimista imediata para que a barra de progresso e o card da turma atualizem instantaneamente
      const optimisticRecords: AttendanceRecord[] = items.length > 0
        ? items.map(item => ({
            id: `att-opt-${Date.now()}-${item.studentId}`,
            studentId: item.studentId,
            studentName: item.studentName || 'Estudante',
            classId: activeModalClass.id,
            className: activeModalClass.name,
            date: selectedDate,
            status: item.status,
            durationDays: item.durationDays,
            justification: item.justification,
            justificationDays: item.justificationDays,
            justificationDayCurrent: item.justificationDayCurrent,
            justificationDaysRemaining: item.justificationDaysRemaining,
            justificationStartDate: item.justificationStartDate,
            justificationEndDate: item.justificationEndDate,
            medicalCertificate: item.medicalCertificate,
            medicalDays: item.medicalDays,
            medicalDayCurrent: item.medicalDayCurrent,
            medicalDaysRemaining: item.medicalDaysRemaining,
            medicalStartDate: item.medicalStartDate,
            medicalEndDate: item.medicalEndDate,
            recordedBy: teacherName,
            recordedAt: new Date().toISOString(),
          }))
        : [{
            id: `att-cls-${activeModalClass.id}-${selectedDate}`,
            studentId: `cls-marker-${activeModalClass.id}`,
            studentName: `Turma ${activeModalClass.name} (Chamada Concluída)`,
            classId: activeModalClass.id,
            className: activeModalClass.name,
            date: selectedDate,
            status: 'presente',
            durationDays: 1,
            isCountedAsAbsence: false,
            recordedBy: teacherName,
            recordedAt: new Date().toISOString(),
            justification: 'Frequência da turma registrada',
          }];

      setDailyRecords(prev => {
        const filtered = prev.filter(r => !(isSameDay(r.date, selectedDate) && isRecordInClass(r, activeModalClass)));
        return [...filtered, ...optimisticRecords];
      });

      const saveRes = await onSaveAttendance(items, activeModalClass.id, teacherName, selectedDate);
      // Reload daily records directly from Firestore
      await loadDailyRecords(selectedDate, true);

      const formattedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR');
      if (saveRes && saveRes.cloudSynced === false) {
        setSaveErrorMsg(
          `Frequência da turma "${activeModalClass.name}" (${formattedDate}) salva apenas localmente, mas falhou ao enviar para o Firebase. Verifique sua conexão e clique em Sincronizar.`
        );
        setTimeout(() => setSaveErrorMsg(null), 9000);
      } else {
        setSaveSuccessMsg(`Frequência da turma "${activeModalClass.name}" (${formattedDate}) gravada e sincronizada com sucesso no Firebase!`);
        setTimeout(() => setSaveSuccessMsg(null), 6000);
      }

      // Closes modal and returns to grid
      setActiveModalClass(null);
    } catch (err) {
      console.error('Erro ao registrar/substituir frequência:', err);
      setSaveErrorMsg('Erro ao registrar frequência. Tente novamente.');
      setTimeout(() => setSaveErrorMsg(null), 6000);
    } finally {
      setIsSubmittingModal(false);
    }
  };

  // Class filtering for the grid
  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      const matchesSearch =
        cls.name.toLowerCase().includes(classSearch.toLowerCase()) ||
        cls.id.toLowerCase().includes(classSearch.toLowerCase());
      const matchesShift = shiftFilter === 'todos' || cls.shift === shiftFilter;

      const classStudents = students.filter(s => isStudentInClass(s, cls));
      const classRecords = dailyRecords.filter(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, cls));
      const isRecorded = isClassAttendanceCompleted(classRecords, classStudents);

      let matchesStatus = true;
      if (statusFilter === 'realizadas') {
        matchesStatus = isRecorded;
      } else if (statusFilter === 'pendentes') {
        matchesStatus = !isRecorded;
      }

      return matchesSearch && matchesShift && matchesStatus;
    });
  }, [classes, students, classSearch, shiftFilter, statusFilter, dailyRecords, selectedDate]);

  // Overall grid statistics
  const totalClassesCount = classes.length;
  const recordedClassesCount = useMemo(() => {
    return classes.filter(c => {
      const classStudents = students.filter(s => isStudentInClass(s, c));
      const classRecords = dailyRecords.filter(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, c));
      return isClassAttendanceCompleted(classRecords, classStudents);
    }).length;
  }, [classes, students, dailyRecords, selectedDate]);
  const pendingClassesCount = Math.max(0, totalClassesCount - recordedClassesCount);

  // Modal active students filtered
  const activeClassStudents = useMemo(() => {
    if (!activeModalClass) return [];
    return students.filter(s => isStudentInClass(s, activeModalClass));
  }, [activeModalClass, students]);

  const filteredModalStudents = useMemo(() => {
    return activeClassStudents.filter(s => {
      const q = modalStudentSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.ra.toLowerCase().includes(q) ||
        s.guardianName.toLowerCase().includes(q);

      const matchesRisk = modalRiskFilter === 'todos' || s.riskLevel === modalRiskFilter;
      return matchesSearch && matchesRisk;
    });
  }, [activeClassStudents, modalStudentSearch, modalRiskFilter]);

  // Counts inside active modal
  const modalCounts = useMemo(() => {
    const values = Object.values(modalAttendanceState) as Array<{
      status: AttendanceStatus;
      durationDays?: number;
      justification?: string;
      medicalDays?: number;
      medicalCertificate?: string;
    }>;
    return {
      presentes: values.filter(v => v.status === 'presente').length,
      faltasInjust: values.filter(v => v.status === 'falta_injustificada').length,
      faltasJustif: values.filter(v => v.status === 'falta_justificada').length,
      atestados: values.filter(v => v.status === 'atestado_medico').length,
    };
  }, [modalAttendanceState]);

  const activeCalendar = useMemo(() => storageService.getSchoolCalendar(), [selectedDate]);
  const selectedDateCalStatus = useMemo(
    () => getCalendarDayStatus(selectedDate, activeCalendar),
    [selectedDate, activeCalendar]
  );

  // Dados para o modo Consulta (lê todos os registros sincronizados da escola)
  const allSchoolAttendanceRecords = useMemo(() => {
    const sId = storageService.getActiveSchoolId();
    return storageService.getAttendanceRecords(undefined, undefined, sId);
  }, [dailyRecords, viewMode, selectedDate]);

  const consultationRecordsByDateAndClass = useMemo(() => {
    const list = allSchoolAttendanceRecords.filter(r => {
      if (!r.studentId || r.studentId.startsWith('cls-marker-')) return false;
      if (!isSameDay(r.date, selectedDate)) return false;
      if (consultClassId !== 'todas') {
        const targetCls = classes.find(c => c.id === consultClassId);
        if (targetCls && !isRecordInClass(r, targetCls)) return false;
      }
      if (consultStatusFilter !== 'todos' && r.status !== consultStatusFilter) return false;
      if (consultSearch.trim()) {
        const q = consultSearch.toLowerCase().trim();
        const st = students.find(s => s.id === r.studentId);
        const matchName = (r.studentName || st?.name || '').toLowerCase().includes(q);
        const matchRa = (st?.ra || '').toLowerCase().includes(q);
        const matchClass = (r.className || st?.className || '').toLowerCase().includes(q);
        if (!matchName && !matchRa && !matchClass) return false;
      }
      return true;
    });
    return list.sort((a, b) => (a.className || '').localeCompare(b.className || '') || (a.studentName || '').localeCompare(b.studentName || ''));
  }, [allSchoolAttendanceRecords, selectedDate, consultClassId, consultStatusFilter, consultSearch, classes, students]);

  const consultationStudentHistory = useMemo(() => {
    if (!consultStudentId) return [];
    return allSchoolAttendanceRecords
      .filter(r => r.studentId === consultStudentId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [allSchoolAttendanceRecords, consultStudentId]);

  const selectedConsultStudent = useMemo(
    () => students.find(s => s.id === consultStudentId) || null,
    [students, consultStudentId]
  );

  // Dados computados para o Pop-up de Consulta (Somente Leitura) do Card da Turma
  const handleOpenConsultModal = (cls: SchoolClass) => {
    setConsultModalSearch('');
    setConsultModalStatusFilter('todos');
    setConsultModalClass(cls);
  };

  const consultModalData = useMemo(() => {
    if (!consultModalClass) return null;
    const classStudents = students
      .filter(s => isStudentInClass(s, consultModalClass))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const classRecordsOnDate = dailyRecords.filter(
      r => isSameDay(r.date, selectedDate) && isRecordInClass(r, consultModalClass)
    );

    const rows = classStudents.map(student => {
      const directRec =
        classRecordsOnDate.find(r => r.studentId === student.id) ||
        dailyRecords.find(r => isSameDay(r.date, selectedDate) && r.studentId === student.id);
      const activeAbsence = !directRec
        ? findActiveAbsenceForDate(allSchoolAttendanceRecords, student.id, selectedDate)
        : null;
      const record = directRec || activeAbsence || null;
      return {
        student,
        record,
        status: (record?.status as AttendanceStatus | undefined) || null,
      };
    });

    const recordedBy =
      classRecordsOnDate.find(r => r.recordedBy)?.recordedBy ||
      rows.find(r => r.record?.recordedBy)?.record?.recordedBy ||
      'Registro não identificado';

    const counts = {
      total: rows.length,
      presentes: rows.filter(r => r.status === 'presente' || (r.status as any) === 'atraso').length,
      faltasInjust: rows.filter(r => r.status === 'falta_injustificada').length,
      faltasJustif: rows.filter(r => r.status === 'falta_justificada').length,
      atestados: rows.filter(r => r.status === 'atestado_medico').length,
      semRegistro: rows.filter(r => !r.status).length,
    };

    const q = consultModalSearch.toLowerCase().trim();
    const filteredRows = rows.filter(r => {
      const matchesSearch =
        !q ||
        r.student.name.toLowerCase().includes(q) ||
        (r.student.ra || '').toLowerCase().includes(q);
      const matchesStatus =
        consultModalStatusFilter === 'todos' ||
        (consultModalStatusFilter === 'sem_registro' ? !r.status : r.status === consultModalStatusFilter);
      return matchesSearch && matchesStatus;
    });

    return {
      rows,
      filteredRows,
      counts,
      recordedBy,
    };
  }, [
    consultModalClass,
    students,
    dailyRecords,
    selectedDate,
    allSchoolAttendanceRecords,
    consultModalSearch,
    consultModalStatusFilter,
  ]);

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-black">
                <School className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">
                    {viewMode === 'lancamento' ? 'Lançamento de Frequência Escolar' : 'Consulta de Frequência Escolar'}
                  </h1>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedDateCalStatus.isSchoolDay
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                    {selectedDateCalStatus.reason}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {viewMode === 'lancamento'
                    ? 'Selecione a turma abaixo para lançar ou atualizar a chamada diária via pop-up.'
                    : 'Consulte chamadas já lançadas por data, turma ou histórico individual do estudante (somente leitura).'}
                </p>
              </div>
            </div>

            {/* Alternador de Modo: Lançamento vs Consulta */}
            <div className="mt-3 inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('lancamento')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'lancamento'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Lançamento</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('consulta')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'consulta'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Consulta</span>
              </button>
            </div>
          </div>

          {/* Date & Responsible Form */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-slate-400">Data da Chamada</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-slate-400">Responsável</span>
                <input
                  type="text"
                  value={teacherName}
                  onChange={e => setTeacherName(e.target.value)}
                  placeholder="Nome do AOE / Servidor"
                  className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden w-36 sm:w-44"
                />
              </div>
            </div>

            {onGoToAlerts && (
              <button
                type="button"
                onClick={onGoToAlerts}
                className="px-3 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Ver resumo de faltas e disparar WhatsApp"
              >
                <span>Ausências do Dia</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Botão de Excluir Registros do Dia Selecionado */}
            <button
              type="button"
              onClick={() => handleOpenDeleteModal(null)}
              className="px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs active:scale-95"
              title={`Excluir todos os registros de frequência lançados em ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="hidden sm:inline">Excluir Registros do Dia</span>
              <span className="sm:hidden">Excluir Dia</span>
            </button>
          </div>
        </div>

        {/* Status Toast Notification */}
        {saveSuccessMsg && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSaveSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {saveErrorMsg && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveErrorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSaveErrorMsg(null)}
              className="text-rose-700 hover:text-rose-900 text-xs font-semibold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Progress of Class Attendances */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-xs text-indigo-950 font-semibold">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>
              Progresso do dia ({new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}):
            </span>
            <span className="font-bold text-indigo-700">
              {recordedClassesCount} de {totalClassesCount} turmas lançadas
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center gap-1">
              <Check className="w-3 h-3" />
              {recordedClassesCount} Realizadas
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {pendingClassesCount} Pendentes
            </span>
          </div>
        </div>

        {viewMode === 'lancamento' && (
          <>
            {/* Filter Bar for Class Cards */}
            <div className="mt-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={classSearch}
                  onChange={e => setClassSearch(e.target.value)}
                  placeholder="Buscar turma (ex: 7º Ano A, 9º B, 1ª Série)..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Shift Filter */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  {['todos', 'Manhã', 'Tarde', 'Integral'].map(sh => (
                    <button
                      key={sh}
                      type="button"
                      onClick={() => setShiftFilter(sh)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        shiftFilter === sh
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sh === 'todos' ? 'Todos os Turnos' : sh}
                    </button>
                  ))}
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  {[
                    { id: 'todos', label: 'Todas' },
                    { id: 'realizadas', label: 'Realizadas' },
                    { id: 'pendentes', label: 'Pendentes' },
                  ].map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStatusFilter(st.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        statusFilter === st.id
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODO CONSULTA DE FREQUÊNCIAS */}
      {viewMode === 'consulta' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConsultScope('data_turma')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    consultScope === 'data_turma'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Consulta por Data e Turma
                </button>
                <button
                  type="button"
                  onClick={() => setConsultScope('estudante')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    consultScope === 'estudante'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Histórico Individual do Estudante
                </button>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Modo de consulta somente leitura — sem risco de alterar registros
              </span>
            </div>

            {consultScope === 'data_turma' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Turma:</label>
                    <select
                      value={consultClassId}
                      onChange={e => setConsultClassId(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="todas">Todas as Turmas ({classes.length})</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.shift})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Filtrar Status:</label>
                    <select
                      value={consultStatusFilter}
                      onChange={e => setConsultStatusFilter(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="todos">Todos os Status</option>
                      <option value="presente">Presentes</option>
                      <option value="falta_injustificada">Faltas Injustificadas</option>
                      <option value="falta_justificada">Faltas Justificadas</option>
                      <option value="atestado_medico">Atestados Médicos</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Buscar Estudante / RA:</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={consultSearch}
                        onChange={e => setConsultSearch(e.target.value)}
                        placeholder="Nome, RA ou turma..."
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Resumo quantitativo da consulta */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Registros Filtrados</span>
                    <div className="text-lg font-black text-slate-900">{consultationRecordsByDateAndClass.length}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-emerald-700">Presentes</span>
                    <div className="text-lg font-black text-emerald-900">
                      {consultationRecordsByDateAndClass.filter(r => r.status === 'presente' || (r.status as any) === 'atraso').length}
                    </div>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-rose-700">Faltas Injust.</span>
                    <div className="text-lg font-black text-rose-900">
                      {consultationRecordsByDateAndClass.filter(r => r.status === 'falta_injustificada').length}
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-amber-700">Faltas Justif.</span>
                    <div className="text-lg font-black text-amber-900">
                      {consultationRecordsByDateAndClass.filter(r => r.status === 'falta_justificada').length}
                    </div>
                  </div>
                  <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-cyan-700">Atestados</span>
                    <div className="text-lg font-black text-cyan-900">
                      {consultationRecordsByDateAndClass.filter(r => r.status === 'atestado_medico').length}
                    </div>
                  </div>
                </div>

                {consultationRecordsByDateAndClass.length === 0 ? (
                  <div className="p-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
                    Nenhum registro de frequência localizado para a data <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong> com os filtros aplicados.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                        <tr>
                          <th className="py-2.5 px-4">Estudante</th>
                          <th className="py-2.5 px-3">Turma</th>
                          <th className="py-2.5 px-3">Situação</th>
                          <th className="py-2.5 px-3">Justificativa / Atestado</th>
                          <th className="py-2.5 px-3">Registrado por</th>
                          <th className="py-2.5 px-4 text-right">Dossiê</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {consultationRecordsByDateAndClass.map(rec => {
                          const st = students.find(s => s.id === rec.studentId);
                          return (
                            <tr key={rec.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-4">
                                <div className="font-bold text-slate-900">{rec.studentName || st?.name || 'Estudante'}</div>
                                {st?.ra && <div className="text-[10px] text-slate-500 font-mono">RA: {st.ra}</div>}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700">
                                {rec.className || st?.className || rec.classId}
                              </td>
                              <td className="py-2.5 px-3">
                                {rec.status === 'presente' && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Presente</span>
                                )}
                                {rec.status === 'falta_injustificada' && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">Falta Injustificada</span>
                                )}
                                {rec.status === 'falta_justificada' && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">Falta Justificada</span>
                                )}
                                {rec.status === 'atestado_medico' && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-100 text-cyan-800">Atestado Médico</span>
                                )}
                                {(rec.status as any) === 'atraso' && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-800">Atraso (Histórico)</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                                {rec.justification || rec.medicalCertificate || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                                {rec.recordedBy || '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => onOpenStudentDetail(rec.studentId)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] cursor-pointer"
                                >
                                  Ver Ficha
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Selecione o Estudante para Consultar Histórico:</label>
                    <select
                      value={consultStudentId}
                      onChange={e => setConsultStudentId(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Escolha um estudante --</option>
                      {[...students]
                        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.className} • RA: {s.ra})
                          </option>
                        ))}
                    </select>
                  </div>
                  {selectedConsultStudent && (() => {
                    const calMetrics = getCalendarMetricsSummary(activeCalendar);
                    const totalAbs = consultationStudentHistory.filter(
                      r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
                    ).length || selectedConsultStudent.totalAbsences;
                    const calc = calculateCalendarAttendanceRate(totalAbs, activeCalendar, selectedConsultStudent.totalSchoolDays);
                    return (
                      <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="text-xs">
                          <div className="font-bold text-indigo-950">{selectedConsultStudent.name}</div>
                          <div className="text-[11px] text-indigo-800">
                            Frequência: <strong>{calc.attendanceRate}%</strong> (Base: {calMetrics.elapsedSchoolDays} dias letivos transcorridos)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenStudentDetail(selectedConsultStudent.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer shrink-0"
                        >
                          Dossiê Completo
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {consultStudentId && (
                  consultationStudentHistory.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                      Nenhum registro individual encontrado no diário para este estudante até o momento.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                          <tr>
                            <th className="py-2.5 px-4">Data</th>
                            <th className="py-2.5 px-3">Calendário</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Detalhes / Justificativa</th>
                            <th className="py-2.5 px-3">Responsável pelo Lançamento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {consultationStudentHistory.map(rec => {
                            const dayCal = getCalendarDayStatus(rec.date, activeCalendar);
                            return (
                              <tr key={rec.id} className="hover:bg-slate-50">
                                <td className="py-2.5 px-4 font-bold text-slate-800">
                                  {new Date(normalizeDateStr(rec.date) + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-slate-500">
                                  {dayCal.reason}
                                </td>
                                <td className="py-2.5 px-3">
                                  {rec.status === 'presente' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Presente</span>}
                                  {rec.status === 'falta_injustificada' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">Falta Injustificada</span>}
                                  {rec.status === 'falta_justificada' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">Falta Justificada</span>}
                                  {rec.status === 'atestado_medico' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-100 text-cyan-800">Atestado Médico</span>}
                                  {(rec.status as any) === 'atraso' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-800">Atraso (Histórico)</span>}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">{rec.justification || rec.medicalCertificate || '—'}</td>
                                <td className="py-2.5 px-3 text-slate-500">{rec.recordedBy || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid of All Classes */}
      {viewMode === 'lancamento' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredClasses.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <School className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-sm text-slate-600">Nenhuma turma encontrada com os filtros selecionados.</p>
            <p className="text-xs text-slate-400 mt-1">Experimente limpar a busca ou alterar o turno selecionado.</p>
          </div>
        ) : (
          filteredClasses.map(cls => {
            const classStudents = students.filter(s => isStudentInClass(s, cls));
            const classRecords = dailyRecords.filter(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, cls));
            const isRecorded = isClassAttendanceCompleted(classRecords, classStudents);

            const presentCount = classRecords.filter(r => r.status === 'presente').length;
            const unjustifiedCount = classRecords.filter(r => r.status === 'falta_injustificada').length;
            const justifiedCount = classRecords.filter(r => r.status === 'falta_justificada').length;
            const medicalCount = classRecords.filter(r => r.status === 'atestado_medico').length;
            const absentCount = unjustifiedCount + justifiedCount + medicalCount;
            const totalDocumented = justifiedCount + medicalCount;

            return (
              <div
                key={cls.id}
                className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between p-5 hover:shadow-md ${
                  isRecorded
                    ? 'border-emerald-200 hover:border-emerald-300'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div>
                  {/* Top Bar of Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-black text-slate-900 text-base group-hover:text-indigo-600 transition-colors">
                        {cls.name}
                      </h2>
                      <span className="text-[11px] font-semibold text-slate-500">
                        Turno: {cls.shift}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                        isRecorded
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {isRecorded ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Lançada</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>Pendente</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Student Count & Summary */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span><strong>{classStudents.length}</strong> alunos matriculados</span>
                    </div>
                  </div>

                  {/* Recorded Stats Preview */}
                  <div className="mt-2.5 space-y-1.5">
                    {isRecorded ? (
                      <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-[11px] text-emerald-900 flex items-center justify-between">
                        <span>Presentes: <strong>{presentCount}</strong></span>
                        <span>•</span>
                        <span>Ausentes: <strong className="text-rose-700">{absentCount}</strong></span>
                        <span>•</span>
                        <span>Total: <strong>{classRecords.length}</strong></span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 text-center">
                        Chamada ainda não realizada nesta data
                      </div>
                    )}

                    {totalDocumented > 0 && (
                      <div className="p-2 rounded-xl bg-cyan-50/80 border border-cyan-200 text-[10px] text-cyan-950 font-medium flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Stethoscope className="w-3 h-3 text-cyan-700 shrink-0" />
                          <span>Pré-preenchidos:</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          {medicalCount > 0 && (
                            <span className="font-bold text-cyan-800 bg-white px-1.5 py-0.2 rounded border border-cyan-200">
                              {medicalCount} Atestado(s)
                            </span>
                          )}
                          {justifiedCount > 0 && (
                            <span className="font-bold text-amber-800 bg-white px-1.5 py-0.2 rounded border border-amber-200">
                              {justifiedCount} Justificada(s)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons to Open Pop-up / Consult / Delete */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAttendanceModal(cls)}
                    className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-2xs active:scale-98 ${
                      isRecorded
                        ? 'bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-800'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>{isRecorded ? 'Editar Chamada' : 'Lançar Frequência'}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-70 shrink-0" />
                  </button>

                  {(isRecorded || classRecords.length > 0) && (
                    <button
                      type="button"
                      onClick={() => handleOpenConsultModal(cls)}
                      className="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs shrink-0"
                      title={`Consultar lista de chamada da turma ${cls.name} (somente leitura)`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Consultar</span>
                    </button>
                  )}

                  {isRecorded && (
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(cls)}
                      className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-colors shadow-2xs shrink-0"
                      title={`Excluir chamada da turma ${cls.name} para a data selecionada`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

      {/* ============================================================== */}
      {/* POP-UP MODAL: LANÇAR FREQUÊNCIA DA TURMA                       */}
      {/* ============================================================== */}
      {activeModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-black text-base text-white">
                      Lançar Frequência — {activeModalClass.name}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-800 text-indigo-200">
                      {activeModalClass.shift}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Data: <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong> •
                    Responsável: <strong>{teacherName}</strong> • {activeClassStudents.length} estudantes
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveModalClass(null)}
                className="text-slate-400 hover:text-white p-2 rounded-lg cursor-pointer transition-colors text-lg font-bold"
                title="Fechar pop-up sem salvar"
              >
                ✕
              </button>
            </div>

            {/* Modal Controls and Counters */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={modalStudentSearch}
                    onChange={e => setModalStudentSearch(e.target.value)}
                    placeholder="Buscar estudante por nome ou RA nesta turma..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleModalMarkAllPresent}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors active:scale-95"
                    title="Marcar todos os estudantes desta turma como presentes"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Marcar Todos Presentes</span>
                  </button>
                </div>
              </div>

              {/* Tally Bar */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-600 text-[11px]">Resumo Atual:</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                  {modalCounts.presentes} Presentes
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold text-[11px]">
                  {modalCounts.faltasInjust} Faltas Injust.
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[11px]">
                  {modalCounts.faltasJustif} Faltas Justif.
                </span>
                <span className="px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-800 font-bold text-[11px]">
                  {modalCounts.atestados} Atestados
                </span>
              </div>
            </div>

            {/* Scrollable Students List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {filteredModalStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhum estudante encontrado com a busca digitada.
                </div>
              ) : (
                filteredModalStudents.map(student => {
                  const currentItem = modalAttendanceState[student.id] || {
                    status: 'presente',
                    durationDays: 1,
                  };

                  return (
                    <div
                      key={student.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        currentItem.status === 'presente'
                          ? 'bg-white border-slate-200'
                          : currentItem.status === 'falta_injustificada'
                          ? 'bg-rose-50/50 border-rose-200'
                          : currentItem.status === 'falta_justificada'
                          ? 'bg-amber-50/50 border-amber-200'
                          : currentItem.status === 'atestado_medico'
                          ? 'bg-cyan-50/50 border-cyan-200'
                          : 'bg-slate-100 border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Student Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenStudentDetail(student.id)}
                              className="font-bold text-slate-900 text-xs hover:text-indigo-600 text-left transition-colors cursor-pointer truncate"
                            >
                              {student.name}
                            </button>
                            {student.riskLevel === 'critico' && (
                              <span className="bg-rose-100 text-rose-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-rose-200 shrink-0">
                                CRÍTICO
                              </span>
                            )}
                            {student.riskLevel === 'alto' && (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
                                ALERTA
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            RA: {student.ra} • Faltas consecutivas: {student.consecutiveAbsences || 0}
                          </div>
                        </div>

                        {/* Status Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleModalStatusChange(student.id, 'presente')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              currentItem.status === 'presente'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Presente
                          </button>

                          <button
                            type="button"
                            onClick={() => handleModalStatusChange(student.id, 'falta_injustificada')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              currentItem.status === 'falta_injustificada'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-800'
                            }`}
                          >
                            Falta Injust.
                          </button>

                          <button
                            type="button"
                            onClick={() => handleModalStatusChange(student.id, 'falta_justificada')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              currentItem.status === 'falta_justificada'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-800'
                            }`}
                          >
                            Falta Justif.
                          </button>

                          <button
                            type="button"
                            onClick={() => handleModalStatusChange(student.id, 'atestado_medico')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              currentItem.status === 'atestado_medico'
                                ? 'bg-cyan-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-cyan-100 hover:text-cyan-800'
                            }`}
                          >
                            Atestado Méd.
                          </button>
                        </div>
                      </div>

                      {/* Expandable fields for Falta Justificada */}
                      {currentItem.status === 'falta_justificada' && (
                        <div className="mt-2.5 pt-2 border-t border-amber-200/60 space-y-2 text-xs">
                          {/* Banner informativo de contagem regressiva para Falta Justificada */}
                          <div className="bg-amber-100/80 border border-amber-300 rounded-lg p-2.5 text-[11px] text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs font-medium">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0" />
                              <span>
                                <strong>Justificativa de {currentItem.justificationDays || 1} dia(s):</strong>{' '}
                                {currentItem.justificationDayCurrent ? `Dia ${currentItem.justificationDayCurrent} de ${currentItem.justificationDays || 1}` : `Dia 1 de ${currentItem.justificationDays || 1}`} •{' '}
                                <span className="font-extrabold text-amber-900">
                                  {currentItem.justificationDaysRemaining !== undefined
                                    ? (currentItem.justificationDaysRemaining === 0 ? 'Último dia justificado (conclui hoje)' : currentItem.justificationDaysRemaining === 1 ? 'Resta 1 dia de ausência justificada' : `Faltam ${currentItem.justificationDaysRemaining} dias para finalizar a justificativa`)
                                    : (currentItem.justificationDays || 1) <= 1 ? 'Ausência justificada de 1 dia' : `Faltam ${(currentItem.justificationDays || 1) - 1} dias para finalizar a justificativa`}
                                </span>
                              </span>
                            </div>
                            {(currentItem.justificationDays || 1) > 1 && (
                              <span className="text-[10px] text-amber-900 bg-white/90 px-2 py-0.5 rounded-full border border-amber-300 font-semibold shrink-0">
                                📅 Lançamento automático para os próximos {(currentItem.justificationDays || 1) - 1} dias
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-bold text-amber-900 shrink-0">
                                Total de Dias:
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={30}
                                value={currentItem.justificationDays || 1}
                                onChange={e =>
                                  handleModalJustificationDaysChange(student.id, parseInt(e.target.value) || 1)
                                }
                                className="w-16 px-2 py-1 bg-white border border-amber-300 rounded-md font-bold text-slate-900 text-center"
                              />
                            </div>

                            <div className="flex-1 flex items-center gap-1.5">
                              <label className="text-[11px] font-bold text-amber-900 shrink-0">
                                Motivo / Comunicação:
                              </label>
                              <input
                                type="text"
                                value={currentItem.justification || ''}
                                onChange={e => handleModalJustificationChange(student.id, e.target.value)}
                                placeholder="Ex: Comunicação prévia dos responsáveis / Consulta agendada"
                                className="w-full text-xs px-2.5 py-1 bg-white border border-amber-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-slate-900"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Expandable fields for Atestado Médico */}
                      {currentItem.status === 'atestado_medico' && (
                        <div className="mt-2.5 pt-2 border-t border-cyan-200/60 space-y-2 text-xs">
                          {/* Banner informativo de contagem regressiva e dias restantes */}
                          <div className="bg-cyan-100/80 border border-cyan-300 rounded-lg p-2.5 text-[11px] text-cyan-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs font-medium">
                            <div className="flex items-center gap-2">
                              <Stethoscope className="w-4 h-4 text-cyan-700 shrink-0" />
                              <span>
                                <strong>Atestado de {currentItem.medicalDays || 1} dia(s):</strong>{' '}
                                {currentItem.medicalDayCurrent ? `Dia ${currentItem.medicalDayCurrent} de ${currentItem.medicalDays || 1}` : `Dia 1 de ${currentItem.medicalDays || 1}`} •{' '}
                                <span className="font-extrabold text-cyan-900">
                                  {currentItem.medicalDaysRemaining !== undefined
                                    ? (currentItem.medicalDaysRemaining === 0 ? 'Último dia de atestado (conclui hoje)' : currentItem.medicalDaysRemaining === 1 ? 'Resta 1 dia para finalizar' : `Faltam ${currentItem.medicalDaysRemaining} dias para finalizar`)
                                    : (currentItem.medicalDays || 1) <= 1 ? 'Afastamento de 1 dia' : `Faltam ${(currentItem.medicalDays || 1) - 1} dias para finalizar`}
                                </span>
                              </span>
                            </div>
                            {(currentItem.medicalDays || 1) > 1 && (
                              <span className="text-[10px] text-cyan-800 bg-white/90 px-2 py-0.5 rounded-full border border-cyan-200 font-semibold shrink-0">
                                📅 Lançamento automático para os próximos {(currentItem.medicalDays || 1) - 1} dias
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-bold text-cyan-900 shrink-0">
                                Total de Dias:
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={30}
                                value={currentItem.medicalDays || 1}
                                onChange={e =>
                                  handleModalMedicalDaysChange(student.id, parseInt(e.target.value) || 1)
                                }
                                className="w-16 px-2 py-1 bg-white border border-cyan-300 rounded-md font-bold text-slate-900 text-center"
                              />
                            </div>

                            <div className="flex-1 flex items-center gap-1.5">
                              <label className="text-[11px] font-bold text-cyan-900 shrink-0">
                                CID / Observação:
                              </label>
                              <input
                                type="text"
                                value={currentItem.medicalCertificate || ''}
                                onChange={e =>
                                  setModalAttendanceState(prev => ({
                                    ...prev,
                                    [student.id]: {
                                      ...prev[student.id],
                                      medicalCertificate: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Ex: Sintomas gripais / Repouso médico"
                                className="w-full px-2.5 py-1 bg-white border border-cyan-300 rounded-md text-slate-900 focus:outline-hidden text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 hidden sm:block">
                Após registrar, este pop-up se fechará e a frequência será gravada na nuvem.
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                {dailyRecords.some(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, activeModalClass)) && (
                  <button
                    type="button"
                    onClick={() => handleOpenDeleteModal(activeModalClass)}
                    disabled={isSubmittingModal || isDeletingRecords}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Excluir o lançamento de frequência desta turma"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Excluir Chamada</span>
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveModalClass(null)}
                    disabled={isSubmittingModal || isDeletingRecords}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={handleTriggerSaveModalAttendance}
                    disabled={isSubmittingModal || isDeletingRecords}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {isSubmittingModal
                        ? 'Gravando no Banco...'
                        : dailyRecords.some(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, activeModalClass))
                        ? 'Salvar Alterações'
                        : 'Registrar Frequência'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* POP-UP MODAL: CONSULTAR FREQUÊNCIA DA TURMA (SOMENTE LEITURA)  */}
      {/* ============================================================== */}
      {consultModalClass && consultModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-black text-base text-white">
                      Consulta de Frequência — {consultModalClass.name}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-800 text-indigo-200">
                      {consultModalClass.shift}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Somente Leitura
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Data: <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong> •
                    Registrado por: <strong>{consultModalData.recordedBy}</strong> • {consultModalData.counts.total} estudantes
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConsultModalClass(null)}
                className="text-slate-400 hover:text-white p-2 rounded-lg cursor-pointer transition-colors text-lg font-bold"
                title="Fechar consulta"
              >
                ✕
              </button>
            </div>

            {/* Search & Status Filter + Read-only Tally Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={consultModalSearch}
                    onChange={e => setConsultModalSearch(e.target.value)}
                    placeholder="Buscar estudante por nome ou RA nesta turma..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <select
                  value={consultModalStatusFilter}
                  onChange={e => setConsultModalStatusFilter(e.target.value)}
                  className="text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos os Status ({consultModalData.counts.total})</option>
                  <option value="presente">Presentes ({consultModalData.counts.presentes})</option>
                  <option value="falta_injustificada">Faltas Injustificadas ({consultModalData.counts.faltasInjust})</option>
                  <option value="falta_justificada">Faltas Justificadas ({consultModalData.counts.faltasJustif})</option>
                  <option value="atestado_medico">Atestados Médicos ({consultModalData.counts.atestados})</option>
                  {consultModalData.counts.semRegistro > 0 && (
                    <option value="sem_registro">Sem Registro ({consultModalData.counts.semRegistro})</option>
                  )}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-600 text-[11px]">Resumo Registrado:</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                  {consultModalData.counts.presentes} Presentes
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold text-[11px]">
                  {consultModalData.counts.faltasInjust} Faltas Injust.
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[11px]">
                  {consultModalData.counts.faltasJustif} Faltas Justif.
                </span>
                <span className="px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-800 font-bold text-[11px]">
                  {consultModalData.counts.atestados} Atestados
                </span>
                {consultModalData.counts.semRegistro > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold text-[11px]">
                    {consultModalData.counts.semRegistro} Sem Registro
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Students List (Strictly Read-Only) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
              {consultModalData.filteredRows.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhum estudante encontrado com os filtros aplicados nesta turma.
                </div>
              ) : (
                consultModalData.filteredRows.map(({ student, record, status }) => {
                  const rowBgClass =
                    status === 'presente' || (status as any) === 'atraso'
                      ? 'bg-white border-slate-200'
                      : status === 'falta_injustificada'
                      ? 'bg-rose-50/50 border-rose-200'
                      : status === 'falta_justificada'
                      ? 'bg-amber-50/50 border-amber-200'
                      : status === 'atestado_medico'
                      ? 'bg-cyan-50/50 border-cyan-200'
                      : 'bg-slate-50 border-slate-200';

                  return (
                    <div key={student.id} className={`p-3.5 rounded-xl border ${rowBgClass}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Student Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {student.name}
                            </span>
                            {student.riskLevel === 'critico' && (
                              <span className="bg-rose-100 text-rose-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-rose-200 shrink-0">
                                CRÍTICO
                              </span>
                            )}
                            {student.riskLevel === 'alto' && (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
                                ALERTA
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            RA: {student.ra || 'S/N'} • Faltas acumuladas: {student.totalAbsences || 0}
                          </div>
                        </div>

                        {/* Read-Only Status Badge */}
                        <div className="shrink-0 flex items-center gap-2">
                          {status === 'presente' && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-2xs inline-flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" />
                              Presente
                            </span>
                          )}
                          {status === 'falta_injustificada' && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white shadow-2xs inline-flex items-center gap-1.5">
                              <X className="w-3.5 h-3.5" />
                              Ausente (Falta Injustificada)
                            </span>
                          )}
                          {status === 'falta_justificada' && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white shadow-2xs inline-flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Falta Justificada
                            </span>
                          )}
                          {status === 'atestado_medico' && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 text-white shadow-2xs inline-flex items-center gap-1.5">
                              <Stethoscope className="w-3.5 h-3.5" />
                              Atestado Médico
                            </span>
                          )}
                          {(status as any) === 'atraso' && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-600 text-white shadow-2xs">
                              Atraso (Histórico)
                            </span>
                          )}
                          {!status && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-700">
                              Sem Registro nesta Data
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Read-only Details for Justified Absences or Medical Certificates */}
                      {(status === 'falta_justificada' || status === 'atestado_medico') && record && (
                        <div
                          className={`mt-2 pt-2 border-t text-[11px] flex flex-wrap items-center gap-x-4 gap-y-1 ${
                            status === 'atestado_medico'
                              ? 'border-cyan-200/70 text-cyan-950'
                              : 'border-amber-200/70 text-amber-950'
                          }`}
                        >
                          {status === 'falta_justificada' && (
                            <>
                              <span>
                                <strong>Duração:</strong>{' '}
                                {formatJustificationDaysInfo(
                                  record.justificationDayCurrent || 1,
                                  record.justificationDays || record.durationDays || 1
                                )}
                              </span>
                              {record.justification && (
                                <span>
                                  <strong>Motivo:</strong> {record.justification}
                                </span>
                              )}
                            </>
                          )}
                          {status === 'atestado_medico' && (
                            <>
                              <span>
                                <strong>Vigência:</strong>{' '}
                                {formatMedicalDaysInfo(
                                  record.medicalDayCurrent || 1,
                                  record.medicalDays || record.durationDays || 1
                                )}
                              </span>
                              {(record.medicalCertificate || record.justification) && (
                                <span>
                                  <strong>CID / Observação:</strong>{' '}
                                  {record.medicalCertificate || record.justification}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer (Read-Only) */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Visualização somente leitura — nenhuma alteração pode ser feita nesta tela.</span>
              </div>
              <button
                type="button"
                onClick={() => setConsultModalClass(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL DE CONFIRMAÇÃO: EDITAR / SUBSTITUIR REGISTRO            */}
      {/* ============================================================== */}
      {isEditConfirmOpen && activeModalClass && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-indigo-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-indigo-600" />
              </div>

              <h2 className="text-base font-black text-slate-900 mb-2">
                Aviso: Confirmar Edição e Substituição
              </h2>

              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                A turma <strong>{activeModalClass.name}</strong> já possui chamada lançada para o dia{' '}
                <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>.
              </p>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 mb-6">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-950">Substituição Completa no Banco de Dados:</p>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    Ao confirmar, os <strong>registros anteriores desta turma nesta data serão apagados</strong> e o novo lançamento será gravado e sincronizado no <strong>Firebase Firestore</strong> em tempo real.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditConfirmOpen(false)}
                  disabled={isSubmittingModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={executeSaveModalAttendance}
                  disabled={isSubmittingModal}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmittingModal ? 'Substituindo no Firebase...' : 'Confirmar e Gravar Novo Registro'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL DE CONFIRMAÇÃO: EXCLUIR REGISTROS DO DIA                 */}
      {/* ============================================================== */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6" />
              </div>

              <h2 className="text-base font-black text-slate-900 mb-2">
                {deleteTargetClass
                  ? `Excluir chamada de ${deleteTargetClass.name}?`
                  : 'Excluir registros da data selecionada?'}
              </h2>

              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                {deleteTargetClass ? (
                  <>
                    Você está prestes a excluir os registros de frequência da turma <strong>{deleteTargetClass.name}</strong> para o dia <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>.
                  </>
                ) : (
                  <>
                    Você está prestes a excluir <strong>todos os registros de frequência lançados</strong> no dia <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong> de todas as turmas.
                  </>
                )}
              </p>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2 mb-6">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Esta ação excluirá os registros da base permanente e atualizará o <strong>Firebase Firestore</strong> em tempo real, recalculando as métricas e faltas dos estudantes.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteDialogOpen(false);
                    setDeleteTargetClass(null);
                  }}
                  disabled={isDeletingRecords}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDeleteAttendance}
                  disabled={isDeletingRecords}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingRecords ? 'Excluindo do Firebase...' : 'Confirmar Exclusão'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
