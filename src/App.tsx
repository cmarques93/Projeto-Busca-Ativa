import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { SystemConfigManager } from './components/SystemConfigManager';
import { ClassesManager } from './components/ClassesManager';
import { LoginScreen } from './components/LoginScreen';
import { OcorrenciasManager } from './components/OcorrenciasManager';
import { TabletsManager } from './components/TabletsManager';
import { FirebaseStatusModal } from './components/FirebaseStatusModal';
import { DashboardHome } from './components/DashboardHome';
import { SchoolSelectorModal } from './components/SchoolSelectorModal';
import { CurriculumCalendarModule } from './components/CurriculumCalendarModule';
import { UserManualModal } from './components/UserManualModal';
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
  Inbox,
  Upload
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { storageService } from './data/storageService';
import { firestoreService } from './lib/firestoreService';
import { subscribeToAuthChanges, validateFirestoreStartupConnection } from './lib/firebase';
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
  // Sessão institucional Google (Firebase Auth)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const isFirebaseVerified = useMemo(
    () => Boolean(firebaseUser && firebaseUser.emailVerified),
    [firebaseUser]
  );

  // Current logged in user session (Inicia nulo para exibir a tela de Login como página inicial)
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // Módulos Consolidados de Navegação (Inicia na Tela Inicial)
  const [activeModule, setActiveModule] = useState<MainModuleType>('inicio');
  const [subTabDiario, setSubTabDiario] = useState<'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas'>('hub');
  const [subTabBuscaAtiva, setSubTabBuscaAtiva] = useState<'hub' | 'alertas' | 'casos'>('hub');
  const [ocorrenciasSubTab, setOcorrenciasSubTab] = useState<string>('hub');
  const [navHistory, setNavHistory] = useState<
    Array<{
      activeModule: MainModuleType;
      subTabDiario: 'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas';
      subTabBuscaAtiva: 'hub' | 'alertas' | 'casos';
      ocorrenciasSubTab: string;
    }>
  >([]);

  const [activeTab, setActiveTab] = useState<MainTabType>('attendance');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const lastAutoSyncRef = useRef<number>(0);
  const lastSyncStartRef = useRef<number>(0);
  const [isFirebaseStatusModalOpen, setIsFirebaseStatusModalOpen] = useState(false);
  const [isUserManualModalOpen, setIsUserManualModalOpen] = useState(false);
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
    lastSyncStartRef.current = Date.now();
    try {
      const res = await firestoreService.getAllDataDirectly(sId, forceRefresh, (priority) => {
        if (priority.schools && priority.schools.length > 0) {
          setSchools(priority.schools);
          storageService.setSchools(priority.schools);
          const found = priority.schools.find((s: SchoolType) => s.id === sId);
          if (found) {
            setCurrentSchool(found);
            setSchoolInfo(prev => ({ ...prev, schoolName: found.name }));
          }
        }
        if (priority.classes && priority.classes.length > 0) {
          setClasses(priority.classes);
          storageService.setClasses(priority.classes, sId);
          setSelectedClassId(prev => (!prev || !priority.classes.some((c: any) => c.id === prev) ? priority.classes[0].id : prev));
        }
        if (priority.users && priority.users.length > 0) {
          storageService.setUsers(priority.users);
        }
        if (priority.alerts && priority.alerts.length > 0) {
          setAlerts(priority.alerts);
          storageService.setAlerts(priority.alerts, sId);
        }
        if (priority.interventions && priority.interventions.length > 0) {
          setInterventions(priority.interventions);
          storageService.setInterventions(priority.interventions, sId);
        }
        if (priority.ocorrencias) {
          salvarCacheOcorrencias(priority.ocorrencias, sId);
        }
        if (priority.tablets) {
          salvarCacheTablets(priority.tablets, sId);
        }
        setSyncVersion(v => v + 1);
        window.dispatchEvent(new CustomEvent('sigaescola-data-synced'));
      });
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

        lastAutoSyncRef.current = Date.now();
        setSyncVersion(v => v + 1);
        window.dispatchEvent(new CustomEvent('sigaescola-data-synced'));

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
        app: 'EduScope 360',
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
      const fileName = `backup-eduscope360-${safeSchoolSlug}-${dateStamp}_${timeStamp}.json`;

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
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isWipeAllConfirmOpen, setIsWipeAllConfirmOpen] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [roleRestrictionNotice, setRoleRestrictionNotice] = useState<string | null>(null);
  const [preSelectedStudentForAlert, setPreSelectedStudentForAlert] = useState<Student | null>(null);
  const [automatedAlertsTriggered, setAutomatedAlertsTriggered] = useState<ParentAlert[]>([]);

  // Modal de Restauração de Backup JSON para o Firebase Cloud
  const [isRestoreBackupModalOpen, setIsRestoreBackupModalOpen] = useState(false);
  const [restoreDraft, setRestoreDraft] = useState<{
    ocorrencias: any | null;
    tablets: any | null;
    ocorrenciasSource?: string;
    tabletsSource?: string;
  }>({ ocorrencias: null, tablets: null });
  const [restorePasteText, setRestorePasteText] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const parseMaybeJson = (val: any): any => {
    if (!val) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return null;
      }
    }
    return typeof val === 'object' ? val : null;
  };

  const extractLatestDateLabel = (items: any[] | undefined, fields: string[]): string => {
    if (!Array.isArray(items) || items.length === 0) return 'Sem data';
    let maxIso = '';
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      for (const f of fields) {
        const raw = String(item[f] || '').trim();
        if (!raw) continue;
        // Normaliza YYYY-MM-DD ou ISO timestamp ou DD/MM/YYYY
        let iso = '';
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          iso = raw.slice(0, 10);
        } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
          const [dd, mm, yyyy] = raw.slice(0, 10).split('/');
          iso = `${yyyy}-${mm}-${dd}`;
        }
        if (iso && iso > maxIso) maxIso = iso;
      }
    }
    if (!maxIso) return 'Sem data';
    const [y, m, d] = maxIso.split('-');
    return `${d}/${m}/${y}`;
  };

  const ingestRestoreJson = (rawText: string, sourceLabel: string) => {
    setRestoreError(null);
    const parsed = parseMaybeJson(rawText);
    if (!parsed || typeof parsed !== 'object') {
      setRestoreError('O conteúdo informado não é um JSON válido. Verifique se copiou todo o texto (começando com "{" e terminando com "}").');
      return false;
    }

    let foundOcorrencias: any = null;
    let foundTablets: any = null;

    // Formato 1: Backup Offline completo ({ backupVersion, data: { ocorrencias, tablets } })
    const rootData = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;

    // Verifica chaves explícitas (resgate_sigaescola.json, backup-sigaescola-*.json ou export do localStorage)
    const candOc = parseMaybeJson(
      rootData.ocorrencias ??
      rootData.CACHE_OCORRENCIAS_APP ??
      parsed.ocorrencias ??
      parsed.CACHE_OCORRENCIAS_APP
    );
    const candTab = parseMaybeJson(
      rootData.tablets ??
      rootData.CACHE_TABLET_APP ??
      parsed.tablets ??
      parsed.CACHE_TABLET_APP
    );

    if (candOc && Array.isArray(candOc.registros)) {
      foundOcorrencias = candOc;
    }
    if (candTab && Array.isArray(candTab.agendamentos)) {
      foundTablets = candTab;
    }

    // Formato 2: Objeto direto de Ocorrências ({ registros: [...] })
    if (!foundOcorrencias && Array.isArray(parsed.registros)) {
      foundOcorrencias = parsed;
    }

    // Formato 3: Objeto direto de Tablets/Equipamentos ({ agendamentos: [...] })
    if (!foundTablets && Array.isArray(parsed.agendamentos)) {
      foundTablets = parsed;
    }

    if (!foundOcorrencias && !foundTablets) {
      setRestoreError('Nenhum dado de Ocorrências ("registros") ou Agendamentos de Equipamentos ("agendamentos") foi encontrado nesse JSON.');
      return false;
    }

    setRestoreDraft(prev => ({
      ocorrencias: foundOcorrencias ?? prev.ocorrencias,
      tablets: foundTablets ?? prev.tablets,
      ocorrenciasSource: foundOcorrencias ? sourceLabel : prev.ocorrenciasSource,
      tabletsSource: foundTablets ? sourceLabel : prev.tabletsSource,
    }));
    return true;
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        ingestRestoreJson(text, file.name);
      };
      reader.onerror = () => {
        setRestoreError(`Não foi possível ler o arquivo "${file.name}".`);
      };
      reader.readAsText(file, 'utf-8');
    });
    e.target.value = '';
  };

  const handleOpenRestoreBackupModal = () => {
    if (!currentUser) return;
    const isAuthorized =
      currentUser.role === 'admin' ||
      currentUser.role === 'admin_escola' ||
      currentUser.role === 'super_admin' ||
      currentUser.role === 'gestao_paac' ||
      currentUser.isUniversal === true;

    if (!isAuthorized) {
      setRoleRestrictionNotice('Apenas perfis de Administração e Gestão podem restaurar backups na nuvem.');
      return;
    }
    setRestoreError(null);
    setIsRestoreBackupModalOpen(true);
  };

  const handleConfirmRestoreBackup = async () => {
    if (!restoreDraft.ocorrencias && !restoreDraft.tablets) {
      setRestoreError('Carregue um arquivo JSON ou cole os dados antes de confirmar a restauração.');
      return;
    }

    setIsRestoringBackup(true);
    setRestoreError(null);

    try {
      const sId = currentSchool?.id || storageService.getActiveSchoolId();
      firestoreService.clearReadCache();

      const restoredParts: string[] = [];

      if (restoreDraft.ocorrencias) {
        const payloadOc = {
          ...restoreDraft.ocorrencias,
          registros: Array.isArray(restoreDraft.ocorrencias.registros) ? restoreDraft.ocorrencias.registros : [],
        };
        await firestoreService.saveOcorrencias(payloadOc, sId);
        salvarCacheOcorrencias(payloadOc, sId);
        const latestOc = extractLatestDateLabel(payloadOc.registros, ['data', 'criadoEm', 'updatedAt', 'timestamp']);
        restoredParts.push(`${payloadOc.registros.length} ocorrências (até ${latestOc})`);
      }

      if (restoreDraft.tablets) {
        const payloadTab = {
          ...restoreDraft.tablets,
          agendamentos: Array.isArray(restoreDraft.tablets.agendamentos) ? restoreDraft.tablets.agendamentos : [],
          equipamentos: Array.isArray(restoreDraft.tablets.equipamentos) ? restoreDraft.tablets.equipamentos : [],
        };
        await firestoreService.saveTablets(payloadTab, sId);
        salvarCacheTablets(payloadTab, sId);
        const latestTab = extractLatestDateLabel(payloadTab.agendamentos, ['data', 'criadoEm', 'updatedAt']);
        restoredParts.push(`${payloadTab.agendamentos.length} agendamentos de equipamentos (até ${latestTab})`);
      }

      await fetchData();
      setSyncVersion(v => v + 1);
      window.dispatchEvent(new CustomEvent('sigaescola-data-synced'));

      setIsRestoreBackupModalOpen(false);
      setRestoreDraft({ ocorrencias: null, tablets: null });
      setRestorePasteText('');
      setSyncNotification({
        type: 'success',
        message: 'Backup restaurado com sucesso no Firebase Cloud!',
        details: `Dados gravados definitivamente na nuvem e sincronizados localmente: ${restoredParts.join(' e ')}. Todos os computadores da escola já podem acessar os registros restaurados.`
      });
      setTimeout(() => setSyncNotification(null), 12000);
    } catch (error: any) {
      console.error('Erro ao restaurar backup no Firebase:', error);
      setRestoreError(
        `Falha ao gravar no Firebase: ${error?.message || 'verifique sua conexão e tente novamente.'}`
      );
    } finally {
      setIsRestoringBackup(false);
    }
  };

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

  // Monitora autenticação Google (Firebase Auth) e limpa cache de leitura na transição de sessão
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((fbUser) => {
      firestoreService.clearReadCache();
      setFirebaseUser(fbUser);
      setAuthReady(true);
      if (!fbUser) {
        setCurrentUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Carrega cache local imediato e sincroniza integralmente com o Firebase assim que o usuário Google estiver verificado
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

    if (!isFirebaseVerified) return;

    validateFirestoreStartupConnection();
    loadAllFromFirebaseDirectly(false, undefined, true).then((loaded) => {
      if (!loaded) {
        fetchQuotaStatus();
      }
    });
  }, [isFirebaseVerified, loadAllFromFirebaseDirectly, fetchQuotaStatus]);

  // Sincronização automática entre múltiplos computadores (ao voltar à aba, reconectar e periodicamente a cada 2 min)
  useEffect(() => {
    if (!isFirebaseVerified) return;
    const AUTO_SYNC_MIN_INTERVAL_MS = 30 * 1000;
    const PERIODIC_SYNC_INTERVAL_MS = 120 * 1000;

    const triggerBackgroundSyncIfStale = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      const elapsed = Date.now() - lastAutoSyncRef.current;
      if (elapsed < AUTO_SYNC_MIN_INTERVAL_MS) return;
      lastAutoSyncRef.current = Date.now();
      loadAllFromFirebaseDirectly(false, undefined, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerBackgroundSyncIfStale();
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        lastAutoSyncRef.current = 0;
        triggerBackgroundSyncIfStale();
      }
    };

    const handleOnline = () => {
      lastAutoSyncRef.current = 0;
      triggerBackgroundSyncIfStale();
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        triggerBackgroundSyncIfStale();
      }
    }, PERIODIC_SYNC_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
    };
  }, [isFirebaseVerified, loadAllFromFirebaseDirectly]);

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
    await loadAllFromFirebaseDirectly(false, schoolId, true);
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

    // Sempre força recarga limpa do Firebase ao entrar (garante sincronia imediata entre computadores)
    loadAllFromFirebaseDirectly(true, session.schoolId, true);

    // Se for o Painel Master Global, abre diretamente a Central Global de Unidades Escolares
    if (session.role === 'super_admin' || session.isUniversal) {
      setActiveModule('system_manager');
    } else {
      // Redireciona os operadores escolares para a Tela Inicial da sua escola
      setActiveModule('inicio');
    }

    // Prepara sub-abas ideais caso o usuário navegue para os módulos e limpa histórico da sessão anterior
    setSubTabDiario('hub');
    setSubTabBuscaAtiva('hub');
    setOcorrenciasSubTab(session.role === 'professor' ? 'hub' : 'pendentes');
    setNavHistory([]);
    setActiveTab(session.role === 'professor' ? 'teacher_absence' : 'attendance');
  };

  // Navegação centralizada com histórico real (Voltar sempre retorna à seção anterior visitada)
  const navigateTo = (
    next: {
      activeModule?: MainModuleType;
      subTabDiario?: 'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas';
      subTabBuscaAtiva?: 'hub' | 'alertas' | 'casos';
      ocorrenciasSubTab?: string;
    },
    options?: { replace?: boolean }
  ) => {
    const targetModule = next.activeModule ?? activeModule;
    const isSwitchingModule = targetModule !== activeModule;
    const targetDiario =
      next.subTabDiario ?? (isSwitchingModule ? 'hub' : subTabDiario);
    const targetBuscaAtiva =
      next.subTabBuscaAtiva ?? (isSwitchingModule ? 'hub' : subTabBuscaAtiva);
    const targetOcorr =
      next.ocorrenciasSubTab ??
      (targetModule === 'ocorrencias' && isSwitchingModule
        ? currentUser?.role === 'professor'
          ? 'hub'
          : 'pendentes'
        : ocorrenciasSubTab);

    const isSameState =
      targetModule === activeModule &&
      targetDiario === subTabDiario &&
      targetBuscaAtiva === subTabBuscaAtiva &&
      targetOcorr === ocorrenciasSubTab;

    if (isSameState) return;

    if (!options?.replace) {
      const currentSnapshot = {
        activeModule,
        subTabDiario,
        subTabBuscaAtiva,
        ocorrenciasSubTab,
      };
      setNavHistory(prev => [...prev.slice(-29), currentSnapshot]);
    }

    setActiveModule(targetModule);
    setSubTabDiario(targetDiario);
    setSubTabBuscaAtiva(targetBuscaAtiva);
    setOcorrenciasSubTab(targetOcorr);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navegação direta acionada pelos cards ou pela barra superior de módulos
  const handleNavigateFromHome = (
    module: MainModuleType,
    subDiario?: 'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas',
    subBuscaAtiva?: 'hub' | 'alertas' | 'casos',
    ocorrTab?: string
  ) => {
    navigateTo({
      activeModule: module,
      subTabDiario: subDiario || 'hub',
      subTabBuscaAtiva: subBuscaAtiva || 'hub',
      ocorrenciasSubTab:
        ocorrTab ??
        (module === 'ocorrencias'
          ? currentUser?.role === 'professor'
            ? 'hub'
            : 'pendentes'
          : ocorrenciasSubTab),
    });
  };

  // Botão "Voltar": retorna exatamente à seção anterior que o usuário estava visitando
  const handleGoBack = () => {
    if (navHistory.length > 0) {
      const previous = navHistory[navHistory.length - 1];
      setNavHistory(prev => prev.slice(0, -1));
      setActiveModule(previous.activeModule);
      setSubTabDiario(previous.subTabDiario);
      setSubTabBuscaAtiva(previous.subTabBuscaAtiva);
      setOcorrenciasSubTab(previous.ocorrenciasSubTab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (activeModule !== 'inicio') {
      setActiveModule('inicio');
      setSubTabDiario('hub');
      setSubTabBuscaAtiva('hub');
      setOcorrenciasSubTab(currentUser?.role === 'professor' ? 'hub' : 'pendentes');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Botão "Início" (registra a seção atual no histórico para permitir Voltar)
  const handleGoHome = () => {
    navigateTo({
      activeModule: 'inicio',
      subTabDiario: 'hub',
      subTabBuscaAtiva: 'hub',
      ocorrenciasSubTab: currentUser?.role === 'professor' ? 'hub' : 'pendentes',
    });
  };

  // Rótulo legível de qualquer estado de navegação (usado no breadcrumb e no tooltip do botão Voltar)
  const getSectionLabel = (state: {
    activeModule: MainModuleType;
    subTabDiario: 'hub' | 'chamada' | 'portaria' | 'ausencias' | 'turmas';
    subTabBuscaAtiva: 'hub' | 'alertas' | 'casos';
    ocorrenciasSubTab: string;
  }): string => {
    if (state.activeModule === 'inicio') return 'Início';
    if (state.activeModule === 'diario') {
      if (state.subTabDiario === 'hub') return 'Diário & Portaria';
      if (state.subTabDiario === 'chamada') return 'Diário & Portaria / Chamada por Turma';
      if (state.subTabDiario === 'portaria') return 'Diário & Portaria / Controle de Portaria';
      if (state.subTabDiario === 'ausencias') return 'Diário & Portaria / Diário do Professor';
      if (state.subTabDiario === 'turmas') return 'Diário & Portaria / Relação de Turmas';
    }
    if (state.activeModule === 'busca_ativa') {
      if (state.subTabBuscaAtiva === 'hub') return 'Busca Ativa Escolar';
      if (state.subTabBuscaAtiva === 'alertas') return 'Busca Ativa / Ausências & WhatsApp';
      if (state.subTabBuscaAtiva === 'casos') return 'Busca Ativa / Casos de Busca Ativa';
    }
    if (state.activeModule === 'ocorrencias') {
      if (currentUser?.role === 'professor') {
        if (state.ocorrenciasSubTab === 'hub') return 'Ocorrências Escolares';
        if (state.ocorrenciasSubTab === 'registrar') return 'Ocorrências Escolares / Nova Ocorrência';
        if (state.ocorrenciasSubTab === 'meus_registros') return 'Ocorrências Escolares / Meus Registros';
        if (state.ocorrenciasSubTab === 'devolutivas') return 'Ocorrências Escolares / Minhas Devolutivas';
        if (state.ocorrenciasSubTab === 'tutorados') return 'Ocorrências Escolares / Meus Tutorados';
      }
      return 'Ocorrências & Mediação';
    }
    if (state.activeModule === 'tablets') return 'Agendamento de Equipamentos';
    if (state.activeModule === 'grade_calendario') return 'Grade Curricular & Calendário Letivo';
    if (state.activeModule === 'relatorios') return 'Relatórios Pedagógicos';
    if (state.activeModule === 'system_manager') return 'Gerenciador Central do Sistema';
    return '';
  };

  const getBreadcrumbText = (): string =>
    getSectionLabel({ activeModule, subTabDiario, subTabBuscaAtiva, ocorrenciasSubTab });

  const previousSectionLabel =
    navHistory.length > 0 ? getSectionLabel(navHistory[navHistory.length - 1]) : undefined;

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
    setNavHistory([]);
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
    // Gravação resiliente definitiva no Firestore e sincronização no storageService
    let newAlerts: ParentAlert[] = [];
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
          schoolName: currentSchool.name,
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
      storageService.wipeAllData((currentUser?.role === 'admin' || currentUser?.role === 'admin_escola' || currentUser?.role === 'super_admin') ? currentUser : undefined);
      setClasses([]);
      setStudents([]);
      setAlerts([]);
      setInterventions([]);
      setSelectedClassId('');
      setSchoolInfo({
        schoolName: currentSchool?.name || 'Unidade Escolar',
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

  // Se nenhum usuário estiver logado ou a conta Google não estiver verificada, exibe a tela de Login como página inicial
  if (!currentUser || !isFirebaseVerified) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        firebaseUser={firebaseUser}
        authReady={authReady}
      />
    );
  }

  // Calculate high-level summary metrics
  const criticalStudentsTotal = activeStudents.filter(s => s.riskLevel === 'critico').length;
  const avgAttendanceOverall = monthlyReport ? monthlyReport.averageAttendanceRate : 88.4;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Unified Primary Header with EduScope 360 brand, enabled school modules, and history-based Back button */}
      <Header
        schoolName={currentSchool.name}
        currentUser={currentUser}
        currentSchool={currentSchool}
        activeModule={activeModule}
        subTabDiario={subTabDiario}
        onNavigate={handleNavigateFromHome}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenSchoolSelector={() => setIsSchoolSelectorOpen(true)}
        onOpenMasterPanel={() => navigateTo({ activeModule: 'system_manager' })}
        onLogout={handleLogout}
        onOpenSeducReport={() => setIsSeducReportModalOpen(true)}
        onExportOfflineBackup={handleExportOfflineBackup}
        onOpenRestoreBackup={handleOpenRestoreBackupModal}
        onOpenUserManual={() => setIsUserManualModalOpen(true)}
        onSyncData={handleSyncData}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
        onGoBack={handleGoBack}
        onGoHome={handleGoHome}
        canGoBack={navHistory.length > 0}
        previousSectionLabel={previousSectionLabel}
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
            syncVersion={syncVersion}
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
                  <h2 className="text-lg font-bold text-slate-900">
                    Diário &amp; Portaria
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione uma das opções abaixo para realizar seus lançamentos
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {currentUser.role !== 'professor' && (
                    <div
                      onClick={() => navigateTo({ activeModule: 'diario', subTabDiario: 'chamada' })}
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
                      onClick={() => navigateTo({ activeModule: 'diario', subTabDiario: 'portaria' })}
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
                    onClick={() => navigateTo({ activeModule: 'diario', subTabDiario: 'ausencias' })}
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
                    onClick={() => navigateTo({ activeModule: 'diario', subTabDiario: 'turmas' })}
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
                  navigateTo({ activeModule: 'busca_ativa', subTabBuscaAtiva: 'alertas' });
                }}
              />
            )}

            {subTabDiario === 'portaria' && currentUser.role !== 'professor' && (
              <GatePassManager
                students={activeStudents}
                classes={classes}
                operatorName={currentUser.name}
                onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
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
                onOpenCalendarModule={() => navigateTo({ activeModule: 'grade_calendario' })}
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
                  <h2 className="text-lg font-bold text-slate-900">
                    Busca Ativa Escolar
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione uma das opções abaixo para gerenciar ausências, comunicados aos responsáveis e casos de Busca Ativa
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => navigateTo({ activeModule: 'busca_ativa', subTabBuscaAtiva: 'alertas' })}
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
                    onClick={() => navigateTo({ activeModule: 'busca_ativa', subTabBuscaAtiva: 'casos' })}
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
                  <h2 className="text-lg font-bold text-slate-900">
                    Ocorrências Escolares
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione uma das opções abaixo para registrar ou consultar ocorrências
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div
                    onClick={() => navigateTo({ activeModule: 'ocorrencias', ocorrenciasSubTab: 'registrar' })}
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
                    onClick={() => navigateTo({ activeModule: 'ocorrencias', ocorrenciasSubTab: 'meus_registros' })}
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
                    onClick={() => navigateTo({ activeModule: 'ocorrencias', ocorrenciasSubTab: 'devolutivas' })}
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
                    onClick={() => navigateTo({ activeModule: 'ocorrencias', ocorrenciasSubTab: 'tutorados' })}
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
            onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
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
          navigateTo({ activeModule: 'busca_ativa', subTabBuscaAtiva: 'alertas' });
        }}
        onGoToInterventions={() => {
          navigateTo({ activeModule: 'busca_ativa', subTabBuscaAtiva: 'casos' });
        }}
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
              Deseja restaurar a base de dados da unidade <strong>{currentSchool?.name || 'Unidade Escolar'}</strong> para os dados padrão iniciais?
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

      {/* Modal de Restauração de Backup JSON para o Firebase Cloud */}
      {isRestoreBackupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Restaurar Backup para o Firebase Cloud
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Envie o arquivo JSON salvo (ou cole o conteúdo copiado do navegador) para gravar os registros de volta na nuvem.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRestoreBackupModalOpen(false)}
                disabled={isRestoringBackup}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer transition-colors"
                aria-label="Fechar modal de restauração"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Opção 1: Selecionar 1 ou mais arquivos JSON */}
              <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4">
                <p className="text-xs font-bold text-indigo-900 mb-1">
                  Opção 1 — Selecionar arquivo(s) .json do computador
                </p>
                <p className="text-[11px] text-slate-600 mb-3">
                  Aceita o backup combinado (<code className="bg-white px-1 rounded">backup-eduscope360-*.json</code> ou arquivos anteriores <code className="bg-white px-1 rounded">backup-sigaescola-*.json</code> / <code className="bg-white px-1 rounded">resgate_sigaescola.json</code>) ou arquivos individuais de Ocorrências e Equipamentos/Tablets.
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Escolher arquivo(s) JSON</span>
                  <input
                    type="file"
                    accept=".json,application/json,.txt"
                    multiple
                    onChange={handleRestoreFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Opção 2: Colar JSON copiado da aba Application */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-bold text-slate-800 mb-1">
                  Opção 2 — Colar JSON diretamente (copiado do Local Storage)
                </p>
                <p className="text-[11px] text-slate-600 mb-2">
                  Você pode colar primeiro o conteúdo de <code className="bg-white px-1 rounded border border-slate-200">CACHE_OCORRENCIAS_APP</code>, clicar em &quot;Ler JSON colado&quot;, e em seguida colar o de <code className="bg-white px-1 rounded border border-slate-200">CACHE_TABLET_APP</code>.
                </p>
                <textarea
                  value={restorePasteText}
                  onChange={(e) => setRestorePasteText(e.target.value)}
                  rows={4}
                  placeholder='Cole aqui o texto JSON começando com {"registros":...} ou {"agendamentos":...}'
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={!restorePasteText.trim()}
                    onClick={() => {
                      const ok = ingestRestoreJson(restorePasteText, 'JSON colado manualmente');
                      if (ok) setRestorePasteText('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    Ler JSON colado
                  </button>
                </div>
              </div>

              {/* Mensagem de Erro */}
              {restoreError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{restoreError}</span>
                </div>
              )}

              {/* Prévia dos dados prontos para restaurar */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Resumo dos dados detectados para restauração ({currentSchool.name})</span>
                  </p>
                  {(restoreDraft.ocorrencias || restoreDraft.tablets) && (
                    <button
                      type="button"
                      onClick={() => {
                        setRestoreDraft({ ocorrencias: null, tablets: null });
                        setRestoreError(null);
                      }}
                      className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
                    >
                      Limpar seleção
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className={`p-3 rounded-xl border text-xs ${restoreDraft.ocorrencias ? 'bg-white border-emerald-300' : 'bg-white/60 border-slate-200 text-slate-400'}`}>
                    <p className="font-bold text-slate-800">Ocorrências & Mediação</p>
                    {restoreDraft.ocorrencias ? (
                      <div className="mt-1 space-y-0.5 text-[11px] text-emerald-800">
                        <p className="font-extrabold text-sm text-emerald-700">
                          {restoreDraft.ocorrencias.registros?.length || 0} registros
                        </p>
                        <p>
                          Data mais recente:{' '}
                          <strong>
                            {extractLatestDateLabel(restoreDraft.ocorrencias.registros, ['data', 'criadoEm', 'updatedAt', 'timestamp'])}
                          </strong>
                        </p>
                        {restoreDraft.ocorrenciasSource && (
                          <p className="text-[10px] text-slate-500 truncate">Origem: {restoreDraft.ocorrenciasSource}</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px]">Nenhum arquivo carregado ainda</p>
                    )}
                  </div>

                  <div className={`p-3 rounded-xl border text-xs ${restoreDraft.tablets ? 'bg-white border-emerald-300' : 'bg-white/60 border-slate-200 text-slate-400'}`}>
                    <p className="font-bold text-slate-800">Agendamento de Equipamentos</p>
                    {restoreDraft.tablets ? (
                      <div className="mt-1 space-y-0.5 text-[11px] text-emerald-800">
                        <p className="font-extrabold text-sm text-emerald-700">
                          {restoreDraft.tablets.agendamentos?.length || 0} agendamentos
                        </p>
                        <p>
                          Equipamentos: <strong>{restoreDraft.tablets.equipamentos?.length || 0}</strong> • Até:{' '}
                          <strong>
                            {extractLatestDateLabel(restoreDraft.tablets.agendamentos, ['data', 'criadoEm', 'updatedAt'])}
                          </strong>
                        </p>
                        {restoreDraft.tabletsSource && (
                          <p className="text-[10px] text-slate-500 truncate">Origem: {restoreDraft.tabletsSource}</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px]">Nenhum arquivo carregado ainda</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={() => setIsRestoreBackupModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isRestoringBackup || (!restoreDraft.ocorrencias && !restoreDraft.tablets)}
                onClick={handleConfirmRestoreBackup}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs cursor-pointer transition-colors shadow-xs flex items-center gap-2"
              >
                <Database className="w-4 h-4" />
                <span>{isRestoringBackup ? 'Restaurando no Firebase...' : 'Confirmar e Restaurar no Firebase'}</span>
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
          ocorrenciasCount: isFirebaseStatusModalOpen ? (lerCacheOcorrencias(currentSchool.id)?.registros?.length ?? 0) : 0,
          tabletsCount: isFirebaseStatusModalOpen ? (lerCacheTablets(currentSchool.id)?.agendamentos?.length ?? 0) : 0,
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
          navigateTo({ activeModule: 'system_manager' });
        }}
      />

      {/* Modal do Manual do Usuário Oficial (Todos os Perfis + Exportação em PDF A4) */}
      <UserManualModal
        isOpen={isUserManualModalOpen}
        onClose={() => setIsUserManualModalOpen(false)}
        currentUser={currentUser}
        currentSchool={currentSchool}
      />

      {/* Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">{currentSchool.name}</span>
            <span>·</span>
            <span className="font-semibold text-slate-600">EduScope 360 - Portal Integrado de Gestão Escolar</span>
            {currentSchool.city && (
              <>
                <span>·</span>
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
