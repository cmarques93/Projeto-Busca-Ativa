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
  FileSpreadsheet
} from 'lucide-react';
import { Student, SchoolClass, AttendanceStatus, ParentAlert, AttendanceRecord } from '../types';
import { storageService } from '../data/storageService';
import { firestoreService, isSameDay, normalizeDateStr } from '../lib/firestoreService';
import {
  generateAtestadoRecordsSequence,
  generateJustifiedAbsenceSequence,
  formatMedicalDaysInfo,
  formatJustificationDaysInfo,
  findActiveAbsenceForDate
} from '../utils/atestadoUtils';

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

  if (r.studentId && (r.studentId === `cls-marker-${cls.id}` || r.studentId === `cls-marker-${cId}` || (normCId && r.studentId.includes(normCId)))) return true;

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
      medicalCertificate?: string;
      medicalDays?: number;
      studentName?: string;
      className?: string;
    }[],
    classId: string,
    teacherName: string,
    date?: string
  ) => Promise<{ newAlerts: ParentAlert[] } | void>;
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
  const todayStr = new Date().toISOString().split('T')[0];
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

  // Fetch daily attendance records when date changes
  const loadDailyRecords = async (date: string) => {
    setIsLoadingRecords(true);
    let records: AttendanceRecord[] = [];

    // 1. Fonte da Verdade em Nuvem: Firebase Firestore
    try {
      const firestoreRecords = await firestoreService.getAttendanceRecords();
      if (firestoreRecords && firestoreRecords.length > 0) {
        storageService.setAttendanceRecords(firestoreRecords);
        const dateFirestore = firestoreRecords.filter(r => isSameDay(r.date, date));
        if (dateFirestore.length > 0) {
          records = dateFirestore;
        }
      }
    } catch (err) {
      console.warn('Falha ao obter frequências do Firestore:', err);
    }

    // 2. Fallback: API backend
    if (records.length === 0) {
      try {
        const res = await fetch(`/api/attendance-records?date=${date}`);
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            records = json.filter((r: any) => isSameDay(r.date, date));
          }
        }
      } catch (err) {
        console.warn('API indisponível, consultando storageService:', err);
      }
    }

    // 3. Fallback: storageService local
    if (records.length === 0) {
      records = storageService.getAttendanceRecords(undefined, date);
    } else {
      // Mescla com registros locais que possam ter sido salvos nesta sessão
      const localRecords = storageService.getAttendanceRecords(undefined, date);
      if (localRecords.length > 0) {
        const recordMap = new Map<string, AttendanceRecord>();
        records.forEach(r => recordMap.set(r.studentId, r));
        localRecords.forEach(r => {
          if (!recordMap.has(r.studentId)) {
            recordMap.set(r.studentId, r);
          }
        });
        records = Array.from(recordMap.values());
      }
    }

    // 4. Incorpora ausências ativas por atestado ou justificativa vigentes na data
    const allStored = storageService.getAttendanceRecords();
    const recordMap = new Map<string, AttendanceRecord>();
    records.forEach(r => recordMap.set(r.studentId, r));

    students.forEach(st => {
      const activeAbs = findActiveAbsenceForDate(allStored, st.id, date);
      if (activeAbs) {
        // Se não há registro ou se o registro atual for 'presente' genérico, prioriza a ausência documental ativa
        const existing = recordMap.get(st.id);
        if (!existing || (existing.status !== 'atestado_medico' && existing.status !== 'falta_justificada')) {
          recordMap.set(st.id, activeAbs);
        }
      }
    });

    records = Array.from(recordMap.values());
    setDailyRecords(records);
    setIsLoadingRecords(false);
    return records;
  };

  useEffect(() => {
    loadDailyRecords(selectedDate);
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

  // Submit modal attendance and return to grid
  const handleSaveModalAttendance = async () => {
    if (!activeModalClass) return;
    setIsSubmittingModal(true);

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
        medicalCertificate: entry.medicalCertificate,
        medicalDays: entry.medicalDays,
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
          medicalCertificate: item.medicalCertificate,
          medicalDays: item.medicalDays,
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

    try {
      await onSaveAttendance(items, activeModalClass.id, teacherName, selectedDate);
      // Reload daily records to refresh badges from Firestore
      const updated = await loadDailyRecords(selectedDate);
      if (!updated || updated.length === 0 || !updated.some(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, activeModalClass))) {
        // Preserva os dados otimistas se houver latência de propagação
        setDailyRecords(prev => {
          const filtered = prev.filter(r => !(isSameDay(r.date, selectedDate) && isRecordInClass(r, activeModalClass)));
          return [...filtered, ...optimisticRecords];
        });
      }

      setSaveSuccessMsg(`Frequência da turma "${activeModalClass.name}" registrada com sucesso!`);
      setTimeout(() => setSaveSuccessMsg(null), 5000);

      // Closes modal and returns to grid
      setActiveModalClass(null);
    } catch (err) {
      console.error('Erro ao registrar frequência:', err);
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

      const classRecords = dailyRecords.filter(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, cls));
      const isRecorded = classRecords.length > 0;

      let matchesStatus = true;
      if (statusFilter === 'realizadas') {
        matchesStatus = isRecorded;
      } else if (statusFilter === 'pendentes') {
        matchesStatus = !isRecorded;
      }

      return matchesSearch && matchesShift && matchesStatus;
    });
  }, [classes, classSearch, shiftFilter, statusFilter, dailyRecords, selectedDate]);

  // Overall grid statistics
  const totalClassesCount = classes.length;
  const recordedClassesCount = useMemo(() => {
    return classes.filter(c => dailyRecords.some(r => isSameDay(r.date, selectedDate) && isRecordInClass(r, c))).length;
  }, [classes, dailyRecords, selectedDate]);
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
      atrasos: values.filter(v => v.status === 'atraso').length,
    };
  }, [modalAttendanceState]);

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
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Lançamento de Frequência Escolar
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Selecione a turma abaixo para lançar ou atualizar a chamada diária via pop-up.
                </p>
              </div>
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
      </div>

      {/* Grid of All Classes */}
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
            const isRecorded = classRecords.length > 0;

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

                {/* Action Button to Open Pop-up */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleOpenAttendanceModal(cls)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-2xs active:scale-98 ${
                      isRecorded
                        ? 'bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-800'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{isRecorded ? 'Editar Chamada' : 'Lançar Frequência'}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

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
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 font-bold text-[11px]">
                  {modalCounts.atrasos} Atrasos
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

                          <button
                            type="button"
                            onClick={() => handleModalStatusChange(student.id, 'atraso')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              currentItem.status === 'atraso'
                                ? 'bg-slate-800 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Atraso
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
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 hidden sm:block">
                Após registrar, este pop-up se fechará e a frequência será gravada na nuvem.
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setActiveModalClass(null)}
                  disabled={isSubmittingModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSaveModalAttendance}
                  disabled={isSubmittingModal}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmittingModal ? 'Gravando no Banco...' : 'Registrar Frequência'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
