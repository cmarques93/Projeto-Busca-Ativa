import React, { useState, useEffect, useCallback } from 'react';
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
  // Current logged in user session (Default: Administrador Master para carregar e gerenciar acessos)
  const [currentUser, setCurrentUser] = useState<UserSession>({
    username: 'admin',
    name: 'Administrador Geral',
    role: 'admin',
    roleLabel: 'Administrador (Master)'
  });

  const [activeTab, setActiveTab] = useState<MainTabType>('access_management');
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Modals state
  const [selectedStudentDetailId, setSelectedStudentDetailId] = useState<string | null>(null);
  const [isNewAlertModalOpen, setIsNewAlertModalOpen] = useState(false);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSeducReportModalOpen, setIsSeducReportModalOpen] = useState(false);
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [preSelectedStudentForAlert, setPreSelectedStudentForAlert] = useState<Student | null>(null);
  const [automatedAlertsTriggered, setAutomatedAlertsTriggered] = useState<ParentAlert[]>([]);

  // AI plan state
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiPlanResult, setAiPlanResult] = useState<{ caseId: string; plan: any } | null>(null);

  // Fetch all base data
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [infoRes, classesRes, studentsRes, alertsRes, interventionsRes, reportRes] = await Promise.all([
        fetch('/api/school-info'),
        fetch('/api/classes'),
        fetch(`/api/students?classId=${selectedClassId}`),
        fetch('/api/alerts'),
        fetch('/api/interventions'),
        fetch(`/api/reports/monthly?month=${selectedMonthIndex}&year=2026`),
      ]);

      if (infoRes.ok) setSchoolInfo(await infoRes.json());
      if (classesRes.ok) {
        const clsList = await classesRes.json();
        setClasses(clsList);
        if (!selectedClassId && clsList.length > 0) {
          setSelectedClassId(clsList[0].id);
        }
      }
      if (studentsRes.ok) setStudents(await studentsRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (interventionsRes.ok) setInterventions(await interventionsRes.json());
      if (reportRes.ok) setMonthlyReport(await reportRes.json());
    } catch (err) {
      console.error('Erro ao buscar dados do servidor:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedClassId, selectedMonthIndex]);

  // Load on mount and when selectedClassId changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Role selection & Login success handlers
  const handleLoginSuccess = (session: UserSession) => {
    setCurrentUser(session);

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

  // Handle class selection change
  const handleSelectClass = async (classId: string) => {
    setSelectedClassId(classId);
    try {
      const res = await fetch(`/api/students?classId=${classId}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data);
      }
    } catch (e) {
      console.error(e);
    }
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
    }[],
    classId: string,
    teacherName: string,
    date?: string
  ) => {
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, classId, recordedBy: teacherName, date }),
      });

      if (!res.ok) throw new Error('Falha ao registrar frequência');
      const data = await res.json();

      // If new alerts were triggered automatically by the system:
      if (data.newAlerts && data.newAlerts.length > 0) {
        setAutomatedAlertsTriggered(data.newAlerts);
      }

      // Refresh data
      await fetchData();
      return { newAlerts: data.newAlerts || [] };
    } catch (e) {
      console.error(e);
      throw e;
    }
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

      if (!res.ok) throw new Error('Erro ao enviar alerta');
      await fetchData();
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  // Update alert status
  const handleUpdateAlertStatus = async (alertId: string, status: string, notes?: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
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
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Generate AI Plan for intervention
  const handleGenerateAIPlan = async (caseId: string, studentId: string) => {
    setIsGeneratingAI(true);
    setAiPlanResult(null);
    try {
      const student = students.find(s => s.id === studentId);
      const studentName = student ? student.name : 'Estudante';
      const studentClass = student ? student.className : '';
      const consecutive = student ? student.consecutiveAbsences : 5;
      const rate = student ? student.attendanceRate : 65;
      const factors = student ? student.vulnerabilityFactors : [];

      const res = await fetch('/api/ai/intervention-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          studentClass,
          consecutiveAbsences: consecutive,
          attendanceRate: rate,
          vulnerabilityFactors: factors,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiPlanResult({ caseId, plan: data });
      }
    } catch (e) {
      console.error('Erro na IA:', e);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Reset database to demo data
  const handleResetData = async () => {
    if (window.confirm('Deseja restaurar a base de dados da EE Professor Arlindo Silvestre com os dados padrão?')) {
      try {
        await fetch('/api/reset-data', { method: 'POST' });
        await fetchData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Open alert modal for specific student
  const handleOpenAlertForStudent = (student: Student) => {
    if (currentUser.role === 'professor') {
      alert('Seu perfil de Professor tem acesso restrito e não possui permissão para disparar alertas externos.');
      return;
    }
    setPreSelectedStudentForAlert(student);
    setIsNewAlertModalOpen(true);
  };

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
        onOpenSeducReport={() => setIsSeducReportModalOpen(true)}
        onRefresh={fetchData}
        isRefreshing={isRefreshing}
        onResetData={handleResetData}
        onOpenStudentRegistration={() => setIsRegistrationModalOpen(true)}
        onOpenWhatsAppIntegration={() => setIsWhatsAppModalOpen(true)}
        onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
      />

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Administrador Master only: Gerenciamento do Banco de Dados de Acessos & Determinação de Perfis */}
        {activeTab === 'access_management' && currentUser.role === 'admin' && (
          <AccessManagement
            onRefresh={fetchData}
            onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
          />
        )}

        {/* Professor View: Restricted strictly to absence reasons and medical certificates */}
        {activeTab === 'teacher_absence' && (
          <TeacherAbsenceView
            classes={classes}
            students={students}
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
            onSaveAttendance={handleSaveAttendance}
            onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
            onManualAlert={handleOpenAlertForStudent}
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

        {/* Gestão/PAAC & Admin: WhatsApp Alerts Manager */}
        {activeTab === 'alerts' && (currentUser.role === 'gestao_paac' || currentUser.role === 'admin') && (
          <AlertsManager
            alerts={alerts}
            onUpdateAlertStatus={handleUpdateAlertStatus}
            onOpenNewAlertModal={() => {
              setPreSelectedStudentForAlert(null);
              setIsNewAlertModalOpen(true);
            }}
            onOpenStudentDetail={id => setSelectedStudentDetailId(id)}
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
          />
        )}

        {/* Gestão/PAAC & Admin: Monthly Reports */}
        {activeTab === 'reports' && (currentUser.role === 'gestao_paac' || currentUser.role === 'admin') && (
          <MonthlyReport
            report={monthlyReport}
            onSelectMonth={monthIndex => setSelectedMonthIndex(monthIndex)}
            selectedMonthIndex={selectedMonthIndex}
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
      />

      {/* New Manual Alert Modal */}
      <NewAlertModal
        isOpen={isNewAlertModalOpen}
        onClose={() => {
          setIsNewAlertModalOpen(false);
          setPreSelectedStudentForAlert(null);
        }}
        students={students}
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
