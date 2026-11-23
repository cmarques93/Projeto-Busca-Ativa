export type AttendanceStatus =
  | 'presente'
  | 'falta_injustificada'
  | 'falta_justificada'
  | 'atestado_medico'
  | 'atraso';

export type UserRole =
  | 'super_admin' // Proprietário / Acesso Universal ao SaaS (único com permissão para criar novas escolas e gerenciar planos)
  | 'admin_escola' // Administrador da Unidade Escolar (cadastrado para cada escola, gerencia apenas sua unidade)
  | 'admin' // Sinônimo para Administrador Escolar
  | 'gestao_paac' // Coordenação Pedagógica / PAAC
  | 'aoe' // Agente de Organização Escolar (Portaria e Secretaria)
  | 'professor'; // Professor(a) Regente

export interface SchoolModulesConfig {
  diario?: boolean; // Diário de Classe & Chamada em tempo real
  portaria?: boolean; // Controle de Portaria (Entradas e Saídas)
  busca_ativa?: boolean; // Busca Ativa de Alunos & Notificações WhatsApp
  ocorrencias?: boolean; // Livro de Ocorrências & Mediação Escolar
  tablets?: boolean; // Agendamento de Carrinhos de Tablets
  relatorios?: boolean; // Relatórios Oficiais SEDUC & Dossiês
  grade_calendario?: boolean; // Módulo Separado: Grade Curricular, Gerador de Horários & Calendário Letivo
}

export function isModuleEnabled(
  school: School | undefined | null,
  moduleKey: keyof SchoolModulesConfig
): boolean {
  if (!school || !school.modules) return true;
  return school.modules[moduleKey] !== false;
}

export interface School {
  id: string; // Identificador único da escola (ex: 'ee-arlindo-silvestre', 'emeb-cecilia-meireles')
  name: string; // Nome oficial da Unidade Escolar
  codeCie?: string; // Código CIE / INEP
  network?: string; // Rede de Ensino (ex: 'Rede Estadual SP', 'Municipal', 'Particular')
  city?: string; // Município / UF
  address?: string; // Endereço completo
  phone?: string; // Telefone institucional
  directorName?: string; // Nome do Diretor(a) responsável
  logoUrl?: string; // URL ou ícone da escola
  active: boolean;
  modules?: SchoolModulesConfig; // Sistemas/módulos liberados para esta escola
  createdAt?: string;
  notes?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  pin: string; // Senha numérica de 4 dígitos (ex: "1234")
  createdAt: string;
  lastLogin?: string;
  active: boolean;
  notes?: string;
  schoolId?: string; // Vínculo da escola à qual pertence
  isUniversal?: boolean; // Se true, tem acesso universal (proprietário)
}

export interface UserSession {
  id?: string;
  username: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  schoolId?: string; // ID da escola ativa na sessão
  schoolName?: string; // Nome da escola ativa
  isUniversal?: boolean; // Se true, é o usuário proprietário universal
}

export type GateMovementType = 'entrada_tardia' | 'saida_antecipada';

export interface GateRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type: GateMovementType;
  classPeriodId?: string;
  classPeriodName?: string;
  classPeriodType?: 'aula' | 'intervalo';
  reason: string;
  guardianOrAuthorizedPerson: string;
  guardianPhone?: string;
  recordedBy: string;
  notes?: string;
  isRetroactive?: boolean;
  registeredAt?: string;
  schoolId?: string;
}

export type SchoolCalendarEventType =
  | 'feriado'
  | 'recesso'
  | 'ferias'
  | 'sabado_letivo'
  | 'conselho_classe'
  | 'reuniao_pedagogica'
  | 'reposicao';

export interface SchoolBimester {
  id: '1B' | '2B' | '3B' | '4B';
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface SchoolCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (para férias ou recessos contínuos)
  title: string;
  type: SchoolCalendarEventType;
  countsAsSchoolDay?: boolean;
  notes?: string;
}

