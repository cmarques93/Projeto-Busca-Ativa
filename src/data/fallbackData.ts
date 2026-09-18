import {
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  MonthlyPedagogicalReport,
  UserAccount,
  UserRole
} from '../types';

export const DEFAULT_USERS: {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
}[] = [
  {
    id: 'usr-admin',
    name: 'Administrador Geral',
    username: 'admin',
    role: 'admin',
    roleLabel: 'Administrador (Master)',
    active: true,
  },
  {
    id: 'usr-gestao',
    name: 'Profª. Silvana Rocha',
    username: 'silvana.rocha',
    role: 'gestao_paac',
    roleLabel: 'Gestão / PAAC',
    active: true,
  },
  {
    id: 'usr-aoe',
    name: 'Carlos Eduardo Mendes',
    username: 'carlos.mendes',
    role: 'aoe',
    roleLabel: 'AOE - Secretaria & Portaria',
    active: true,
  },
  {
    id: 'usr-professor',
    name: 'Prof. Rogério Silva',
    username: 'rogerio.silva',
    role: 'professor',
    roleLabel: 'Professor Regente',
    active: true,
  },
];

export const DEFAULT_PINS: Record<string, { pin: string; user: any }> = {
  'usr-admin': {
    pin: '1234',
    user: {
      id: 'usr-admin',
      username: 'admin',
      name: 'Administrador Geral',
      role: 'admin',
      roleLabel: 'Administrador (Master)',
    },
  },
  'usr-gestao': {
    pin: '2026',
    user: {
      id: 'usr-gestao',
      username: 'silvana.rocha',
      name: 'Profª. Silvana Rocha',
      role: 'gestao_paac',
      roleLabel: 'Gestão / PAAC',
    },
  },
  'usr-aoe': {
    pin: '1010',
    user: {
      id: 'usr-aoe',
      username: 'carlos.mendes',
      name: 'Carlos Eduardo Mendes',
      role: 'aoe',
      roleLabel: 'AOE - Secretaria & Portaria',
    },
  },
  'usr-professor': {
    pin: '3344',
    user: {
      id: 'usr-professor',
      username: 'rogerio.silva',
      name: 'Prof. Rogério Silva',
      role: 'professor',
      roleLabel: 'Professor Regente',
    },
  },
};

export const DEFAULT_SCHOOL_INFO = {
  schoolName: 'EE Professor Arlindo Silvestre',
  lastUpdated: new Date().toISOString(),
  totalStudents: 214,
  totalClasses: 7,
  activeAlertsCount: 4,
  activeCasesCount: 3,
};

export const DEFAULT_CLASSES: SchoolClass[] = [
  { id: '6A', name: '6º Ano A', grade: 'Ensino Fundamental II', shift: 'Manhã', totalStudents: 28, presentToday: 26, absentToday: 2, attendanceRateToday: 92.8, studentsAtRiskCount: 2 },
  { id: '7B', name: '7º Ano B', grade: 'Ensino Fundamental II', shift: 'Tarde', totalStudents: 30, presentToday: 25, absentToday: 5, attendanceRateToday: 83.3, studentsAtRiskCount: 4 },
  { id: '8A', name: '8º Ano A', grade: 'Ensino Fundamental II', shift: 'Manhã', totalStudents: 29, presentToday: 27, absentToday: 2, attendanceRateToday: 93.1, studentsAtRiskCount: 1 },
  { id: '9A', name: '9º Ano A', grade: 'Ensino Fundamental II', shift: 'Manhã', totalStudents: 32, presentToday: 26, absentToday: 6, attendanceRateToday: 81.2, studentsAtRiskCount: 5 },
  { id: '1EM-A', name: '1º Ano EM - A', grade: 'Ensino Médio', shift: 'Integral', totalStudents: 34, presentToday: 28, absentToday: 6, attendanceRateToday: 82.3, studentsAtRiskCount: 6 },
  { id: '2EM-B', name: '2º Ano EM - B', grade: 'Ensino Médio', shift: 'Tarde', totalStudents: 31, presentToday: 28, absentToday: 3, attendanceRateToday: 90.3, studentsAtRiskCount: 3 },
  { id: '3EM-A', name: '3º Ano EM - A', grade: 'Ensino Médio', shift: 'Manhã', totalStudents: 30, presentToday: 29, absentToday: 1, attendanceRateToday: 96.6, studentsAtRiskCount: 1 },
];

