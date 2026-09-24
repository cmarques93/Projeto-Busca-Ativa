import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { migrateToFirebase } from './data/migration';
import { Header, MainTabType } from './components/Header';
import { RealTimeAttendance } from './components/RealTimeAttendance';
import { AlertsManager } from './components/AlertsManager';
import { InterventionsManager } from './components/InterventionsManager';
import { MonthlyReport } from './components/MonthlyReport';
import { StudentDetailModal } from './components/StudentDetailModal';
import { NewAlertModal } from './components/NewAlertModal';
import { AutomatedAlertTriggerModal } from './components/AutomatedAlertTriggerModal';
import { StudentRegistrationModal } from './components/StudentRegistrationModal';
import { WhatsAppIntegrationModal } from './components/WhatsAppIntegrationModal';
import { LoginModal } from './components/LoginModal';
import { GatePassManager } from './components/GatePassManager';
import { TeacherAbsenceView } from './components/TeacherAbsenceView';
import { SeducContingencyReportModal } from './components/SeducContingencyReportModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { AccessManagement } from './components/AccessManagement';
import { ClassesManager } from './components/ClassesManager';
import { LoginScreen } from './components/LoginScreen';
import { OcorrenciasManager } from './components/OcorrenciasManager';
import { TabletsManager } from './components/TabletsManager';
import { FirebaseStatusModal } from './components/FirebaseStatusModal';
import { RotateCcw, ShieldCheck, Trash2, AlertTriangle, CheckCircle2, Database, X, Info, Sparkles } from 'lucide-react';
import { storageService } from './data/storageService';
import { firestoreService } from './lib/firestoreService';
import { salvarCacheOcorrencias, salvarCacheTablets } from './lib/sheetsSyncService';
import {
  Student,
  SchoolClass,
  ParentAlert,
  InterventionCase,
  MonthlyPedagogicalReport,
  AttendanceStatus,
  AlertChannel,
  AlertTrigger,
  InterventionStage,
  UserRole,
  UserSession
} from './types';

