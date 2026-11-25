import {
  School,
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  MonthlyPedagogicalReport,
  UserRole
} from '../types';

// Identificador padrão interno mantido por compatibilidade retroativa com bancos existentes.
// Os dados institucionais reais da escola são carregados diretamente do Firebase Firestore.
export const DEFAULT_SCHOOL_ID = 'ee-arlindo-silvestre';

export const DEFAULT_SCHOOLS: School[] = [
  {
    id: DEFAULT_SCHOOL_ID,
    name: 'Unidade Escolar Principal',
    codeCie: '',
    network: 'Rede de Ensino',
    city: '',
    address: '',
    phone: '',
    directorName: '',
    active: true,
    modules: {
      diario: true,
      portaria: true,
      busca_ativa: true,
      ocorrencias: true,
      tablets: true,
      relatorios: true,
    },
    createdAt: '2026-01-15T08:00:00.000Z',
  }
];

export const SECOND_SCHOOL_CLASSES: SchoolClass[] = [];
export const SECOND_SCHOOL_STUDENTS: Student[] = [];

// Apenas conta estrutural de bootstrap do Painel Master Global.
// Nenhum nome real de servidor, professor ou PIN é embutido no código público (LGPD).
// Todos os operadores escolares são carregados exclusivamente do Firebase Firestore autenticado.
export const DEFAULT_USERS: {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
  pin?: string;
  schoolId?: string;
  isUniversal?: boolean;
  notes?: string;
}[] = [
  {
    id: 'usr-master',
    name: 'Proprietário (Painel Master Global)',
    username: 'proprietario.master',
    role: 'super_admin',
    roleLabel: 'Proprietário / Admin Universal (SaaS)',
    pin: 'Master@2026',
    active: true,
    isUniversal: true,
  },
];

// Mapa vazio por padrão: PINs reais vivem exclusivamente no Firestore autenticado.
export const DEFAULT_PINS: Record<string, { pin: string; role: UserRole; schoolId?: string }> = {
  'usr-master': { pin: 'Master@2026', role: 'super_admin' },
};

// Sem dados pessoais fictícios ou reais de estudantes, responsáveis ou servidores no bundle cliente (LGPD).
export const DEFAULT_CLASSES: SchoolClass[] = [];
export const DEFAULT_STUDENTS: Student[] = [];
export const DEFAULT_ALERTS: ParentAlert[] = [];
export const DEFAULT_INTERVENTIONS: InterventionCase[] = [];

export const DEFAULT_REPORT: MonthlyPedagogicalReport = {
  month: 'Setembro',
  monthIndex: 9,
  year: 2026,
  totalEnrolled: 0,
  averageAttendanceRate: 0,
  totalAbsences: 0,
  studentsWithCriticalAbsence: 0,
  activeSearchCasesCount: 0,
  successfulReintegrations: 0,
  alertsDispatched: 0,
  alertsResponded: 0,
  absenceCausesDistribution: [],
  riskByClass: [],
  attendanceTrend: [],
  pedagogicalInsights: ['Nenhum dado disponível para este período.']
};