export const DEFAULT_STUDENTS: Student[] = [
  {
    id: 'std-001',
    name: 'Lucas Gabriel Silveira',
    ra: '2024-8841',
    classId: '9A',
    className: '9º Ano A',
    guardianName: 'Marilene dos Santos Silveira',
    guardianPhone: '(11) 98721-4320',
    guardianRelationship: 'Mãe',
    address: 'Rua das Flores, 142',
    neighborhood: 'Vila Esperança',
    status: 'evasao_iminente',
    riskLevel: 'critico',
    totalSchoolDays: 45,
    totalAbsences: 14,
    consecutiveAbsences: 4,
    attendanceRate: 68.8,
    vulnerabilityFactors: ['Trabalho infantil informal', 'Falta de transporte no período chuvoso', 'Irmãos menores sob cuidado'],
    lastAttendanceDate: '2026-09-10',
    activeInterventionId: 'int-001',
    notes: 'Aluno relatou que está ajudando o tio em oficina mecânica. Família foi notificada.'
  },
  {
    id: 'std-002',
    name: 'Beatriz Vitória Carvalho',
    ra: '2024-7712',
    classId: '9A',
    className: '9º Ano A',
    guardianName: 'Carlos Eduardo Carvalho',
    guardianPhone: '(11) 97654-1298',
    guardianRelationship: 'Pai',
    address: 'Travessa Bela Vista, 89',
    neighborhood: 'Jardim Primavera',
    status: 'em_busca_ativa',
    riskLevel: 'critico',
    totalSchoolDays: 45,
    totalAbsences: 12,
    consecutiveAbsences: 3,
    attendanceRate: 73.3,
    vulnerabilityFactors: ['Distância escolar > 6km', 'Desmotivação e defasagem idade-ano'],
    lastAttendanceDate: '2026-09-11',
    activeInterventionId: 'int-002',
    notes: 'Caso encaminhado para assistência social escolar. Visita domiciliar realizada.'
  },
  {
    id: 'std-003',
    name: 'Matheus Henrique de Oliveira',
    ra: '2024-5543',
    classId: '1EM-A',
    className: '1º Ano EM - A',
    guardianName: 'Sandra Mara de Oliveira',
    guardianPhone: '(11) 96543-9087',
    guardianRelationship: 'Mãe',
    address: 'Av. dos Trabalhadores, 1205, Bloco B',
    neighborhood: 'Parque São Jorge',
    status: 'alerta',
    riskLevel: 'alto',
    totalSchoolDays: 45,
    totalAbsences: 10,
    consecutiveAbsences: 3,
    attendanceRate: 77.7,
    vulnerabilityFactors: ['Troca de turno recente', 'Histórico de reprovação anterior'],
    lastAttendanceDate: '2026-09-12',
    activeInterventionId: 'int-003',
    notes: 'Alerta emitido automaticamente via WhatsApp hoje pela manhã.'
  },
  {
    id: 'std-004',
    name: 'Juliana Mendes Rocha',
    ra: '2024-9120',
    classId: '7B',
    className: '7º Ano B',
    guardianName: 'Aparecida Rocha',
    guardianPhone: '(11) 99321-7788',
    guardianRelationship: 'Avó',
    address: 'Rua Santo Antônio, 45',
    neighborhood: 'Centro Velho',
    status: 'alerta',
    riskLevel: 'moderado',
    totalSchoolDays: 45,
    totalAbsences: 8,
    consecutiveAbsences: 2,
    attendanceRate: 82.2,
    vulnerabilityFactors: ['Responsável idosa com dificuldade de mobilidade', 'Faltas recorrentes às sextas-feiras'],
    lastAttendanceDate: '2026-09-14',
    notes: 'Avó informou que aluna cuida dela quando as dores se intensificam.'
  },
  {
    id: 'std-005',
    name: 'Enzo Rodrigues Souza',
    ra: '2024-3421',
    classId: '7B',
    className: '7º Ano B',
    guardianName: 'Valéria Souza',
    guardianPhone: '(11) 98112-9900',
    guardianRelationship: 'Mãe',
    address: 'Rua Ipê Amarelo, 310',
    neighborhood: 'Vila Esperança',
    status: 'reintegrado',
    riskLevel: 'moderado',
    totalSchoolDays: 45,
    totalAbsences: 9,
    consecutiveAbsences: 0,
    attendanceRate: 80.0,
    vulnerabilityFactors: ['Doença respiratória crônica'],
    lastAttendanceDate: '2026-09-18',
    activeInterventionId: 'int-004',
    notes: 'Retornou às aulas após mediação pedagógica e plano de reposição de atividades.'
  },
  {
    id: 'std-006',
    name: 'Kauã Ferreira Lima',
    ra: '2024-4432',
    classId: '1EM-A',
    className: '1º Ano EM - A',
    guardianName: 'Renato Ferreira Lima',
    guardianPhone: '(11) 98223-1122',
    guardianRelationship: 'Pai',
    address: 'Rua Projetada A, 12',
    neighborhood: 'Morro Alegre',
    status: 'alerta',
    riskLevel: 'alto',
    totalSchoolDays: 45,
    totalAbsences: 11,
    consecutiveAbsences: 3,
    attendanceRate: 75.5,
    vulnerabilityFactors: ['Trabalho em feira livre aos finais de semana'],
    lastAttendanceDate: '2026-09-14',
    notes: 'Família comunicada sobre as ausências.'
  }
];

