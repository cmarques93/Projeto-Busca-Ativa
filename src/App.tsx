import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { migrateToFirebase } from './data/migration';
import { Header, MainTabType, MainModuleType } from './components/Header';
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
import { SystemConfigManager } from './components/SystemConfigManager';
import { ClassesManager } from './components/ClassesManager';
import { LoginScreen } from './components/LoginScreen';
import { OcorrenciasManager } from './components/OcorrenciasManager';
import { TabletsManager } from './components/TabletsManager';
import { FirebaseStatusModal } from './components/FirebaseStatusModal';
import { DashboardHome } from './components/DashboardHome';
import { SchoolSelectorModal } from './components/SchoolSelectorModal';
import { CurriculumCalendarModule } from './components/CurriculumCalendarModule';
import {
  RotateCcw,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Database,
  X,
  Info,
  Sparkles,
  UserCheck,
  DoorOpen,
  FileText,
  Users,
  AlertOctagon,
  Smartphone,
  ShieldAlert,
  ArrowRight,
  Edit3,
  Inbox
} from 'lucide-react';
import { storageService } from './data/storageService';
import { firestoreService } from './lib/firestoreService';
import {
  salvarCacheOcorrencias,
  salvarCacheTablets,
  lerCacheOcorrencias,
  lerCacheTablets
} from './lib/sheetsSyncService';
import { getLocalTodayStr } from './utils/reportCalculator';
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
  UserSession,
  School as SchoolType
} from './types';