export default function App() {
  // Current logged in user session (Inicia nulo para exibir a tela de Login como página inicial)
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  const [activeTab, setActiveTab] = useState<MainTabType>('attendance');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isFirebaseStatusModalOpen, setIsFirebaseStatusModalOpen] = useState(false);
  const [firebaseLoginSyncing, setFirebaseLoginSyncing] = useState(false);
  const [syncNotification, setSyncNotification] = useState<{
    type: 'success' | 'warning' | 'info';
    message: string;
    details?: string;
  } | null>(null);

  // Core data states
  const [schoolInfo, setSchoolInfo] = useState({
    schoolName: 'EE Professor Arlindo Silvestre',
    lastUpdated: new Date().toISOString(),
    totalStudents: 0,
    totalClasses: 0,
    activeAlertsCount: 0,
    activeCasesCount: 0,
  });

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('9A');
  const [students, setStudents] = useState<Student[]>([]);
  const [alerts, setAlerts] = useState<ParentAlert[]>([]);
  const [interventions, setInterventions] = useState<InterventionCase[]>([]);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyPedagogicalReport | null>(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(9);

  // Carregamento direto, completo e em tempo real da base de dados do Firebase Firestore
  const loadAllFromFirebaseDirectly = useCallback(async (isExplicitLogin = false): Promise<boolean> => {
    setIsRefreshing(true);
    if (isExplicitLogin) {
      setFirebaseLoginSyncing(true);
    }
    try {
      const res = await firestoreService.getAllDataDirectly();
      if (res.success) {
        if (res.classes && res.classes.length > 0) {
          setClasses(res.classes);
          storageService.setClasses(res.classes);
          if (!selectedClassId || !res.classes.some((c: any) => c.id === selectedClassId)) {
            setSelectedClassId(res.classes[0].id);
          }
        }
        if (res.students && res.students.length > 0) {
          setStudents(res.students);
          storageService.setStudents(res.students);
        }
        if (res.users && res.users.length > 0) {
          storageService.setUsers(res.users);
        }
        if (res.alerts && res.alerts.length > 0) {
          setAlerts(res.alerts);
          storageService.setAlerts(res.alerts);
        }
        if (res.attendance && res.attendance.length > 0) {
          const localAttendance = storageService.getAttendanceRecords();
          const cloudIds = new Set(res.attendance.map((a: any) => a.id));
          const localOnly = localAttendance.filter(a => !cloudIds.has(a.id));
          storageService.setAttendanceRecords([...res.attendance, ...localOnly]);
        }
        if (res.interventions && res.interventions.length > 0) {
          setInterventions(res.interventions);
          storageService.setInterventions(res.interventions);
        }
        if (res.gate && res.gate.length > 0) {
          storageService.setGateRecords(res.gate);
        }
        if (res.ocorrencias) {
          salvarCacheOcorrencias(res.ocorrencias);
        }
        if (res.tablets) {
          salvarCacheTablets(res.tablets);
        }

        setSchoolInfo(prev => ({
          ...prev,
          totalStudents: res.students.length || prev.totalStudents,
          totalClasses: res.classes.length || prev.totalClasses,
          lastUpdated: new Date().toISOString()
        }));

        if (isExplicitLogin) {
          setSyncNotification({
            type: 'success',
            message: 'Base de dados do Firebase carregada diretamente com sucesso!',
            details: `${res.classes.length} turmas, ${res.students.length} estudantes e registros de ocorrências/tablets sincronizados em tempo real (${res.latencyMs}ms).`
          });
          setTimeout(() => setSyncNotification(null), 7000);
        }
        return true;
      }
    } catch (err) {
      console.warn('Erro ao carregar dados diretamente do Firebase:', err);
      if (isExplicitLogin) {
        setSyncNotification({
          type: 'warning',
          message: 'Operando com cache seguro local e restabelecendo conexão Firebase...',
          details: 'Seus dados continuam preservados e serão sincronizados automaticamente.'
        });
        setTimeout(() => setSyncNotification(null), 6000);
      }
    } finally {
      setIsRefreshing(false);
      setFirebaseLoginSyncing(false);
    }
    return false;
  }, [selectedClassId]);

  const handleSyncData = async () => {
    setIsSyncing(true);
    setSyncMessage('Carregando do Firebase...');
    try {
      const ok = await loadAllFromFirebaseDirectly(true);
      if (ok) {
        setSyncMessage('Firebase sincronizado!');
      } else {
        await migrateToFirebase(true);
        setSyncMessage('Sincronização concluída!');
      }
    } catch (error) {
      console.error('Erro na sincronização:', error);
      setSyncMessage('Erro ao sincronizar. Tente novamente.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  // Usuários com perfil de Professor jamais têm acesso a telefones de responsáveis (LGPD escolar)
  // Podem apenas visualizar o status de frequência, turma, ausências e justificativas
  const visibleStudents = useMemo(() => {
    if (currentUser?.role === 'professor') {
      return students.map(s => ({
        ...s,
        guardianPhone: '',
      }));
    }
    return students;
  }, [students, currentUser?.role]);

  // Modals state
  const [selectedStudentDetailId, setSelectedStudentDetailId] = useState<string | null>(null);
  const [isNewAlertModalOpen, setIsNewAlertModalOpen] = useState(false);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSeducReportModalOpen, setIsSeducReportModalOpen] = useState(false);
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isWipeAllConfirmOpen, setIsWipeAllConfirmOpen] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [roleRestrictionNotice, setRoleRestrictionNotice] = useState<string | null>(null);
  const [preSelectedStudentForAlert, setPreSelectedStudentForAlert] = useState<Student | null>(null);
  const [automatedAlertsTriggered, setAutomatedAlertsTriggered] = useState<ParentAlert[]>([]);

  // AI plan state
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiPlanResult, setAiPlanResult] = useState<{ caseId: string; plan: any } | null>(null);
  const [aiQuotaStatus, setAiQuotaStatus] = useState<any>(null);

  // Fetch AI daily quota status
  const fetchQuotaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/quota-status');
      if (res.ok) {
        const data = await res.json();
        setAiQuotaStatus(data);
      }
    } catch {
      // Ignora erro silencioso se offline
    }
  }, []);

  // Fetch all base data
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    let hasServerInfo = false;
    let hasServerClasses = false;
    let hasServerStudents = false;
    let hasServerAlerts = false;
    let hasServerInterventions = false;
    let hasServerReport = false;

    // Verificar se precisa sincronizar do Google Sheets
    const checkAndSyncFromSheets = async () => {
      try {
        const configRes = await fetch('/api/google-sheets/config');
        if (configRes.ok) {
          const config = await configRes.json();
          if (config.spreadsheetId) {
            // Se tem planilha, tenta importar automaticamente
            const syncRes = await fetch('/api/google-sheets/sync-from-sheet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (syncRes.ok) {
              console.log('Sincronização automática do Sheets realizada com sucesso.');
            }
          }
        }
      } catch (err) {
        console.error('Erro na sincronização automática:', err);
      }
    };

    // Só sincroniza se estiver vazio
    if (!localStorage.getItem('school_students')) {
      await checkAndSyncFromSheets();
    }

    // Busca dados em tempo real da Nuvem central (Firestore) compartilhada entre todos os navegadores
    try {
      const [cloudClasses, cloudStudents, cloudAlerts, cloudAttendance, cloudInterventions, cloudGate] = await Promise.all([
        firestoreService.getClasses(),
        firestoreService.getStudents(),
        firestoreService.getAlerts(),
        firestoreService.getAttendanceRecords(),
        firestoreService.getInterventions(),
        firestoreService.getGateRecords(),
      ]);

      if (cloudClasses && cloudClasses.length > 0) {
        setClasses(cloudClasses);
        storageService.setClasses(cloudClasses);
        hasServerClasses = true;
        if (!selectedClassId || !cloudClasses.some(c => c.id === selectedClassId)) {
          setSelectedClassId(cloudClasses[0].id);
        }
      }
      if (cloudStudents && cloudStudents.length > 0) {
        setStudents(cloudStudents);
        storageService.setStudents(cloudStudents);
        hasServerStudents = true;
      }
      if (cloudAlerts && cloudAlerts.length > 0) {
        setAlerts(cloudAlerts);
        storageService.setAlerts(cloudAlerts);
        hasServerAlerts = true;
      }
      if (cloudAttendance && cloudAttendance.length > 0) {
        const localAttendance = storageService.getAttendanceRecords();
        const cloudIds = new Set(cloudAttendance.map(a => a.id));
        const localOnly = localAttendance.filter(a => !cloudIds.has(a.id));
        storageService.setAttendanceRecords([...cloudAttendance, ...localOnly]);
      }
      if (cloudInterventions && cloudInterventions.length > 0) {
        setInterventions(cloudInterventions);
        storageService.setInterventions(cloudInterventions);
        hasServerInterventions = true;
      }
      if (cloudGate && cloudGate.length > 0) {
        storageService.setGateRecords(cloudGate);
      }
    } catch (cloudErr) {
      console.warn('Erro ao carregar dados do Firestore em App.tsx:', cloudErr);
    }

    try {
      const [infoRes, classesRes, studentsRes, alertsRes, interventionsRes, reportRes] = await Promise.all([
        fetch('/api/school-info').catch(() => null),
        fetch('/api/classes').catch(() => null),
        fetch('/api/students').catch(() => null),
        fetch('/api/alerts').catch(() => null),
        fetch('/api/interventions').catch(() => null),
        fetch(`/api/reports/monthly?month=${selectedMonthIndex}&year=2026`).catch(() => null),
      ]);

      if (infoRes && infoRes.ok && infoRes.headers.get('content-type')?.includes('application/json')) {
        setSchoolInfo(await infoRes.json());
        hasServerInfo = true;
      }
      if (!hasServerClasses && classesRes && classesRes.ok && classesRes.headers.get('content-type')?.includes('application/json')) {
        const clsList = await classesRes.json();
        if (Array.isArray(clsList) && clsList.length > 0) {
          setClasses(clsList);
          hasServerClasses = true;
          if (clsList.length > 0) {
            if (!selectedClassId || !clsList.some((c: any) => c.id === selectedClassId)) {
              setSelectedClassId(clsList[0].id);
            }
          } else {
            setSelectedClassId('');
          }
        }
      }
      if (!hasServerStudents && studentsRes && studentsRes.ok && studentsRes.headers.get('content-type')?.includes('application/json')) {
        const stList = await studentsRes.json();
        if (Array.isArray(stList) && stList.length > 0) {
          setStudents(stList);
          hasServerStudents = true;
        }
      }
      if (alertsRes && alertsRes.ok && alertsRes.headers.get('content-type')?.includes('application/json')) {
        const alList = await alertsRes.json();
        if (Array.isArray(alList)) {
          setAlerts(alList);
          hasServerAlerts = true;
        }
      }
      if (interventionsRes && interventionsRes.ok && interventionsRes.headers.get('content-type')?.includes('application/json')) {
        const intList = await interventionsRes.json();
        if (Array.isArray(intList)) {
          setInterventions(intList);
          hasServerInterventions = true;
        }
      }
      if (reportRes && reportRes.ok && reportRes.headers.get('content-type')?.includes('application/json')) {
        setMonthlyReport(await reportRes.json());
        hasServerReport = true;
      }
    } catch (err) {
      console.warn('API backend indisponível, usando dados locais (storageService):', err);
    } finally {
      // Fallback para quando o app roda na Vercel ou sem backend ativo
      if (!hasServerClasses) {
        const fbClasses = storageService.getClasses();
        setClasses(fbClasses);
        if (fbClasses.length > 0) {
          if (!selectedClassId || !fbClasses.some((c: any) => c.id === selectedClassId)) {
            setSelectedClassId(fbClasses[0].id);
          }
        } else {
          setSelectedClassId('');
        }
      }
      if (!hasServerStudents) {
        setStudents(storageService.getStudents());
      }
      if (!hasServerInfo) {
        setSchoolInfo(storageService.getSchoolInfo());
      }
      if (!hasServerAlerts) {
        setAlerts(storageService.getAlerts());
      }
      if (!hasServerInterventions) {
        setInterventions(storageService.getInterventions());
      }
      if (!hasServerReport) {
        setMonthlyReport(storageService.getMonthlyReport());
      }
      fetchQuotaStatus();
      setIsRefreshing(false);
    }
  }, [selectedClassId, selectedMonthIndex, fetchQuotaStatus]);

  // Load on mount: carrega diretamente do Firebase primeiro
  useEffect(() => {
    loadAllFromFirebaseDirectly(false).then((loaded) => {
      if (!loaded) {
        fetchData();
      }
    });
  }, [loadAllFromFirebaseDirectly, fetchData]);

  // Role selection & Login success handlers
  const handleLoginSuccess = (session: UserSession) => {
    setCurrentUser(session);

    // Carrega dados diretamente do Firebase no exato momento que o usuário loga
    loadAllFromFirebaseDirectly(true);

    // Automatically route to the appropriate tab based on profile
    if (session.role === 'admin') {
      setActiveTab('access_management');
    } else if (session.role === 'professor') {
      setActiveTab('teacher_absence');
    } else if (session.role === 'aoe') {
      if (activeTab !== 'attendance' && activeTab !== 'gate') {
        setActiveTab('attendance');
      }
    } else {
      if (activeTab === 'teacher_absence' || activeTab === 'access_management') {
        setActiveTab('attendance');
      }
    }
  };

  const handleSelectRole = (role: UserRole, customName?: string) => {
    const roleLabels: Record<UserRole, string> = {
      admin: 'Administrador (Master)',
      gestao_paac: 'Gestão / PAAC',
      aoe: 'AOE - Secretaria & Portaria',
      professor: 'Professor Regente',
    };

    const defaultNames: Record<UserRole, string> = {
      admin: 'Administrador Geral',
      gestao_paac: 'Profª. Silvana Rocha',
      aoe: 'Carlos Eduardo Mendes',
      professor: 'Prof. Rogério Silva',
    };

    const session: UserSession = {
      username: role,
      name: customName || defaultNames[role],
      role,
      roleLabel: roleLabels[role],
    };

    handleLoginSuccess(session);
  };

  // Logout handler returning to the login page
  const handleLogout = () => {
    setCurrentUser(null);
  };

  // Handle class selection change
  const handleSelectClass = async (classId: string) => {
    setSelectedClassId(classId);
    try {
      const res = await fetch(`/api/students?classId=${classId}`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setStudents(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Erro ao buscar estudantes da turma via API:', e);
    }
    setStudents(storageService.getStudents(classId));
  };

  // Record Batch Attendance & catch automated alerts
  const handleSaveAttendance = async (
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
  ) => {
    let newAlerts: ParentAlert[] = [];
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, classId, recordedBy: teacherName, date }),
      });

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.newAlerts && data.newAlerts.length > 0) {
          newAlerts = data.newAlerts;
        }
      }
    } catch (e) {
      console.warn('Salvando chamada localmente no storageService permanente:', e);
    }

    // Gravação resiliente definitiva no Firestore e sincronização no storageService
    const localRes = await storageService.recordAttendance(items, classId, teacherName, date);
    if (localRes?.newAlerts && localRes.newAlerts.length > 0) {
      newAlerts = localRes.newAlerts;
    }

    if (newAlerts.length > 0) {
      setAutomatedAlertsTriggered(newAlerts);
      for (const alert of newAlerts) {
        try {
          await firestoreService.saveAlert(alert);
        } catch (alertErr) {
          console.warn('Erro ao salvar alerta gerado no Firestore:', alertErr);
        }
      }
    }

    await fetchData();
    return { newAlerts };
  };

  // Send Manual Alert
  const handleSendManualAlert = async (alertData: {
    studentId: string;
    channel: AlertChannel;
    messageContent: string;
    triggerReason?: AlertTrigger;
    triggerLabel?: string;
  }) => {
    try {
      const res = await fetch('/api/alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: alertData.studentId,
          channel: alertData.channel,
          messageContent: alertData.messageContent,
          triggerReason: alertData.triggerReason,
          triggerLabel: alertData.triggerLabel,
          senderName: currentUser.name,
        }),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        // Backend updated
      }
    } catch (e) {
      console.warn('API de alertas indisponível, registrando localmente:', e);
    }

    const st = students.find(s => s.id === alertData.studentId);
    if (st) {
      storageService.addAlert({
        id: `alt-${Date.now()}`,
        studentId: st.id,
        studentName: st.name,
        classId: st.classId,
        className: st.className,
        guardianPhone: st.guardianPhone,
        guardianName: st.guardianName,
        channel: alertData.channel,
        triggerReason: alertData.triggerReason || '3_faltas_consecutivas',
        triggerLabel: alertData.triggerLabel || 'Alerta Manual',
        status: 'enviado',
        sentAt: new Date().toISOString(),
        messageContent: alertData.messageContent,
        autoGenerated: false,
      });
    }

    await fetchData();
  };

  // Update alert status
  const handleUpdateAlertStatus = async (alertId: string, status: string, notes?: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        // Backend updated
      }
    } catch (e) {
      console.warn('API de status de alerta indisponível, atualizando localmente:', e);
    }

    storageService.updateAlertStatus(alertId, status, notes);
    await fetchData();
  };

  // Add action to intervention case
  const handleAddInterventionAction = async (
    caseId: string,
    action: {
      type: string;
      description: string;
      responsibleParty: string;
      outcome?: string;
      newStage?: InterventionStage;
    }
  ) => {
    try {
      const res = await fetch(`/api/interventions/${caseId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        // Backend updated
      }
    } catch (e) {
      console.warn('API de busca ativa indisponível, registrando ação localmente:', e);
    }

    storageService.addInterventionAction(caseId, action);
    await fetchData();
  };

  // Generate AI Plan for intervention
  const handleGenerateAIPlan = async (caseItemOrId: any, studentIdParam?: string) => {
    setIsGeneratingAI(true);
    setAiPlanResult(null);
    try {
      const caseId = typeof caseItemOrId === 'object' ? caseItemOrId.id : caseItemOrId;
      const studentId = typeof caseItemOrId === 'object' ? caseItemOrId.studentId : studentIdParam;

      const student = students.find(s => s.id === studentId);
      const studentName = student ? student.name : (typeof caseItemOrId === 'object' ? caseItemOrId.studentName : 'Estudante');
      const studentClass = student ? student.className : (typeof caseItemOrId === 'object' ? caseItemOrId.className : '');
      const consecutive = student ? student.consecutiveAbsences : (typeof caseItemOrId === 'object' ? caseItemOrId.consecutiveAbsences : 5);
      const rate = student ? student.attendanceRate : 65;
      const factors = student ? student.vulnerabilityFactors : [];
      const guardian = student ? student.guardianName : '';

      const res = await fetch('/api/ai/intervention-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          studentClass,
          consecutiveAbsences: consecutive,
          attendanceRate: rate,
          vulnerabilityFactors: factors,
          guardianRelationship: guardian,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiPlanResult({ caseId, plan: data });
        if (data.quotaStatus) {
          setAiQuotaStatus(data.quotaStatus);
        }
      }
    } catch (e) {
      console.error('Erro na IA:', e);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Reset database to demo data (opens in-app confirmation modal)
  const handleResetData = () => {
    setIsResetConfirmOpen(true);
  };

  const confirmResetData = async () => {
    setIsResetting(true);
    try {
      await fetch('/api/reset-data', { method: 'POST' });
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setIsResetting(false);
      setIsResetConfirmOpen(false);
    }
  };

  // Factory Reset / Wipe all data (exclusive for Master user)
  const confirmWipeAllData = async () => {
    setIsResetting(true);
    try {
      await fetch('/api/wipe-all', { method: 'POST' }).catch(() => null);
      storageService.wipeAllData(currentUser?.role === 'admin' ? currentUser : undefined);
      setClasses([]);
      setStudents([]);
      setAlerts([]);
      setInterventions([]);
      setSelectedClassId('');
      setSchoolInfo({
        schoolName: 'EE Professor Arlindo Silvestre',
        lastUpdated: new Date().toISOString(),
        totalStudents: 0,
        totalClasses: 0,
        activeAlertsCount: 0,
        activeCasesCount: 0,
      });
      await fetchData();
    } catch (e) {
      console.error('Erro ao executar reset geral:', e);
    } finally {
      setIsResetting(false);
      setIsWipeAllConfirmOpen(false);
      setWipeConfirmText('');
    }
  };

  const handleDeleteAllOpenCases = async () => {
    try {
      await fetch('/api/interventions/delete-open', { method: 'POST' });
      storageService.deleteOpenInterventions();
      await fetchData();
    } catch (e) {
      console.error('Erro ao excluir casos abertos:', e);
    }
  };

  // Open alert modal for specific student
  const handleOpenAlertForStudent = (student: Student) => {
    if (currentUser?.role === 'professor') {
      setRoleRestrictionNotice('O perfil de Professor tem acesso restrito para lançamentos de chamada e não possui autorização para emitir alertas aos pais.');
      return;
    }
    setPreSelectedStudentForAlert(student);
    setIsNewAlertModalOpen(true);
  };

  // Se nenhum usuário estiver logado, exibe a tela de Login como página inicial
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Calculate high-level summary metrics
  const criticalStudentsTotal = students.filter(s => s.riskLevel === 'critico').length;
  const avgAttendanceOverall = monthlyReport ? monthlyReport.averageAttendanceRate : 88.4;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Application Header with Role Switcher & Contingency Button */}
      <Header
        schoolName={schoolInfo.schoolName}
        totalStudents={schoolInfo.totalStudents || students.length}
        criticalStudentsCount={criticalStudentsTotal}
        todayAlertsCount={alerts.length}
        activeInterventionsCount={interventions.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado').length}
        averageAttendance={avgAttendanceOverall}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        onOpenSeducReport={() => setIsSeducReportModalOpen(true)}
        onRefresh={fetchData}
        isRefreshing={isRefreshing}
        onResetData={handleResetData}
        onOpenStudentRegistration={() => setIsRegistrationModalOpen(true)}
        onOpenWhatsAppIntegration={() => setIsWhatsAppModalOpen(true)}
        onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
        onSyncData={handleSyncData}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
        onOpenFirebaseStatus={() => setIsFirebaseStatusModalOpen(true)}
      />

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner de Sincronização em Tempo Real com o Firebase */}
        {syncNotification && (
          <div
            className={`mb-5 p-4 rounded-2xl border flex items-start justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
              syncNotification.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                : 'bg-amber-50/90 border-amber-300 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  syncNotification.type === 'success'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-amber-600 text-white shadow-xs'
                }`}
              >
                <Database className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm flex items-center gap-2">
                  <span>{syncNotification.message}</span>
                  <span className="text-[10px] bg-white/70 px-2 py-0.5 rounded-full font-mono border border-current">
                    Firebase Cloud
                  </span>
                </p>
                {syncNotification.details && (
                  <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                    {syncNotification.details}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setSyncNotification(null)}
              className="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer transition-colors"
              aria-label="Fechar notificação"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Indicador de Carregamento Firebase ao Logar */}
        {firebaseLoginSyncing && (
          <div className="mb-4 py-2.5 px-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-semibold flex items-center gap-2 animate-pulse">
            <Database className="w-4 h-4 animate-spin text-indigo-600" />
            <span>Conectando diretamente à base de dados centralizada do Firebase e sincronizando dados da escola...</span>
          </div>
        )}
        {/* Administrador Master only: Gerenciamento do Banco de Dados de Acessos & Determinação de Perfis */}
        {activeTab === 'access_management' && currentUser.role === 'admin' && (
          <AccessManagement
            onRefresh={fetchData}
            onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
          />
        )}

        {/* Gestão de Turmas & Estudantes: Visível para todos os perfis, com funções e sugestões adaptadas */}
        {activeTab === 'classes' && (
          <ClassesManager
            classes={classes}
            students={visibleStudents}
            currentUser={currentUser}
            onRefresh={fetchData}
            onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
            onOpenStudentRegistration={() => setIsRegistrationModalOpen(true)}
            onOpenResetAllModal={() => {
              setWipeConfirmText('');
              setIsWipeAllConfirmOpen(true);
            }}
          />
        )}

        {/* Professor View: Restricted strictly to absence reasons and medical certificates */}
        {activeTab === 'teacher_absence' && (
          <TeacherAbsenceView
            classes={classes}
            students={visibleStudents}
            teacherName={currentUser.name}
          />
        )}

        {/* AOE, Gestão & Admin View: Daily Attendance with atestado medico & justificativa */}
        {activeTab === 'attendance' && (
          <RealTimeAttendance
            classes={classes}
            selectedClassId={selectedClassId}
            onSelectClass={handleSelectClass}
            students={students}
            currentUser={currentUser}
            onSaveAttendance={handleSaveAttendance}
            onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
            onManualAlert={handleOpenAlertForStudent}
            onGoToAlerts={() => setActiveTab('alerts')}
          />
        )}

        {/* AOE, Gestão & Admin View: Gate tracking (entradas e saídas fora do horário) */}
        {activeTab === 'gate' && (
          <GatePassManager
            students={students}
            classes={classes}
            operatorName={currentUser.name}
          />
        )}

        {/* Gestão/PAAC & Admin: Painel de Ausências do Dia & Alertas WhatsApp */}
        {activeTab === 'alerts' && (currentUser.role === 'gestao_paac' || currentUser.role === 'admin') && (
          <AlertsManager
            alerts={alerts}
            onUpdateAlertStatus={handleUpdateAlertStatus}
            onOpenNewAlertModal={() => {
              setPreSelectedStudentForAlert(null);
              setIsNewAlertModalOpen(true);
            }}
            onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
            students={students}
            classes={classes}
            currentUser={currentUser}
            onSendAlertDirect={async (alertData) => {
              await handleSendManualAlert(alertData);
            }}
            onRefresh={fetchData}
          />
        )}

        {/* Gestão/PAAC & Admin: Active Search Cases & AI */}
        {activeTab === 'interventions' && (currentUser.role === 'gestao_paac' || currentUser.role === 'admin') && (
          <InterventionsManager
            cases={interventions}
            onAddAction={handleAddInterventionAction}
            onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
            onGenerateAIPlan={handleGenerateAIPlan}
            isGeneratingAI={isGeneratingAI}
            aiPlanResult={aiPlanResult}
            aiQuotaStatus={aiQuotaStatus}
            onRefresh={fetchData}
            onDeleteAllOpenCases={handleDeleteAllOpenCases}
          />
        )}

        {/* Gestão/PAAC, Admin & AOE: Monthly Reports */}
        {activeTab === 'reports' && (currentUser.role === 'gestao_paac' || currentUser.role === 'admin' || currentUser.role === 'aoe') && (
          <MonthlyReport
            report={monthlyReport}
            classes={classes}
            students={students}
            alerts={alerts}
            interventions={interventions}
            onSelectMonth={monthIndex => setSelectedMonthIndex(monthIndex)}
            selectedMonthIndex={selectedMonthIndex}
            onRefreshData={fetchData}
          />
        )}

        {/* Registro de Ocorrências & Mediação Disciplinar */}
        {activeTab === 'ocorrencias' && (
          <OcorrenciasManager
            currentUser={currentUser}
            classes={classes}
            students={visibleStudents}
          />
        )}

        {/* Agendamento Semanal de Tablets */}
        {activeTab === 'tablets' && (
          <TabletsManager
            currentUser={currentUser}
            classes={classes}
          />
        )}
      </main>

      {/* Login & Role Selection Modal with User Dropdown & 4-Digit PIN */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentUser={currentUser}
        onSelectRole={handleSelectRole}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* SEDUC Contingency Daily Report Modal for Teachers */}
      <SeducContingencyReportModal
        isOpen={isSeducReportModalOpen}
        onClose={() => setIsSeducReportModalOpen(false)}
        classes={classes}
        currentUser={currentUser}
      />

      {/* Student Registration Modal */}
      <StudentRegistrationModal
        isOpen={isRegistrationModalOpen}
        onClose={() => setIsRegistrationModalOpen(false)}
        classes={classes}
        onStudentRegistered={fetchData}
        onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
      />

      {/* WhatsApp Integration Modal */}
      <WhatsAppIntegrationModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
      />

      {/* Student Details Drawer */}
      <StudentDetailModal
        studentId={selectedStudentDetailId}
        onClose={() => setSelectedStudentDetailId(null)}
        onOpenManualAlert={handleOpenAlertForStudent}
        currentUser={currentUser}
      />

      {/* New Manual Alert Modal */}
      <NewAlertModal
        isOpen={isNewAlertModalOpen}
        onClose={() => {
          setIsNewAlertModalOpen(false);
          setPreSelectedStudentForAlert(null);
        }}
        students={visibleStudents}
        preSelectedStudent={preSelectedStudentForAlert}
        onSendAlert={handleSendManualAlert}
      />

      {/* Automated Alert Trigger Notification Modal */}
      <AutomatedAlertTriggerModal
        alerts={automatedAlertsTriggered}
        onClose={() => setAutomatedAlertsTriggered([])}
        onGoToAlerts={() => setActiveTab('alerts')}
        onGoToInterventions={() => setActiveTab('interventions')}
      />

      {/* Google Sheets Database Integration Modal */}
      <GoogleSheetsModal
        isOpen={isGoogleSheetsModalOpen}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
        onDataRefreshed={fetchData}
      />

      {/* Modal de Confirmação para Restaurar Base Padrão */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Restaurar Base de Dados Padrão
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Deseja restaurar a base de dados da <strong>EE Professor Arlindo Silvestre</strong> para os dados padrão iniciais da escola?
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                disabled={isResetting}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmResetData}
                disabled={isResetting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isResetting ? (
                  <span>Restaurando...</span>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Sim, Restaurar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reset Total do Sistema (Limpar Absolutamente Tudo) - Master Only */}
      {isWipeAllConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Reset Total do Sistema (Zerar Tudo)
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Esta ação apagará <strong>permanentemente</strong> todas as turmas, todos os estudantes, histórico de ausências, chamadas diárias, casos de busca ativa, alertas e usuários secundários.
            </p>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 mt-3 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Apenas o Perfil Master será preservado:</span>
              </p>
              <p>O sistema voltará a um estado 100% limpo, sem resquícios de faltas ou estudantes excluídos, pronto para novos cadastros.</p>
            </div>

            <div className="mt-4">
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Digite <span className="font-mono text-rose-600 font-bold">LIMPAR</span> para confirmar a exclusão geral:
              </label>
              <input
                type="text"
                placeholder="LIMPAR"
                value={wipeConfirmText}
                onChange={e => setWipeConfirmText(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono uppercase tracking-wider focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsWipeAllConfirmOpen(false);
                  setWipeConfirmText('');
                }}
                disabled={isResetting}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmWipeAllData}
                disabled={isResetting || wipeConfirmText !== 'LIMPAR'}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isResetting ? (
                  <span>Limpando Tudo...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Zerar Sistema</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Aviso de Restrição de Perfil */}
      {roleRestrictionNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Acesso Restrito
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              {roleRestrictionNotice}
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setRoleRestrictionNotice(null)}
                className="py-2 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all cursor-pointer shadow-xs"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Status de Conectividade e Certeza de Acesso Universal Firebase */}
      <FirebaseStatusModal
        isOpen={isFirebaseStatusModalOpen}
        onClose={() => setIsFirebaseStatusModalOpen(false)}
        onForceReload={async () => {
          await loadAllFromFirebaseDirectly(true);
        }}
        counts={{
          classesCount: classes.length,
          studentsCount: students.length,
          usersCount: storageService.getUsers().length,
          alertsCount: alerts.length,
          attendanceCount: storageService.getAttendanceRecords().length,
          interventionsCount: interventions.length,
          ocorrenciasCount: 59,
          tabletsCount: 81,
        }}
      />

      {/* Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">EE Professor Arlindo Silvestre</span>
            <span>•</span>
            <span className="font-semibold text-slate-600">Busca Ativa Escolar & Diário Oficial</span>
          </div>
          <div>
            Em conformidade com a Lei de Diretrizes e Bases da Educação Nacional (LDB - Lei 9.394/96) e Diretrizes SEDUC-SP.
          </div>
        </div>
      </footer>
    </div>
  );
}