export interface SchoolCalendarConfig {
  schoolId?: string;
  year: number;
  bimesters: SchoolBimester[];
  events: SchoolCalendarEvent[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface TeacherScheduleSlot {
  id: string;
  schoolId?: string;
  teacherId?: string;
  teacherName: string;
  classId: string;
  className?: string;
  dayOfWeek: number; // 1 = Segunda ... 5 = Sexta, 6 = Sábado
  periodId: string;
  periodName: string;
  subject?: string;
  hasPlatform?: boolean;
  platformName?: string;
}

export type EquipmentCondition = 'em_uso' | 'quebrado' | 'em_manutencao';

export interface EquipmentItem {
  id: string;
  nome: string;
  tipo: string;
  patrimonio?: string;
  condicao: EquipmentCondition;
  observacao?: string;
  atualizadoEm?: string;
  atualizadoPor?: string;
}

export type RiskLevel = 'baixo' | 'moderado' | 'alto' | 'critico';
export type StudentStatus = 'regular' | 'alerta' | 'evasao_iminente' | 'em_busca_ativa' | 'reintegrado' | 'transferido';

export interface Student {
  id: string;
  name: string;
  ra: string; // Registro do Aluno
  classId: string;
  className: string;
  tutor?: string; // Professor(a) Tutor(a) responsável pelo estudante
  guardianName: string;
  guardianPhone: string;
  guardianRelationship: string;
  address: string;
  neighborhood: string;
  status: StudentStatus;
  riskLevel: RiskLevel;
  totalSchoolDays: number;
  totalAbsences: number;
  consecutiveAbsences: number;
  attendanceRate: number; // 0 - 100%
  vulnerabilityFactors: string[];
  lastAttendanceDate: string;
  activeInterventionId?: string;
  notes?: string;
  schoolId?: string;
  transferredAt?: string; // YYYY-MM-DD
  transferDestination?: string; // Escola ou rede de destino
  transferReason?: string; // Motivo/observação da transferência
  previousClassId?: string; // Turma de origem antes da transferência
  previousClassName?: string; // Nome da turma de origem
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className?: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  durationDays?: number; // Duração em dias (1, 2, 3...) quando a falta/justificativa for superior a 1 dia
  justification?: string;
  justificationDays?: number; // Quantidade total de dias da justificativa prévia
  justificationDayCurrent?: number; // Dia atual da justificativa (ex: 1 para 1º dia, 2 para 2º dia, etc.)
  justificationDaysRemaining?: number; // Quantidade de dias que faltam para finalizar a justificativa
  justificationStartDate?: string; // Data de início da justificativa (YYYY-MM-DD)
  justificationEndDate?: string; // Data final da justificativa (YYYY-MM-DD)
  medicalCertificate?: string; // Informações do atestado médico (dias e motivo)
  medicalDays?: number; // Quantidade total de dias do atestado
  medicalDayCurrent?: number; // Dia atual do atestado (ex: 1 para 1º dia, 2 para 2º dia, etc.)
  medicalDaysRemaining?: number; // Quantidade de dias que faltam para finalizar o tempo do atestado
  medicalStartDate?: string; // Data de início do atestado (YYYY-MM-DD)
  medicalEndDate?: string; // Data final do atestado (YYYY-MM-DD)
  isCountedAsAbsence?: boolean; // false para atestado médico (não contabiliza ausência), true para falta justificada/injustificada
  recordedBy: string;
  recordedAt?: string;
  createdAt?: string;
  schoolId?: string;
}

export type AlertChannel = 'whatsapp' | 'sms' | 'ligacao' | 'notificacao_push';
export type AlertTrigger =
  | '1_falta'
  | '2_faltas_consecutivas'
  | '3_faltas_consecutivas'
  | 'mais_de_3_conselho_tutelar'
  | 'dias_alternados_baixa_frequencia'
  | '5_faltas_mes'
  | 'frequencia_abaixo_75'
  | 'falta_reincidente_sexta_segunda'
  | 'alerta_manual';

export type AlertStatus = 'enviado' | 'entregue' | 'lido' | 'respondido' | 'falha';

export interface ParentAlert {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  guardianName: string;
  guardianPhone: string;
  channel: AlertChannel;
  triggerReason: AlertTrigger;
  triggerLabel: string;
  messageContent: string;
  status: AlertStatus;
  sentAt: string;
  readAt?: string;
  guardianFeedback?: string;
  autoGenerated: boolean;
  schoolId?: string;
}

export type InterventionStage =
  | 'alerta_inicial'
  | 'contato_telefonico_whatsapp'
  | 'reuniao_pais'
  | 'encaminhado_cras_conselho'
  | 'reintegrado'
  | 'encerrado';

export interface InterventionActionLog {
  id: string;
  date: string;
  action: string;
  author: string;
  notes: string;
  result: string;
}

export interface InterventionCase {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  guardianName: string;
  guardianPhone: string;
  priority: 'media' | 'alta' | 'urgente_conselho';
  stage: InterventionStage;
  openedAt: string;
  lastUpdatedAt: string;
  assignedPedagogue: string;
  reason: string;
  actionLog: InterventionActionLog[];
  actionPlan: string[];
  targetReturnDate?: string;
  resolvedDate?: string;
  schoolId?: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  grade: string;
  shift: 'Manhã' | 'Tarde' | 'Integral' | 'Noite' | 'manha' | 'tarde' | 'integral' | 'noite';
  totalStudents: number;
  presentToday?: number;
  absentToday?: number;
  attendanceRateToday?: number;
  studentsAtRiskCount?: number;
  attendanceRate?: number;
  room?: string;
  description?: string;
  schoolId?: string;
}

export interface CriticalStudentInfo {
  id: string;
  name: string;
  ra: string;
  classId: string;
  className: string;
  attendanceRate: number;
  consecutiveAbsences: number;
  riskLevel: RiskLevel;
  hasDisciplinaryOccurrence: boolean;
  totalOccurrences: number;
  interventionStage?: string;
  guardianName?: string;
  guardianPhone?: string;
}

export interface MonthlyPedagogicalReport {
  month: string;
  monthIndex: number; // 1-12
  year: number;
  totalEnrolled: number;
  averageAttendanceRate: number;
  totalAbsences: number;
  studentsWithCriticalAbsence: number; // < 75%
  businessDaysCount?: number;
  criticalStudentsList?: CriticalStudentInfo[];
  activeSearchCasesCount: number;
  successfulReintegrations: number;
  alertsDispatched: number;
  alertsResponded: number;
  absenceCausesDistribution: { cause: string; count: number; percentage: number }[];
  riskByClass: { classId: string; className: string; averageAttendance: number; riskStudents: number; totalStudents: number; isLaunched?: boolean; presentCount?: number; absentCount?: number }[];
  attendanceTrend: { week: string; rate: number; absences: number }[];
  pedagogicalInsights: string[];
}

export interface SeducContingencyReport {
  schoolName: string;
  officialHeader: string;
  subHeader: string;
  reportTitle: string;
  date: string;
  formattedDate: string;
  summary: {
    totalStudents: number;
    totalPresent: number;
    totalFaltaJustificada: number;
    totalFaltaInjustificada: number;
    totalAtestados: number;
    totalAtrasos: number;
    overallAttendanceRate: number;
  };
  classReports: {
    classId: string;
    className: string;
    shift: string;
    grade: string;
    totalEnrolled: number;
    presentCount: number;
    faltaJustificadaCount: number;
    faltaInjustificadaCount: number;
    atestadoMedicoCount: number;
    atrasoCount: number;
    attendanceRate: number;
    absentStudents: {
      id: string;
      name: string;
      ra: string;
      status: AttendanceStatus;
      isAbsent: boolean;
      isCountedAsAbsence: boolean;
      justification: string;
      medicalCertificate: string;
      consecutiveAbsences: number;
      totalAbsences: number;
      attendanceRate: number;
      guardianName: string;
      guardianPhone: string;
      gateRecord: { type: GateMovementType; time: string; reason: string } | null;
    }[];
  }[];
}

export interface StudentOccurrenceReportItem {
  id: string;
  data: string;
  aula: string;
  professor: string;
  turma: string;
  ocorrencia: string;
  descricao?: string;
  medida: string;
  mediacao?: string;
  mediador?: string;
  status: string;
}

export interface FamilyInteractionReportItem {
  id?: string;
  data: string;
  estudante: string;
  tratativa: string;
  mediador: string;
}

export interface OfficialSchoolMonitoringReport extends SeducContingencyReport {
  commercialSystemName?: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  title: string | null;
  lastSync: string | null;
  connectedUserEmail?: string | null;
  syncedCounts?: {
    students: number;
    attendance: number;
    interventions: number;
    gateRecords: number;
    alerts: number;
  };
}

// === MÓDULO DE GRADE CURRICULAR, GERADOR DE HORÁRIOS & CRITÉRIOS ANUAIS ===
export type CurriculumMatrixCategory = 'note' | 'ema' | 'rest';

export type SimultaneityRuleMode = 'exclusive' | 'together';

export interface ExclusiveGroupCriteria {
  id: string;
  name: string; // Ex: "Laboratório de Ciências" ou "Educação Física Conjunta"
  mode?: SimultaneityRuleMode; // 'exclusive' (limite simultâneo) | 'together' (precisam acontecer juntas)
  keyword: string; // Palavra-chave / disciplina principal
  disciplines?: string[]; // Disciplinas selecionadas da Matriz Curricular
  targetGradeSeries?: string[]; // Opcional: Anos/Séries específicos (vazio = todas as turmas com a disciplina)
  maxSimultaneous: number; // Usado quando mode === 'exclusive' (Ex: 1 turma por horário na escola)
  colorHex: string; // Ex: "#6aa84f"
}

export interface AnnualTimetableCriteria {
  year: number;
  legislationRef: string; // Ex: "Diretrizes Curriculares 2026"
  notes?: string;
  preservedFixedTerms: string[]; // Termos/disciplinas fixas preservadas na limpeza
  conflictExceptionTerms: string[]; // Exceções de choque (ex: intervalos, atividades conjuntas)
  noteDisciplines: string[]; // Disciplinas que usam Notebook / Carrinho de Equipamentos
  platformKeywords: string[]; // Palavras-chave que ativam trava de plataforma no módulo de Equipamentos
  maxCartsSimultaneous: number; // Quantidade máxima de carrinhos simultâneos na escola
  khanThirdCartWhenEduProfFree: boolean; // Regra opcional de carrinho extra
  exclusiveGroups: ExclusiveGroupCriteria[]; // Grupos de simultaneidade (exclusividade ou aulas conjuntas)
  maxSameSubjectPerDay: number; // Máx. aulas da mesma disciplina por dia na mesma turma
  defaultTeacherDailyLimit: number; // Limite padrão de aulas por dia por professor
  preferDoubleLessonsNote: boolean; // Priorizar aulas geminadas para disciplinas com notebook/equipamentos
  preferDoubleLessonsEma: boolean; // Priorizar aulas geminadas para grupos de simultaneidade
  enablePreBlockContinuityLock: boolean; // Trava pré-Multiplica/ATPCA: evita 1 aula isolada logo antes de bloqueio
  availableAoeAgents: number; // Quantidade de agentes AOE para logística de corredor (padrão 2)
  areaColors: Record<string, string>;
  areaCompatibility: Record<string, string[]>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AtpcaBlockRule {
  id: string;
  area: string; // Ex: "LGG", "MAT", "CHS", "CNT"
  dayOfWeek: number; // 1 = Segunda ... 5 = Sexta
  periodNumbers: number[]; // Ex: [1, 2]
  label?: string;
}

export interface MultiplicaSlot {
  id: string;
  dayOfWeek: number; // 1 = Segunda ... 5 = Sexta
  startTime: string; // Horário de relógio "HH:MM" (ex: "13:00")
  endTime: string;   // Horário de relógio "HH:MM" (ex: "14:30")
}

export interface TimetableTeacherProfile {
  id: string;
  userId?: string; // Vínculo direto com UserAccount da escola
  name: string;
  role?: UserRole; // 'professor' | 'gestao_paac'
  area: string; // Área principal — ex: "LGG", "MAT", "CHS", "CNT", "INOVA"
  areas?: string[]; // Todas as áreas de atuação do docente (afinidade pedagógica nas substituições)
  disciplines?: string[]; // Disciplinas cadastradas na Matriz Curricular que este docente pode lecionar
  multiplicaDay?: number; // Retrocompatibilidade (1..5)
  multiplicaPeriods: number[]; // Aulas assimiladas ou legado
  multiplicaStartTime?: string; // Horário de início no relógio "HH:MM"
  multiplicaEndTime?: string; // Horário de término no relógio "HH:MM"
  multiplicaSlots?: MultiplicaSlot[]; // Lista flexível de dias e horários de relógio do Multiplica
  dailyLimit: number; // Ex: 7
}

export interface GradeCurriculumEntry {
  id: string;
  gradeSeries: string; // Ex: "6º Ano", "7º Ano", "1ª Série do EM"
  discipline: string; // Ex: "História", "Matemática", "Física"
  weeklyLessons: number; // Quantidade de aulas por semana para CADA turma deste ano/série
}

export interface CurriculumMatrixItem {
  id: string;
  category: CurriculumMatrixCategory;
  classId: string;
  className: string;
  gradeSeries?: string;
  discipline: string;
  teacherName: string;
  weeklyLessons: number;
  hasPlatform?: boolean;
  platformName?: string;
}

export interface TimetablePeriodDef {
  number: number; // 1..9 (0 para intervalos/almoço)
  id: string;
  label: string; // Ex: "1ª Aula", "Intervalo", "Almoço"
  start: string; // HH:MM
  end: string; // HH:MM
  isBreak?: boolean;
}

export interface TimetableGridCell {
  id: string; // `${dayOfWeek}|${periodId}|${classId}`
  dayOfWeek: number; // 1..5
  periodId: string;
  periodNumber: number; // 1..9 (0 se intervalo)
  periodLabel: string;
  classId: string;
  className: string;
  teacherName?: string;
  discipline?: string;
  fixedLabel?: string;
  category?: 'fixed' | 'note' | 'ema' | 'rest' | 'manual';
  colorHex?: string;
  locked?: boolean;
  hasPlatform?: boolean;
  platformName?: string;
}

export interface TeacherSubstitutionRecord {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 1..5
  periodId: string;
  periodNumber: number; // 1..9
  periodLabel: string;
  classId: string;
  className: string;
  discipline: string;
  absentTeacherName: string;
  absentTeacherArea: string;
  substituteTeacherName: string;
  substituteTeacherArea: string;
  sameArea: boolean;
  reason?: string;
  notes?: string;
  status: 'confirmada' | 'cancelada';
  recordedBy?: string;
  recordedAt: string;
}

export interface TimetableWorkspace {
  schoolId: string;
  activeYear: number;
  criteriaByYear: Record<number, AnnualTimetableCriteria>;
  atpcaRules: AtpcaBlockRule[];
  teachers: TimetableTeacherProfile[];
  gradeCurriculum?: GradeCurriculumEntry[]; // Matriz Curricular padronizada por Ano/Série
  matrix: CurriculumMatrixItem[]; // Cargas expandidas por turma (vínculo docente)
  periods: TimetablePeriodDef[];
  cells: TimetableGridCell[];
  substitutions?: TeacherSubstitutionRecord[];
  updatedAt?: string;
  updatedBy?: string;
}