export default function App() {
  // Current logged in user session (Inicia nulo para exibir a tela de Login como página inicial)
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // Módulos Consolidados de Navegação (Inicia na Tela Inicial)
  const [activeModule, setActiveModule] = useState<MainModuleType>('inicio');
  const [subTabDiario, setSubTabDiario] = useState<'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas'>('hub');
  const [subTabBuscaAtiva, setSubTabBuscaAtiva] = useState<'hub' | 'alertas' | 'casos'>('hub');
  const [ocorrenciasSubTab, setOcorrenciasSubTab] = useState<string>('hub');

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

  // Escolas cadastradas e escola ativa (Multi-Tenant SaaS)
  const [schools, setSchools] = useState<SchoolType[]>(() => storageService.getSchools());
  const [currentSchool, setCurrentSchool] = useState<SchoolType>(() => storageService.getActiveSchool());
  const [isSchoolSelectorOpen, setIsSchoolSelectorOpen] = useState(false);

  // Core data states
  const [schoolInfo, setSchoolInfo] = useState(() => {
    const act = storageService.getActiveSchool();
    return {
      schoolName: act.name,
      lastUpdated: new Date().toISOString(),
      totalStudents: 0,
      totalClasses: 0,
      activeAlertsCount: 0,
      activeCasesCount: 0,
    };
  });

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('9A');
  const [students, setStudents] = useState<Student[]>([]);
  const [alerts, setAlerts] = useState<ParentAlert[]>([]);
  const [interventions, setInterventions] = useState<InterventionCase[]>([]);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyPedagogicalReport | null>(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(9);

  // Carregamento direto, completo e em tempo real da base de dados do Firebase Firestore
  const loadAllFromFirebaseDirectly = useCallback(async (isExplicitLogin = false, targetSchoolId?: string, forceRefresh = false): Promise<boolean> => {
    setIsRefreshing(true);
    if (isExplicitLogin) {
      setFirebaseLoginSyncing(true);
    }
    const sId = targetSchoolId || storageService.getActiveSchoolId();
    try {
      const res = await firestoreService.getAllDataDirectly(sId, forceRefresh);
      if (res.success) {
        if (res.schools && res.schools.length > 0) {
          setSchools(res.schools);
          storageService.setSchools(res.schools);
          const found = res.schools.find((s: SchoolType) => s.id === sId);
          if (found) {
            setCurrentSchool(found);
            setSchoolInfo(prev => ({ ...prev, schoolName: found.name }));
          }
        }
        if (res.classes && res.classes.length > 0) {
          setClasses(res.classes);
          storageService.setClasses(res.classes, sId);
          setSelectedClassId(prev => (!prev || !res.classes.some((c: any) => c.id === prev) ? res.classes[0].id : prev));
        } else {
          const localClasses = storageService.getClasses(sId);
          setClasses(localClasses);
          setSelectedClassId(prev => {
            if (localClasses.length === 0) return '';
            return !prev || !localClasses.some((c: any) => c.id === prev) ? localClasses[0].id : prev;
          });
        }
        if (res.students) {
          const stList = res.students.length > 0 ? res.students : storageService.getStudents(undefined, sId);
          setStudents(stList);
          if (res.students.length > 0) {
            storageService.setStudents(res.students, sId);
          }
        }
        if (res.users && res.users.length > 0) {
          storageService.setUsers(res.users);
        }
        if (res.alerts && res.alerts.length > 0) {
          setAlerts(res.alerts);
          storageService.setAlerts(res.alerts, sId);
        } else {
          setAlerts(storageService.getAlerts(sId));
        }
        if (res.attendance && res.attendance.length > 0) {
          const localAttendance = storageService.getAttendanceRecords(undefined, undefined, sId);
          const cloudIds = new Set(res.attendance.map(a => a.id));
          const localOnly = localAttendance.filter(a => !cloudIds.has(a.id));
          storageService.setAttendanceRecords([...res.attendance, ...localOnly], sId);
        }
        if (res.interventions && res.interventions.length > 0) {
          setInterventions(res.interventions);
          storageService.setInterventions(res.interventions, sId);
        } else {
          setInterventions(storageService.getInterventions(sId));
        }
        if (res.gate && res.gate.length > 0) {
          const localGate = storageService.getGateRecords(undefined, undefined, sId);
          const cloudIds = new Set(res.gate.map(g => g.id));
          const mergedGate = [...res.gate, ...localGate.filter(g => !cloudIds.has(g.id))];
          storageService.setGateRecords(mergedGate, sId);
        }
        if (res.ocorrencias) {
          salvarCacheOcorrencias(res.ocorrencias, sId);
        }
        if (res.tablets) {
          salvarCacheTablets(res.tablets, sId);
        }
        if (res.calendar) {
          storageService.setSchoolCalendar(res.calendar, sId);
        }
        if (res.teacherSchedules && res.teacherSchedules.length > 0) {
          storageService.setTeacherSchedules(res.teacherSchedules, sId);
        }
        if (res.timetableWorkspace) {
          storageService.setTimetableWorkspace(res.timetableWorkspace, sId);
        }

        setSchoolInfo(prev => ({
          ...prev,
          totalStudents: res.students?.length || prev.totalStudents,
          totalClasses: res.classes?.length || prev.totalClasses,
          lastUpdated: new Date().toISOString()
        }));

        if (isExplicitLogin) {
          setSyncNotification({
            type: 'success',
            message: 'Base de dados do Firebase carregada diretamente com sucesso!',
            details: `${res.classes?.length || 0} turmas, ${res.students?.length || 0} estudantes e registros de ocorrências/tablets sincronizados em tempo real (${res.latencyMs}ms).`
          });
          setTimeout(() => setSyncNotification(null), 7000);
        }
        return true;
      } else if (res.quotaExceeded) {
        setSyncNotification({
          type: 'warning',
          message: 'Cota diária gratuita do Firebase Firestore atingida',
          details: 'O Google Cloud bloqueou temporariamente leituras/gravações na nuvem hoje (limite diário gratuito). Clique no botão Firebase no topo para ver o link de upgrade ou aguarde a renovação automática amanhã.'
        });
        setTimeout(() => setSyncNotification(null), 12000);
        return false;
      }
    } catch (err) {
      console.warn('Erro ao carregar dados diretamente do Firebase:', err);
      const localClasses = storageService.getClasses(sId);
      const localStudents = storageService.getStudents(undefined, sId);
      setClasses(localClasses);
      setStudents(localStudents);
      setAlerts(storageService.getAlerts(sId));
      setInterventions(storageService.getInterventions(sId));
      setSelectedClassId(localClasses.length > 0 ? localClasses[0].id : '');
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
  }, []);

  const handleSyncData = async () => {
    setIsSyncing(true);
    setSyncMessage('Carregando do Firebase...');
    try {
      const ok = await loadAllFromFirebaseDirectly(true, undefined, true);
      if (ok) {
        setSyncMessage('Firebase sincronizado!');
      } else if (firestoreService.isQuotaCurrentlyExceeded()) {
        setSyncMessage('Cota diária do Firebase atingida.');
      } else {
        setSyncMessage('Conectado à base local.');
      }
    } catch (error) {
      console.error('Erro na sincronização:', error);
      setSyncMessage('Erro ao sincronizar. Tente novamente.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  // Backup de Segurança Offline: exporta todo o estado atual do storageService local, ocorrências e equipamentos em JSON
  const handleExportOfflineBackup = useCallback(() => {
    if (!currentUser) return;
    const isAuthorized =
      currentUser.role === 'admin' ||
      currentUser.role === 'admin_escola' ||
      currentUser.role === 'super_admin' ||
      currentUser.role === 'gestao_paac' ||
      currentUser.isUniversal === true;

    if (!isAuthorized) {
      setRoleRestrictionNotice('Apenas perfis de Administração e Gestão podem exportar o Backup de Segurança Offline.');
      return;
    }

    try {
      const sId = currentSchool?.id || storageService.getActiveSchoolId();
      const schoolsData = storageService.getSchools();
      const activeSchoolData = storageService.getActiveSchool(sId);
      const classesData = storageService.getClasses(sId);
      const studentsData = storageService.getStudents(undefined, sId);
      const usersData = storageService.getUsers(sId);
      const attendanceData = storageService.getAttendanceRecords(undefined, undefined, sId);
      const alertsData = storageService.getAlerts(sId);
      const interventionsData = storageService.getInterventions(sId);
      const gateData = storageService.getGateRecords(undefined, undefined, sId);
      const calendarData = storageService.getSchoolCalendar(sId);
      const teacherSchedulesData = storageService.getTeacherSchedules(sId);
      const timetableData = storageService.getTimetableWorkspace(sId);
      const ocorrenciasData = lerCacheOcorrencias(sId);
      const tabletsData = lerCacheTablets(sId);

      const ocorrenciasCount = Array.isArray(ocorrenciasData?.registros) ? ocorrenciasData.registros.length : 0;
      const tabletsCount = Array.isArray(tabletsData?.agendamentos) ? tabletsData.agendamentos.length : 0;
      const equipamentosCount = Array.isArray(tabletsData?.equipamentos) ? tabletsData.equipamentos.length : 0;

      const now = new Date();
      const dateStamp = getLocalTodayStr();
      const timeStamp = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;

      const backupPayload = {
        backupVersion: '1.0',
        app: 'SigaEscola',
        exportedAt: now.toISOString(),
        exportedAtLocal: now.toLocaleString('pt-BR'),
        exportedBy: {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          roleLabel: currentUser.roleLabel,
        },
        schoolId: sId,
        schoolName: activeSchoolData?.name || currentSchool?.name || sId,
        summary: {
          classes: classesData.length,
          students: studentsData.length,
          users: usersData.length,
          attendanceRecords: attendanceData.length,
          alerts: alertsData.length,
          interventions: interventionsData.length,
          gateRecords: gateData.length,
          ocorrencias: ocorrenciasCount,
          agendamentosEquipamentos: tabletsCount,
          equipamentosCadastrados: equipamentosCount,
          teacherSchedules: teacherSchedulesData.length,
        },
        data: {
          schools: schoolsData,
          activeSchool: activeSchoolData,
          classes: classesData,
          students: studentsData,
          users: usersData,
          attendanceRecords: attendanceData,
          alerts: alertsData,
          interventions: interventionsData,
          gateRecords: gateData,
          schoolCalendar: calendarData,
          teacherSchedules: teacherSchedulesData,
          timetableWorkspace: timetableData,
          ocorrencias: ocorrenciasData,
          tablets: tabletsData,
        },
      };

      const safeSchoolSlug = (activeSchoolData?.id || sId || 'escola')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');
      const fileName = `backup-sigaescola-${safeSchoolSlug}-${dateStamp}_${timeStamp}.json`;

      const jsonStr = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setSyncNotification({
        type: 'success',
        message: 'Backup de Segurança Offline baixado com sucesso!',
        details: `Arquivo ${fileName} salvo no seu computador com ${classesData.length} turmas, ${studentsData.length} estudantes, ${interventionsData.length} intervenções, ${ocorrenciasCount} ocorrências, ${tabletsCount} agendamentos de equipamentos e ${attendanceData.length} chamadas.`
      });
      setTimeout(() => setSyncNotification(null), 9000);
    } catch (error: any) {
      console.error('Erro ao gerar Backup de Segurança Offline:', error);
      setSyncNotification({
        type: 'warning',
        message: 'Não foi possível gerar o arquivo de Backup Offline.',
        details: error?.message || 'Tente novamente em instantes.'
      });
      setTimeout(() => setSyncNotification(null), 7000);
    }
  }, [currentUser, currentSchool]);

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

  // Apenas estudantes com matrícula ativa (exclui estudantes transferidos das chamadas e métricas ativas)
  const activeStudents = useMemo(
    () => students.filter(s => s.status !== 'transferido'),
    [students]
  );

  const visibleActiveStudents = useMemo(
    () => visibleStudents.filter(s => s.status !== 'transferido'),
    [visibleStudents]
  );

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

  // Atualiza estado da interface imediatamente a partir do armazenamento sincronizado local,
  // evitando varreduras completas repetidas de 8 coleções no Firestore a cada cadastro ou edição.
  // Para forçar recarga completa da nuvem, utiliza-se loadAllFromFirebaseDirectly(..., true).
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const sId = storageService.getActiveSchoolId();
      const localClasses = storageService.getClasses(sId);
      const localStudents = storageService.getStudents(undefined, sId);
      const localAlerts = storageService.getAlerts(sId);
      const localInterventions = storageService.getInterventions(sId);

      setSchools(storageService.getSchools());
      setCurrentSchool(storageService.getActiveSchool(sId));
      setClasses(localClasses);
      setStudents(localStudents);
      setAlerts(localAlerts);
      setInterventions(localInterventions);
      setSchoolInfo(storageService.getSchoolInfo(sId));
      setMonthlyReport(storageService.getMonthlyReport(selectedMonthIndex));
      setSelectedClassId(prev => {
        if (localClasses.length === 0) return '';
        return !prev || !localClasses.some(c => c.id === prev) ? localClasses[0].id : prev;
      });
    } finally {
      fetchQuotaStatus();
      setIsRefreshing(false);
    }
  }, [selectedMonthIndex, fetchQuotaStatus]);

  // Load on mount: carrega cache local imediato e sincroniza com Firebase uma única vez (sem recarregar 13 coleções ao trocar mês)
  useEffect(() => {
    const sId = storageService.getActiveSchoolId();
    const localClasses = storageService.getClasses(sId);
    const localStudents = storageService.getStudents(undefined, sId);
    setClasses(localClasses);
    setStudents(localStudents);
    setAlerts(storageService.getAlerts(sId));
    setInterventions(storageService.getInterventions(sId));
    setSchoolInfo(storageService.getSchoolInfo(sId));
    setMonthlyReport(storageService.getMonthlyReport(selectedMonthIndex));
    setSelectedClassId(prev => {
      if (localClasses.length === 0) return '';
      return !prev || !localClasses.some(c => c.id === prev) ? localClasses[0].id : prev;
    });

    loadAllFromFirebaseDirectly(false).then((loaded) => {
      if (!loaded) {
        fetchQuotaStatus();
      }
    });
  }, [loadAllFromFirebaseDirectly, fetchQuotaStatus]);

  // Recalcula o relatório mensal localmente quando o mês selecionado muda
  useEffect(() => {
    setMonthlyReport(storageService.getMonthlyReport(selectedMonthIndex));
  }, [selectedMonthIndex]);

  // Troca de Escola Ativa no Sistema (Multi-Tenant)
  const handleSwitchSchool = async (schoolId: string) => {
    storageService.setActiveSchoolId(schoolId);
    const active = storageService.getActiveSchool();
    setCurrentSchool(active);
    setSchoolInfo(prev => ({
      ...prev,
      schoolName: active.name,
    }));
    if (currentUser) {
      setCurrentUser(prev => prev ? { ...prev, schoolId: active.id, schoolName: active.name } : null);
    }
    await loadAllFromFirebaseDirectly(false, schoolId);
  };

  // Role selection & Login success handlers (direciona Painel Master para Central Global e usuários escolares para Tela Inicial)
  const handleLoginSuccess = (session: UserSession) => {
    setCurrentUser(session);
    if (session.schoolId) {
      storageService.setActiveSchoolId(session.schoolId);
      const active = storageService.getActiveSchool();
      setCurrentSchool(active);
      setSchoolInfo(prev => ({
        ...prev,
        schoolName: active.name,
      }));
    }

    // Carrega dados diretamente do Firebase no exato momento que o usuário loga
    loadAllFromFirebaseDirectly(true, session.schoolId);

    // Se for o Painel Master Global, abre diretamente a Central Global de Unidades Escolares
    if (session.role === 'super_admin' || session.isUniversal) {
      setActiveModule('system_manager');
    } else {
      // Redireciona os operadores escolares para a Tela Inicial da sua escola
      setActiveModule('inicio');
    }

    // Prepara sub-abas ideais caso o usuário navegue para os módulos
    setSubTabDiario('hub');
    setSubTabBuscaAtiva('hub');
    setOcorrenciasSubTab(session.role === 'professor' ? 'hub' : 'pendentes');
    setActiveTab(session.role === 'professor' ? 'teacher_absence' : 'attendance');
  };

  // Navegação direta acionada pelos cards/botões da Tela Inicial de acordo com o perfil
  const handleNavigateFromHome = (
    module: MainModuleType,
    subDiario?: 'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas',
    subBuscaAtiva?: 'hub' | 'alertas' | 'casos',
    ocorrTab?: string
  ) => {
    setActiveModule(module);
    setSubTabDiario(subDiario || 'hub');
    setSubTabBuscaAtiva(subBuscaAtiva || 'hub');
    if (ocorrTab) {
      setOcorrenciasSubTab(ocorrTab);
    } else if (module === 'ocorrencias') {
      setOcorrenciasSubTab(currentUser?.role === 'professor' ? 'hub' : 'pendentes');
    }
  };

  // Botão "Voltar à tela anterior"
  const handleGoBack = () => {
    if (activeModule === 'diario') {
      if (subTabDiario !== 'hub' && currentUser?.role !== 'professor') {
        setSubTabDiario('hub');
      } else {
        setActiveModule('inicio');
      }
    } else if (activeModule === 'busca_ativa') {
      if (subTabBuscaAtiva !== 'hub') {
        setSubTabBuscaAtiva('hub');
      } else {
        setActiveModule('inicio');
      }
    } else if (activeModule === 'ocorrencias') {
      if (currentUser?.role === 'professor' && ocorrenciasSubTab !== 'hub') {
        setOcorrenciasSubTab('hub');
      } else {
        setActiveModule('inicio');
      }
    } else {
      setActiveModule('inicio');
    }
  };

  // Botão "Tela de Início"
  const handleGoHome = () => {
    setActiveModule('inicio');
    setSubTabDiario('hub');
    setSubTabBuscaAtiva('hub');
    setOcorrenciasSubTab(currentUser?.role === 'professor' ? 'hub' : 'pendentes');
  };

  // Breadcrumb legível para o cabeçalho
  const getBreadcrumbText = (): string => {
    if (activeModule === 'inicio') return 'Tela Inicial';
    if (activeModule === 'diario') {
      if (subTabDiario === 'hub') return 'Diário & Portaria';
      if (subTabDiario === 'chamada') return 'Diário & Portaria > Chamada por Turma';
      if (subTabDiario === 'portaria') return 'Diário & Portaria > Controle de Portaria';
      if (subTabDiario === 'ausencias') return 'Diário & Portaria > Diário do Professor';
      if (subTabDiario === 'turmas') return 'Diário & Portaria > Relação de Turmas';
    }
    if (activeModule === 'busca_ativa') {
      if (subTabBuscaAtiva === 'hub') return 'Busca Ativa Escolar';
      if (subTabBuscaAtiva === 'alertas') return 'Busca Ativa > Ausências & WhatsApp';
      if (subTabBuscaAtiva === 'casos') return 'Busca Ativa > Casos de Busca Ativa & IA';
    }
    if (activeModule === 'ocorrencias') {
      if (currentUser?.role === 'professor') {
        if (ocorrenciasSubTab === 'hub') return 'Ocorrências Escolares';
        if (ocorrenciasSubTab === 'registrar') return 'Ocorrências Escolares > Nova Ocorrência';
        if (ocorrenciasSubTab === 'meus_registros') return 'Ocorrências Escolares > Meus Registros';
        if (ocorrenciasSubTab === 'devolutivas') return 'Ocorrências Escolares > Minhas Devolutivas';
        if (ocorrenciasSubTab === 'tutorados') return 'Ocorrências Escolares > Meus Tutorados';
      }
      return 'Ocorrências & Mediação';
    }
    if (activeModule === 'tablets') return 'Agendamento de Equipamentos';
    if (activeModule === 'grade_calendario') return 'Grade Curricular & Calendário Letivo';
    if (activeModule === 'relatorios') return 'Relatórios Pedagógicos';
    if (activeModule === 'system_manager') return 'Gerenciador Central do Sistema';
    return '';
  };

  const handleSelectRole = (role: UserRole, customName?: string) => {
    const roleLabels: Record<UserRole, string> = {
      super_admin: 'Proprietário / Admin Universal (SaaS)',
      admin_escola: 'Administrador da Unidade Escolar',
      admin: 'Administrador da Unidade Escolar',
      gestao_paac: 'Gestão / PAAC',
      aoe: 'AOE - Secretaria & Portaria',
      professor: 'Professor Regente',
    };

    const defaultNames: Record<UserRole, string> = {
      super_admin: 'Proprietário (Acesso Universal)',
      admin_escola: 'Admin da Escola',
      admin: 'Administrador Geral',
      gestao_paac: 'Profª. Silvana Rocha',
      aoe: 'Carlos Eduardo Mendes',
      professor: 'Prof. Rogério Silva',
    };

    const activeSc = storageService.getActiveSchool();
    const session: UserSession = {
      username: role,
      name: customName || defaultNames[role],
      role,
      roleLabel: roleLabels[role],
      schoolId: activeSc.id,
      schoolName: activeSc.name,
    };

    handleLoginSuccess(session);
  };

  // Logout handler returning to the login page
  const handleLogout = () => {
    setCurrentUser(null);
  };

  // Handle class selection change (preserva a lista global de estudantes da unidade escolar)
  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
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
      const sId = storageService.getActiveSchoolId();
      setAutomatedAlertsTriggered(newAlerts);
      for (const alert of newAlerts) {
        try {
          await firestoreService.saveAlert({ ...alert, schoolId: alert.schoolId || sId }, sId);
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
      action?: string;
      author?: string;
      notes?: string;
      result?: string;
      advanceStageTo?: InterventionStage;
      type?: string;
      description?: string;
      responsibleParty?: string;
      outcome?: string;
      newStage?: InterventionStage;
    }
  ) => {
    const sId = storageService.getActiveSchoolId();
    storageService.addInterventionAction(caseId, action, sId);

    fetch(`/api/interventions/${encodeURIComponent(caseId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    }).catch(() => {});

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
      storageService.wipeAllData((currentUser?.role === 'admin' || currentUser?.role === 'admin_escola' || currentUser?.role === 'super_admin') ? currentUser : undefined);
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

  const handleCreateCase = async (caseData: Partial<InterventionCase>) => {
    const sId = storageService.getActiveSchoolId();
    const todayLocal = getLocalTodayStr();
    const newCase: InterventionCase = {
      id: `int-${Date.now()}`,
      studentId: caseData.studentId || '',
      studentName: caseData.studentName || '',
      classId: caseData.classId || '',
      className: caseData.className || '',
      guardianName: caseData.guardianName || '',
      guardianPhone: caseData.guardianPhone || '',
      priority: caseData.priority || 'alta',
      stage: caseData.stage || 'alerta_inicial',
      openedAt: todayLocal,
      lastUpdatedAt: todayLocal,
      assignedPedagogue: caseData.assignedPedagogue || currentUser.name || 'Coordenação Pedagógica / PAAC',
      reason: caseData.reason || 'Infrequência escolar recorrente identificada',
      schoolId: sId,
      actionPlan: caseData.actionPlan || [
        'Contato telefônico e envio de notificação aos responsáveis via WhatsApp',
        'Pactuação de compromisso e retorno às aulas presenciais',
        'Encaminhamento ao Conselho Tutelar (FICAI) caso não haja comparecimento em 48h'
      ],
      actionLog: [
        {
          id: `act-${Date.now()}`,
          date: todayLocal,
          action: 'Abertura Formal do Caso de Busca Ativa',
          author: currentUser.name || 'Coordenação Pedagógica',
          notes: caseData.reason || 'Caso instaurado para acompanhamento pedagógico e garantia da frequência escolar.',
          result: 'Aguardando primeiro contato com os responsáveis.',
        }
      ]
    };

    const list = storageService.getInterventions(sId);
    list.unshift(newCase);
    storageService.setInterventions(list, sId);
    setInterventions(list);

    try {
      await firestoreService.saveIntervention(newCase, sId);
    } catch (err) {
      console.warn('Erro ao salvar caso no Firestore:', err);
    }
    await fetchData();
  };

  const handleAutoGenerateCasesFromRiskStudents = async (): Promise<number> => {
    const sId = storageService.getActiveSchoolId();
    const todayLocal = getLocalTodayStr();
    const existingCases = storageService.getInterventions(sId);
    const existingStudentIds = new Set(existingCases.map(c => c.studentId));
    
    // Identifica estudantes ativos em situação de atenção ou risco de infrequência
    let riskStudents = activeStudents.filter(
      s => (
        s.riskLevel === 'critico' ||
        s.riskLevel === 'alto' ||
        s.status === 'evasao_iminente' ||
        s.status === 'em_busca_ativa' ||
        s.status === 'alerta' ||
        (s.consecutiveAbsences && s.consecutiveAbsences >= 2) ||
        (s.totalAbsences && s.totalAbsences >= 2) ||
        (s.attendanceRate && s.attendanceRate <= 85)
      ) && !existingStudentIds.has(s.id)
    );

    // Se nenhum estiver com risco elevado, busca qualquer estudante ativo com histórico de faltas não justificadas
    if (riskStudents.length === 0) {
      riskStudents = activeStudents.filter(
        s => (
          (s.totalAbsences && s.totalAbsences > 0) ||
          (s.consecutiveAbsences && s.consecutiveAbsences > 0) ||
          (s.attendanceRate && s.attendanceRate < 100)
        ) && !existingStudentIds.has(s.id)
      );
    }

    if (riskStudents.length === 0) return 0;

    const newCases: InterventionCase[] = riskStudents.map(st => {
      const absences = st.consecutiveAbsences || st.totalAbsences || 1;
      const rate = st.attendanceRate ?? 75;
      const isUrgent = absences >= 4 || rate < 75 || st.riskLevel === 'critico';

      return {
        id: `int-${Date.now()}-${st.id}`,
        studentId: st.id,
        studentName: st.name,
        classId: st.classId,
        className: st.className,
        guardianName: st.guardianName || 'Responsável Legal',
        guardianPhone: st.guardianPhone || '',
        priority: isUrgent ? 'urgente_conselho' : 'alta',
        stage: 'alerta_inicial',
        openedAt: todayLocal,
        lastUpdatedAt: todayLocal,
        assignedPedagogue: currentUser?.name || 'Coordenação Pedagógica / PAAC',
        reason: `Gatilho de Busca Ativa (Resolução SEDUC 39/2023): ${absences} ausência(s) registrada(s). Frequência apurada: ${rate}%. ${st.vulnerabilityFactors?.join(', ') || ''}`.trim(),
        schoolId: sId,
        actionPlan: [
          'Contato telefônico e envio de notificação formal aos responsáveis via WhatsApp',
          'Agendamento de reunião presencial para acolhimento e pactuação de retorno',
          'Encaminhamento formal ao Conselho Tutelar (FICAI) caso persista a infrequência'
        ],
        actionLog: [
          {
            id: `act-${Date.now()}-${st.id}`,
            date: todayLocal,
            action: 'Identificação de Infrequência Escolar & Abertura de Caso',
            author: currentUser?.name || 'Coordenação Pedagógica / PAAC',
            notes: `Estudante com ${absences} ausência(s) e taxa de assiduidade de ${rate}%. Caso aberto para acompanhamento pedagógico contínuo.`,
            result: 'Aguardando contato inicial com os responsáveis.',
          }
        ]
      };
    });

    const updatedList = [...newCases, ...existingCases];
    storageService.setInterventions(updatedList, sId);
    setInterventions(updatedList);

    for (const c of newCases) {
      try {
        await firestoreService.saveIntervention(c, sId);
      } catch (e) {
        console.warn('Erro ao salvar caso no Firestore:', e);
      }
    }

    await fetchData();
    return newCases.length;
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
  const criticalStudentsTotal = activeStudents.filter(s => s.riskLevel === 'critico').length;
  const avgAttendanceOverall = monthlyReport ? monthlyReport.averageAttendanceRate : 88.4;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Application Header with SigaEscola brand & clean action bar */}
      <Header
        schoolName={currentSchool.name}
        currentUser={currentUser}
        currentSchool={currentSchool}
        activeModule={activeModule}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenSchoolSelector={() => setIsSchoolSelectorOpen(true)}
        onOpenMasterPanel={() => setActiveModule('system_manager')}
        onLogout={handleLogout}
        onOpenSeducReport={() => setIsSeducReportModalOpen(true)}
        onExportOfflineBackup={handleExportOfflineBackup}
        onSyncData={handleSyncData}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
        onGoBack={handleGoBack}
        onGoHome={handleGoHome}
        canGoBack={true}
        breadcrumb={getBreadcrumbText()}
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

        {/* ========================================================================= */}
        {/* TELA INICIAL (DASHBOARD PERSONALIZADO POR PERFIL DA UNIDADE ESCOLAR)      */}
        {/* ========================================================================= */}
        {activeModule === 'inicio' && !currentUser.isUniversal && currentUser.role !== 'super_admin' && (
          <DashboardHome
            currentUser={currentUser}
            currentSchool={currentSchool}
            onOpenSchoolSelector={() => setIsSchoolSelectorOpen(true)}
            classes={classes}
            students={visibleActiveStudents}
            alerts={alerts}
            interventions={interventions}
            averageAttendance={avgAttendanceOverall}
            criticalStudentsCount={criticalStudentsTotal}
            onNavigate={handleNavigateFromHome}
            onSelectStudent={(student) => setSelectedStudentDetailId(student.id)}
            onOpenStudentRegistration={() => setIsRegistrationModalOpen(true)}
            onOpenSeducReport={() => setIsSeducReportModalOpen(true)}
            onOpenFirebaseStatus={() => setIsFirebaseStatusModalOpen(true)}
          />
        )}

        {/* ========================================================================= */}
        {/* MÓDULO 1: DIÁRIO & PORTARIA (NAVEGAÇÃO POR CARDS - OPERADORES ESCOLARES)  */}
        {/* ========================================================================= */}
        {activeModule === 'diario' && !currentUser.isUniversal && currentUser.role !== 'super_admin' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Hub de Cards para Diário & Portaria */}
            {subTabDiario === 'hub' && (
              <div className="space-y-4">
                <div className="mb-2">
                  <h2 className="text-lg font-black text-slate-900">
                    Diário & Portaria • Sub-menus
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione uma das opções abaixo para realizar seus lançamentos
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {currentUser.role !== 'professor' && (
                    <div
                      onClick={() => setSubTabDiario('chamada')}
                      className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                          <UserCheck className="w-6 h-6" />
                        </div>
                        <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-indigo-600 transition-colors">
                          Chamada por Turma
                        </h3>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                          Lançar presenças, ausências e acompanhar percentual de frequência escolar das turmas.
                        </p>
                      </div>
                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                        <span>Abrir Chamada</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  )}

                  {currentUser.role !== 'professor' && (
                    <div
                      onClick={() => setSubTabDiario('portaria')}
                      className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-2xs">
                          <DoorOpen className="w-6 h-6" />
                        </div>
                        <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-blue-600 transition-colors">
                          Controle de Portaria
                        </h3>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                          Registrar entradas tardias de alunos e autorizações de saída antecipada com responsáveis.
                        </p>
                      </div>
                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
                        <span>Abrir Portaria</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  )}

                  <div
                    onClick={() => setSubTabDiario('ausencias')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-2xs">
                        <FileText className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-emerald-600 transition-colors">
                        Diário do Professor
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Lançamento de ausências, presenças e justificativas médicas por disciplina.
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
                      <span>Abrir Diário</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <div
                    onClick={() => setSubTabDiario('turmas')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-slate-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-slate-700 group-hover:text-white transition-all shadow-2xs">
                        <Users className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-slate-800 transition-colors">
                        Relação de Turmas
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Dossiê completo de turmas, listagem nominal de alunos e situação cadastral.
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>Ver Turmas</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Conteúdo da Sub-Aba do Diário */}
            {subTabDiario === 'chamada' && currentUser.role !== 'professor' && (
              <RealTimeAttendance
                classes={classes}
                selectedClassId={selectedClassId}
                onSelectClass={handleSelectClass}
                students={activeStudents}
                currentUser={currentUser}
                onSaveAttendance={handleSaveAttendance}
                onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
                onManualAlert={handleOpenAlertForStudent}
                onGoToAlerts={() => {
                  setActiveModule('busca_ativa');
                  setSubTabBuscaAtiva('alertas');
                }}
              />
            )}

            {subTabDiario === 'portaria' && currentUser.role !== 'professor' && (
              <GatePassManager
                students={activeStudents}
                classes={classes}
                operatorName={currentUser.name}
              />
            )}

            {subTabDiario === 'ausencias' && (
              <TeacherAbsenceView
                classes={classes}
                students={visibleActiveStudents}
                teacherName={currentUser.name}
                currentUser={currentUser}
              />
            )}

            {subTabDiario === 'turmas' && (
              <ClassesManager
                classes={classes}
                students={visibleStudents}
                currentUser={currentUser}
                onRefresh={fetchData}
                onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
                onOpenStudentRegistration={() => setIsRegistrationModalOpen(true)}
                onOpenCalendarModule={() => setActiveModule('grade_calendario')}
                onOpenResetAllModal={() => {
                  setWipeConfirmText('');
                  setIsWipeAllConfirmOpen(true);
                }}
              />
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* MÓDULO 2A: BUSCA ATIVA ESCOLAR (SEPARADO DE OCORRÊNCIAS)                  */}
        {/* ========================================================================= */}
        {activeModule === 'busca_ativa' && !currentUser.isUniversal && currentUser.role !== 'super_admin' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Hub de Cards exclusivo da Busca Ativa */}
            {subTabBuscaAtiva === 'hub' && (
              <div className="space-y-4">
                <div className="mb-2">
                  <h2 className="text-lg font-black text-slate-900">
                    Busca Ativa Escolar • Sub-menus
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione uma das opções abaixo para gerenciar ausências, comunicados aos responsáveis e casos de Busca Ativa
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => setSubTabBuscaAtiva('alertas')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-2xs">
                        <Smartphone className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-emerald-600 transition-colors">
                        Ausências & WhatsApp
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Notificação via WhatsApp para responsáveis sobre faltas do dia e histórico de respostas/justificativas.
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
                      <span>Abrir Ausências & Alertas</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <div
                    onClick={() => setSubTabBuscaAtiva('casos')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-rose-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-rose-600 group-hover:text-white transition-all shadow-2xs">
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-rose-600 transition-colors">
                        Casos de Busca Ativa & IA
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Acompanhamento formal de casos de evasão/infrequência crítica (etapas FICAI, reuniões, Conselho Tutelar e plano IA).
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-rose-600">
                      <span>Abrir Casos</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {subTabBuscaAtiva === 'alertas' && (currentUser.role === 'gestao_paac' || currentUser.role === 'admin' || currentUser.role === 'admin_escola') && (
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

            {subTabBuscaAtiva === 'casos' && (currentUser.role === 'gestao_paac' || currentUser.role === 'admin' || currentUser.role === 'admin_escola') && (
              <InterventionsManager
                cases={interventions}
                students={activeStudents}
                currentUser={currentUser}
                onAddAction={handleAddInterventionAction}
                onCreateCase={handleCreateCase}
                onAutoGenerateCasesFromRiskStudents={handleAutoGenerateCasesFromRiskStudents}
                onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
                onGenerateAIPlan={handleGenerateAIPlan}
                isGeneratingAI={isGeneratingAI}
                aiPlanResult={aiPlanResult}
                aiQuotaStatus={aiQuotaStatus}
                onRefresh={fetchData}
                onDeleteAllOpenCases={handleDeleteAllOpenCases}
              />
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* MÓDULO 2B: OCORRÊNCIAS ESCOLARES & MEDIAÇÃO (INDEPENDENTE DE BUSCA ATIVA) */}
        {/* ========================================================================= */}
        {activeModule === 'ocorrencias' && !currentUser.isUniversal && currentUser.role !== 'super_admin' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {currentUser.role === 'professor' && ocorrenciasSubTab === 'hub' ? (
              <div className="space-y-4">
                <div className="mb-2">
                  <h2 className="text-lg font-black text-slate-900">
                    Ocorrências Escolares • Sub-menus
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione uma das opções abaixo para registrar ou consultar ocorrências
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div
                    onClick={() => setOcorrenciasSubTab('registrar')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-amber-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-2xs">
                        <Edit3 className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-amber-600 transition-colors">
                        Registrar Nova Ocorrência
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Criar novo registro disciplinar ou pedagógico em sala, tutoria ou intervalos.
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-600">
                      <span>Registrar</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <div
                    onClick={() => setOcorrenciasSubTab('meus_registros')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                        <FileText className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-indigo-600 transition-colors">
                        Meus Registros (Edição)
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Edite suas ocorrências enviadas que ainda não receberam parecer da Gestão.
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                      <span>Acessar</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <div
                    onClick={() => setOcorrenciasSubTab('devolutivas')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-2xs">
                        <Inbox className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-emerald-600 transition-colors">
                        Minhas Devolutivas
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Consultar pareceres e medidas já tomadas pela gestão pedagógica nos seus casos.
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
                      <span>Ver Devolutivas</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <div
                    onClick={() => setOcorrenciasSubTab('tutorados')}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-purple-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-2xs">
                        <Users className="w-6 h-6" />
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 mt-4 group-hover:text-purple-600 transition-colors">
                        Meus Tutorados
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        Dossiê e acompanhamento disciplinar dos estudantes sob sua tutoria docente.
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600">
                      <span>Ver Tutorados</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <OcorrenciasManager
                currentUser={currentUser}
                classes={classes}
                students={visibleActiveStudents}
                initialTab={ocorrenciasSubTab === 'hub' ? 'pendentes' : ocorrenciasSubTab}
              />
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* MÓDULO 3: AGENDAMENTO DE TABLETS (OPERADORES ESCOLARES)                  */}
        {/* ========================================================================= */}
        {activeModule === 'tablets' && !currentUser.isUniversal && currentUser.role !== 'super_admin' && (
          <TabletsManager
            currentUser={currentUser}
            classes={classes}
          />
        )}

        {/* ========================================================================= */}
        {/* MÓDULO 3B: GRADE CURRICULAR, GERADOR DE HORÁRIOS & CALENDÁRIO LETIVO      */}
        {/* ========================================================================= */}
        {activeModule === 'grade_calendario' && !currentUser.isUniversal && currentUser.role !== 'super_admin' && (
          <CurriculumCalendarModule
            currentUser={currentUser}
            classes={classes}
            onRefresh={fetchData}
          />
        )}

        {/* ========================================================================= */}
        {/* MÓDULO 4: RELATÓRIOS & ESTRATÉGICO (OPERADORES ESCOLARES)                */}
        {/* ========================================================================= */}
        {activeModule === 'relatorios' && !currentUser.isUniversal && currentUser.role !== 'super_admin' && (
          <MonthlyReport
            report={monthlyReport}
            classes={classes}
            students={activeStudents}
            allStudents={students}
            alerts={alerts}
            interventions={interventions}
            onSelectMonth={monthIndex => setSelectedMonthIndex(monthIndex)}
            selectedMonthIndex={selectedMonthIndex}
            onRefreshData={fetchData}
          />
        )}

        {/* ========================================================================= */}
        {/* MÓDULO 5: GERENCIADOR DO SISTEMA (PERFIL MASTER OU ADMIN DA ESCOLA)      */}
        {/* ========================================================================= */}
        {(activeModule === 'system_manager' || currentUser.role === 'super_admin' || currentUser.isUniversal) && (currentUser.role === 'admin' || currentUser.role === 'admin_escola' || currentUser.role === 'super_admin' || currentUser.isUniversal) && (
          <SystemConfigManager
            currentUser={currentUser}
            classes={classes}
            students={students}
            currentSchool={currentSchool}
            schools={schools}
            onSelectSchool={handleSwitchSchool}
            onRefresh={fetchData}
            onOpenStudentRegistration={() => setIsRegistrationModalOpen(true)}
            onOpenWhatsAppIntegration={() => setIsWhatsAppModalOpen(true)}
            onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
            onOpenResetAllModal={() => {
              setWipeConfirmText('');
              setIsWipeAllConfirmOpen(true);
            }}
            onOpenFirebaseStatus={() => setIsFirebaseStatusModalOpen(true)}
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

      {/* Relatório Oficial de Acompanhamento Escolar (Frequência, Ocorrências, Mediação e Assinaturas) */}
      <SeducContingencyReportModal
        isOpen={isSeducReportModalOpen}
        onClose={() => setIsSeducReportModalOpen(false)}
        classes={classes}
        students={activeStudents}
        currentSchool={currentSchool}
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
        onStudentDeleted={fetchData}
        currentUser={currentUser}
      />

      {/* New Manual Alert Modal */}
      <NewAlertModal
        isOpen={isNewAlertModalOpen}
        onClose={() => {
          setIsNewAlertModalOpen(false);
          setPreSelectedStudentForAlert(null);
        }}
        students={visibleActiveStudents}
        preSelectedStudent={preSelectedStudentForAlert}
        onSendAlert={handleSendManualAlert}
      />

      {/* Automated Alert Trigger Notification Modal */}
      <AutomatedAlertTriggerModal
        alerts={automatedAlertsTriggered}
        onClose={() => setAutomatedAlertsTriggered([])}
        onGoToAlerts={() => {
          setActiveModule('busca_ativa');
          setSubTabBuscaAtiva('alertas');
        }}
        onGoToInterventions={() => {
          setActiveModule('busca_ativa');
          setSubTabBuscaAtiva('casos');
        }}
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
          await loadAllFromFirebaseDirectly(true, undefined, true);
        }}
        counts={{
          classesCount: classes.length,
          studentsCount: students.length,
          usersCount: isFirebaseStatusModalOpen ? storageService.getUsers(currentSchool.id).length : 26,
          alertsCount: alerts.length,
          attendanceCount: isFirebaseStatusModalOpen ? storageService.getAttendanceRecords(undefined, undefined, currentSchool.id).length : 0,
          interventionsCount: interventions.length,
          ocorrenciasCount: 59,
          tabletsCount: 81,
        }}
      />

      {/* Modal de Seleção e Alternância de Unidade Escolar (Multi-Tenant) */}
      <SchoolSelectorModal
        isOpen={isSchoolSelectorOpen}
        onClose={() => setIsSchoolSelectorOpen(false)}
        activeSchoolId={currentSchool.id}
        onSelectSchool={handleSwitchSchool}
        schools={schools}
        canManageSchools={currentUser.role === 'super_admin' || currentUser.isUniversal === true || currentUser.role === 'admin' || currentUser.role === 'admin_escola'}
        onOpenSystemManager={() => {
          setIsSchoolSelectorOpen(false);
          setActiveModule('system_manager');
        }}
      />

      {/* Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">{currentSchool.name}</span>
            <span>•</span>
            <span className="font-semibold text-slate-600">Busca Ativa Escolar & Diário Oficial</span>
            {currentSchool.city && (
              <>
                <span>•</span>
                <span className="text-slate-500">{currentSchool.city}</span>
              </>
            )}
          </div>
          <div>
            Em conformidade com a Lei de Diretrizes e Bases da Educação Nacional (LDB - Lei 9.394/96) e Diretrizes Educacionais.
          </div>
        </div>
      </footer>
    </div>
  );
}