export const DEFAULT_ALERTS: ParentAlert[] = [
  {
    id: 'alt-001',
    studentId: 'std-001',
    studentName: 'Lucas Gabriel Silveira',
    classId: '9A',
    className: '9º Ano A',
    guardianPhone: '(11) 98721-4320',
    guardianName: 'Marilene dos Santos Silveira',
    channel: 'whatsapp',
    triggerReason: '3_faltas_consecutivas',
    triggerLabel: '4 ausências consecutivas sem justificativa',
    status: 'lido',
    sentAt: '2026-09-18T08:15:00',
    readAt: '2026-09-18T08:22:15',
    messageContent: 'Prezada Marilene, a EE Professor Arlindo Silvestre comunica que seu(sua) filho(a) Lucas Gabriel Silveira registrou 4 ausências consecutivas.',
    autoGenerated: true,
  }
];

export const DEFAULT_INTERVENTIONS: InterventionCase[] = [
  {
    id: 'int-001',
    studentId: 'std-001',
    studentName: 'Lucas Gabriel Silveira',
    classId: '9A',
    className: '9º Ano A',
    guardianName: 'Marilene dos Santos Silveira',
    guardianPhone: '(11) 98721-4320',
    priority: 'urgente_conselho',
    stage: 'contato_telefonico_whatsapp',
    openedAt: '2026-09-10',
    lastUpdatedAt: '2026-09-18',
    assignedPedagogue: 'Profª. Silvana Rocha (Coordenação)',
    reason: 'Trabalho infantil informal e falta de transporte',
    actionLog: [
      {
        id: 'act-001',
        date: '2026-09-10',
        action: 'Ligação telefônica para a mãe Marilene',
        author: 'Profª. Silvana Rocha',
        notes: 'Relatou que jovem ajuda o tio.',
        result: 'Família orientada sobre a obrigatoriedade legal da frequência escolar.',
      }
    ],
    actionPlan: ['Visita domiciliar', 'Encaminhamento ao CRAS'],
  }
];

export const DEFAULT_REPORT: MonthlyPedagogicalReport = {
  month: 'Setembro',
  monthIndex: 9,
  year: 2026,
  totalEnrolled: 214,
  averageAttendanceRate: 88.4,
  totalAbsences: 112,
  studentsWithCriticalAbsence: 6,
  activeSearchCasesCount: 4,
  successfulReintegrations: 3,
  alertsDispatched: 14,
  alertsResponded: 11,
  absenceCausesDistribution: [
    { cause: 'Problemas de saúde / gripe sazonal', count: 42, percentage: 37.5 },
    { cause: 'Desmotivação e defasagem escolar', count: 28, percentage: 25.0 },
    { cause: 'Dificuldade de transporte / chuva', count: 22, percentage: 19.6 },
    { cause: 'Trabalho informal / jovem aprendiz', count: 20, percentage: 17.9 }
  ],
  riskByClass: [
    { classId: '6A', className: '6º Ano A', averageAttendance: 92.8, riskStudents: 2, totalStudents: 28 },
    { classId: '7B', className: '7º Ano B', averageAttendance: 83.3, riskStudents: 4, totalStudents: 30 },
    { classId: '8A', className: '8º Ano A', averageAttendance: 93.1, riskStudents: 1, totalStudents: 29 },
    { classId: '9A', className: '9º Ano A', averageAttendance: 81.2, riskStudents: 5, totalStudents: 32 },
    { classId: '1EM-A', className: '1º Ano EM - A', averageAttendance: 82.3, riskStudents: 6, totalStudents: 34 },
    { classId: '2EM-B', className: '2º Ano EM - B', averageAttendance: 90.3, riskStudents: 3, totalStudents: 31 },
    { classId: '3EM-A', className: '3º Ano EM - A', averageAttendance: 96.6, riskStudents: 1, totalStudents: 30 }
  ],
  attendanceTrend: [
    { week: 'Semana 1', rate: 91.2, absences: 24 },
    { week: 'Semana 2', rate: 89.5, absences: 31 },
    { week: 'Semana 3', rate: 86.8, absences: 38 },
    { week: 'Semana 4', rate: 88.4, absences: 19 }
  ],
  pedagogicalInsights: [
    'A taxa média de frequência da escola é de 88.4%, acima da meta legal da LDB (75%).',
    'Turmas do 9º Ano A e 1º Ano EM requerem maior atenção da Busca Ativa.',
    'A integração de avisos via WhatsApp acelerou em 65% a resposta dos responsáveis.'
  ]
};
