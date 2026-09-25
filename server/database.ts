import fs from 'fs';
import path from 'path';
import {
  Student,
  AttendanceRecord,
  ParentAlert,
  InterventionCase,
  SchoolClass,
  MonthlyPedagogicalReport,
  AlertTrigger,
  GateRecord,
  AttendanceStatus,
  UserAccount,
  UserRole
} from '../src/types.js';

interface DatabaseSchema {
  schoolName: string;
  lastUpdated: string;
  classes: SchoolClass[];
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  alerts: ParentAlert[];
  interventions: InterventionCase[];
  gateRecords?: GateRecord[];
  users?: UserAccount[];
  googleSheetsConfig?: {
    spreadsheetId?: string | null;
    spreadsheetUrl?: string | null;
    title?: string | null;
    lastSync?: string | null;
    connectedUserEmail?: string | null;
    syncedCounts?: {
      students: number;
      attendance: number;
      interventions: number;
      gateRecords: number;
      alerts: number;
    };
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'school_database.json');

// Helper to format date
const todayStr = new Date().toISOString().split('T')[0];

function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day);
  d.setDate(d.getDate() + daysToAdd);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayOut = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayOut}`;
}

function generateSeedData(): DatabaseSchema {
  const classes: SchoolClass[] = [
    { id: '6A', name: '6º Ano A', grade: 'Ensino Fundamental II', shift: 'Manhã', totalStudents: 28, presentToday: 26, absentToday: 2, attendanceRateToday: 92.8, studentsAtRiskCount: 2 },
    { id: '7B', name: '7º Ano B', grade: 'Ensino Fundamental II', shift: 'Tarde', totalStudents: 30, presentToday: 25, absentToday: 5, attendanceRateToday: 83.3, studentsAtRiskCount: 4 },
    { id: '8A', name: '8º Ano A', grade: 'Ensino Fundamental II', shift: 'Manhã', totalStudents: 29, presentToday: 27, absentToday: 2, attendanceRateToday: 93.1, studentsAtRiskCount: 1 },
    { id: '9A', name: '9º Ano A', grade: 'Ensino Fundamental II', shift: 'Manhã', totalStudents: 32, presentToday: 26, absentToday: 6, attendanceRateToday: 81.2, studentsAtRiskCount: 5 },
    { id: '1EM-A', name: '1º Ano EM - A', grade: 'Ensino Médio', shift: 'Integral', totalStudents: 34, presentToday: 28, absentToday: 6, attendanceRateToday: 82.3, studentsAtRiskCount: 6 },
    { id: '2EM-B', name: '2º Ano EM - B', grade: 'Ensino Médio', shift: 'Tarde', totalStudents: 31, presentToday: 28, absentToday: 3, attendanceRateToday: 90.3, studentsAtRiskCount: 3 },
    { id: '3EM-A', name: '3º Ano EM - A', grade: 'Ensino Médio', shift: 'Manhã', totalStudents: 30, presentToday: 29, absentToday: 1, attendanceRateToday: 96.6, studentsAtRiskCount: 1 },
  ];

  const students: Student[] = [
    {
      id: 'std-001',
      name: 'Lucas Gabriel Silveira',
      ra: '2024-8841',
      classId: '9A',
      className: '9º Ano A',
      tutor: 'Profª. Maria Helena',
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
      tutor: 'Prof. Carlos Eduardo',
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
      tutor: 'Prof. Rogério Silva',
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
      tutor: 'Profª. Silvana Rocha',
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
      tutor: 'Profª. Beatriz Rabesco',
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
      lastAttendanceDate: todayStr,
      activeInterventionId: 'int-004',
      notes: 'Retornou às aulas após mediação pedagógica e plano de reposição de atividades.'
    },
    {
      id: 'std-006',
      name: 'Kauã Ferreira Lima',
      ra: '2024-4432',
      classId: '1EM-A',
      className: '1º Ano EM - A',
      tutor: 'Prof. Rogério Silva',
      guardianName: 'Renato Ferreira Lima',
      guardianPhone: '(11) 98223-1122',
      guardianRelationship: 'Pai',
      address: 'Rua Projetada A, 12',
      neighborhood: 'Morro Alegre',
      status: 'evasao_iminente',
      riskLevel: 'critico',
      totalSchoolDays: 45,
      totalAbsences: 15,
      consecutiveAbsences: 5,
      attendanceRate: 66.6,
      vulnerabilityFactors: ['Conflito interpessoal com colegas', 'Residência em área de difícil acesso', 'Desmotivação'],
      lastAttendanceDate: '2026-09-08',
      activeInterventionId: 'int-005',
      notes: 'Sem contato telefônico atendido nos últimos 4 dias. Conselho Tutelar notificado.'
    },
    {
      id: 'std-007',
      name: 'Yasmin Costa e Silva',
      ra: '2024-1189',
      classId: '6A',
      className: '6º Ano A',
      tutor: 'Profª. Silvana Rocha',
      guardianName: 'Débora Costa',
      guardianPhone: '(11) 97455-8833',
      guardianRelationship: 'Mãe',
      address: 'Rua das Camélias, 77',
      neighborhood: 'Jardim das Oliveiras',
      status: 'regular',
      riskLevel: 'baixo',
      totalSchoolDays: 45,
      totalAbsences: 2,
      consecutiveAbsences: 0,
      attendanceRate: 95.5,
      vulnerabilityFactors: [],
      lastAttendanceDate: todayStr,
      notes: 'Frequência exemplar.'
    },
    {
      id: 'std-008',
      name: 'Gabriel Martins Ribeiro',
      ra: '2024-6675',
      classId: '2EM-B',
      className: '2º Ano EM - B',
      tutor: 'Profª. Maria Helena',
      guardianName: 'Marcos Vinicius Ribeiro',
      guardianPhone: '(11) 99001-2244',
      guardianRelationship: 'Pai',
      address: 'Rua Bahia, 540',
      neighborhood: 'Bela Vista',
      status: 'alerta',
      riskLevel: 'alto',
      totalSchoolDays: 45,
      totalAbsences: 11,
      consecutiveAbsences: 3,
      attendanceRate: 75.5,
      vulnerabilityFactors: ['Jovem aprendiz com sobrecarga de horário', 'Cansaço físico evidente'],
      lastAttendanceDate: '2026-09-12',
      notes: 'Agendada conversa com o empregador e a família para ajuste de horário de estudo.'
    },
    {
      id: 'std-009',
      name: 'Ana Clara Albuquerque',
      ra: '2024-9988',
      classId: '3EM-A',
      className: '3º Ano EM - A',
      tutor: 'Prof. Rogério Silva',
      guardianName: 'Eliana Albuquerque',
      guardianPhone: '(11) 98844-3321',
      guardianRelationship: 'Mãe',
      address: 'Alameda das Acácias, 201',
      neighborhood: 'Jardim Primavera',
      status: 'regular',
      riskLevel: 'baixo',
      totalSchoolDays: 45,
      totalAbsences: 1,
      consecutiveAbsences: 0,
      attendanceRate: 97.7,
      vulnerabilityFactors: [],
      lastAttendanceDate: todayStr,
      notes: 'Líder de turma.'
    },
    {
      id: 'std-010',
      name: 'Felipe Alencar Prado',
      ra: '2024-5511',
      classId: '8A',
      className: '8º Ano A',
      tutor: 'Profª. Beatriz Rabesco',
      guardianName: 'Tânia Alencar Prado',
      guardianPhone: '(11) 97123-5566',
      guardianRelationship: 'Mãe',
      address: 'Rua Ceará, 90',
      neighborhood: 'Parque São Jorge',
      status: 'regular',
      riskLevel: 'baixo',
      totalSchoolDays: 45,
      totalAbsences: 3,
      consecutiveAbsences: 0,
      attendanceRate: 93.3,
      vulnerabilityFactors: [],
      lastAttendanceDate: todayStr,
    },
    {
      id: 'std-011',
      name: 'Larissa Antunes Faria',
      ra: '2024-4409',
      classId: '6A',
      className: '6º Ano A',
      tutor: 'Prof. Carlos Eduardo',
      guardianName: 'Cláudio Faria',
      guardianPhone: '(11) 98321-4477',
      guardianRelationship: 'Pai',
      address: 'Rua Piauí, 18',
      neighborhood: 'Vila Esperança',
      status: 'alerta',
      riskLevel: 'moderado',
      totalSchoolDays: 45,
      totalAbsences: 7,
      consecutiveAbsences: 2,
      attendanceRate: 84.4,
      vulnerabilityFactors: ['Mudança de endereço recente', 'Adaptação escolar'],
      lastAttendanceDate: '2026-09-14',
      notes: 'Família se mudou este mês.'
    },
    {
      id: 'std-012',
      name: 'Davi Lucca Barbosa',
      ra: '2024-7733',
      classId: '8A',
      className: '8º Ano A',
      tutor: 'Profª. Maria Helena',
      guardianName: 'Simone Barbosa',
      guardianPhone: '(11) 96512-8899',
      guardianRelationship: 'Mãe',
      address: 'Rua Goiás, 303',
      neighborhood: 'Bela Vista',
      status: 'regular',
      riskLevel: 'baixo',
      totalSchoolDays: 45,
      totalAbsences: 2,
      consecutiveAbsences: 0,
      attendanceRate: 95.5,
      lastAttendanceDate: todayStr,
      vulnerabilityFactors: []
    }
  ];

  const attendanceRecords: AttendanceRecord[] = [
    { id: 'att-001', studentId: 'std-001', studentName: 'Lucas Gabriel Silveira', classId: '9A', date: todayStr, status: 'falta_injustificada', recordedBy: 'Profª. Helena Souza (Matemática)', recordedAt: `${todayStr}T07:45:00` },
    { id: 'att-002', studentId: 'std-002', studentName: 'Beatriz Vitória Carvalho', classId: '9A', date: todayStr, status: 'falta_injustificada', recordedBy: 'Profª. Helena Souza (Matemática)', recordedAt: `${todayStr}T07:45:00` },
    { id: 'att-003', studentId: 'std-003', studentName: 'Matheus Henrique de Oliveira', classId: '1EM-A', date: todayStr, status: 'falta_injustificada', recordedBy: 'Prof. André Lemos (Física)', recordedAt: `${todayStr}T08:00:00` },
    { id: 'att-004', studentId: 'std-004', studentName: 'Juliana Mendes Rocha', classId: '7B', date: todayStr, status: 'falta_justificada', justification: 'Consulta médica da responsável legal', recordedBy: 'Profª. Roberta Castro (Português)', recordedAt: `${todayStr}T13:30:00` },
    { id: 'att-005', studentId: 'std-005', studentName: 'Enzo Rodrigues Souza', classId: '7B', date: todayStr, status: 'presente', recordedBy: 'Profª. Roberta Castro (Português)', recordedAt: `${todayStr}T13:30:00` },
    { id: 'att-006', studentId: 'std-006', studentName: 'Kauã Ferreira Lima', classId: '1EM-A', date: todayStr, status: 'falta_injustificada', recordedBy: 'Prof. André Lemos (Física)', recordedAt: `${todayStr}T08:00:00` },
    { id: 'att-007', studentId: 'std-007', studentName: 'Yasmin Costa e Silva', classId: '6A', date: todayStr, status: 'presente', recordedBy: 'Profª. Carmen Lúcia (Ciências)', recordedAt: `${todayStr}T07:35:00` },
    { id: 'att-008', studentId: 'std-008', studentName: 'Gabriel Martins Ribeiro', classId: '2EM-B', date: todayStr, status: 'falta_injustificada', recordedBy: 'Prof. Ricardo Mendes (História)', recordedAt: `${todayStr}T14:00:00` },
    { id: 'att-009', studentId: 'std-009', studentName: 'Ana Clara Albuquerque', classId: '3EM-A', date: todayStr, status: 'presente', recordedBy: 'Profª. Vivian Melo (Sociologia)', recordedAt: `${todayStr}T07:40:00` },
    { id: 'att-010', studentId: 'std-010', studentName: 'Felipe Alencar Prado', classId: '8A', date: todayStr, status: 'presente', recordedBy: 'Prof. Marcos Vinicius (Geografia)', recordedAt: `${todayStr}T07:30:00` },
    { id: 'att-011', studentId: 'std-011', studentName: 'Larissa Antunes Faria', classId: '6A', date: todayStr, status: 'falta_injustificada', recordedBy: 'Profª. Carmen Lúcia (Ciências)', recordedAt: `${todayStr}T07:35:00` },
    { id: 'att-012', studentId: 'std-012', studentName: 'Davi Lucca Barbosa', classId: '8A', date: todayStr, status: 'presente', recordedBy: 'Prof. Marcos Vinicius (Geografia)', recordedAt: `${todayStr}T07:30:00` },
  ];

  const alerts: ParentAlert[] = [
    {
      id: 'alt-101',
      studentId: 'std-001',
      studentName: 'Lucas Gabriel Silveira',
      classId: '9A',
      className: '9º Ano A',
      guardianName: 'Marilene dos Santos Silveira',
      guardianPhone: '(11) 98721-4320',
      channel: 'whatsapp',
      triggerReason: '3_faltas_consecutivas',
      triggerLabel: '4ª falta consecutiva detectada',
      messageContent: 'Prezada Sra. Marilene, identificamos que o aluno Lucas Gabriel (9º Ano A) acumulou sua 4ª ausência consecutiva nesta data. A frequência escolar é um direito garantido por lei e fundamental para o sucesso do aluno. Solicitamos que compareça à coordenação pedagógica ou responda a esta mensagem informando o motivo da ausência para que possamos apoiá-los. Equipe Busca Ativa Escolar.',
      status: 'entregue',
      sentAt: `${todayStr}T08:15:22`,
      autoGenerated: true,
      guardianFeedback: 'Vou falar com ele hoje à noite, obrigado por avisar.'
    },
    {
      id: 'alt-102',
      studentId: 'std-006',
      studentName: 'Kauã Ferreira Lima',
      classId: '1EM-A',
      className: '1º Ano EM - A',
      guardianName: 'Renato Ferreira Lima',
      guardianPhone: '(11) 98223-1122',
      channel: 'whatsapp',
      triggerReason: '3_faltas_consecutivas',
      triggerLabel: '5ª falta consecutiva - Risco Crítico de Evasão',
      messageContent: 'URGENTE: Prezado Sr. Renato, notificamos que Kauã Ferreira Lima (1º EM - A) está há 5 dias seguidos sem comparecer às aulas. Segundo a LDB e o Estatuto da Criança e do Adolescente, convocamos a família para atendimento pedagógico imediato amanhã às 09h para evitar encaminhamento ao Conselho Tutelar. EE Professor Arlindo Silvestre.',
      status: 'enviado',
      sentAt: `${todayStr}T08:30:10`,
      autoGenerated: true
    },
    {
      id: 'alt-103',
      studentId: 'std-003',
      studentName: 'Matheus Henrique de Oliveira',
      classId: '1EM-A',
      className: '1º Ano EM - A',
      guardianName: 'Sandra Mara de Oliveira',
      guardianPhone: '(11) 96543-9087',
      channel: 'sms',
      triggerReason: '5_faltas_mes',
      triggerLabel: 'Alerta de infrequência acumulada (10 faltas)',
      messageContent: 'Aviso Escolar: O aluno Matheus Henrique atingiu 10 faltas no semestre, aproximando-se do limite de 25% de infrequência. Pedimos que entre em contato com a escola pelo tel (11) 3456-7890.',
      status: 'lido',
      sentAt: '2026-09-14T10:00:00',
      readAt: '2026-09-14T10:14:00',
      autoGenerated: true,
      guardianFeedback: 'Estive doente na semana passada, ele teve que me acompanhar. Vou levar o atestado.'
    },
    {
      id: 'alt-104',
      studentId: 'std-008',
      studentName: 'Gabriel Martins Ribeiro',
      classId: '2EM-B',
      className: '2º Ano EM - B',
      guardianName: 'Marcos Vinicius Ribeiro',
      guardianPhone: '(11) 99001-2244',
      channel: 'whatsapp',
      triggerReason: '3_faltas_consecutivas',
      triggerLabel: '3ª falta consecutiva registrada hoje',
      messageContent: 'Olá Sr. Marcos, registramos a terceira ausência consecutiva de Gabriel Martins (2º EM - B). Preocupamo-nos com o ritmo de estudos e a conclusão do ano letivo. Podemos conversar hoje pelo WhatsApp para entender como ajudar?',
      status: 'enviado',
      sentAt: `${todayStr}T14:15:00`,
      autoGenerated: true
    }
  ];

  const interventions: InterventionCase[] = [
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
      openedAt: '2026-09-05',
      lastUpdatedAt: todayStr,
      assignedPedagogue: 'Profª. Cláudia Valença (Orientadora Educacional)',
      reason: '4 faltas consecutivas e 14 acumuladas. Suspeita de trabalho infantil na oficina mecânica do tio.',
      actionPlan: [
        'Realizar visita domiciliar com equipe multidisciplinar (Pedagogo + Assistente Social)',
        'Acionar CRAS para inclusão do núcleo familiar no programa Bolsa Família / Auxílio Renda Cidadã',
        'Elaborar plano de reposição pedagógica personalizada para as 14 faltas',
        'Orientar a família sobre a ilicitude do trabalho infantil e a prioridade absoluta da educação'
      ],
      actionLog: [
        {
          id: 'act-1',
          date: '2026-09-05',
          action: 'Abertura do Caso de Busca Ativa',
          author: 'Profª. Cláudia Valença',
          notes: 'Gatilho de sistema disparado após 3ª falta consecutiva e taxa de frequência em 71%.',
          result: 'Caso instaurado com prioridade alta.'
        },
        {
          id: 'act-2',
          date: '2026-09-08',
          action: 'Contato Telefônico com Responsável',
          author: 'Assistente Social Marta',
          notes: 'Mãe confirmou que a situação financeira está crítica e Lucas está fazendo bicos.',
          result: 'Agendada visita domiciliar conjunta.'
        },
        {
          id: 'act-3',
          date: todayStr,
          action: 'Agendamento de Visita Domiciliar',
          author: 'Profª. Cláudia Valença',
          notes: 'Visita confirmada para amanhã às 14h com a presença do Agente Comunitário de Saúde.',
          result: 'Etapa avançada para Visita Domiciliar.'
        }
      ]
    },
    {
      id: 'int-002',
      studentId: 'std-002',
      studentName: 'Beatriz Vitória Carvalho',
      classId: '9A',
      className: '9º Ano A',
      guardianName: 'Carlos Eduardo Carvalho',
      guardianPhone: '(11) 97654-1298',
      priority: 'alta',
      stage: 'reuniao_pais',
      openedAt: '2026-09-08',
      lastUpdatedAt: '2026-09-14',
      assignedPedagogue: 'Prof. Marcelo Tavares (Coordenador Pedagógico)',
      reason: 'Frequência abaixo de 75% (73.3%) e dificuldade de deslocamento em dias de chuva.',
      actionPlan: [
        'Solicitação de inclusão no Transporte Escolar Municipal Gratuito (Rota Rural/Periferia)',
        'Acolhimento pedagógico individual e nivelamento de matemática e redação',
        'Assinatura de Termo de Compromisso de Frequência pelos responsáveis'
      ],
      actionLog: [
        {
          id: 'act-4',
          date: '2026-09-08',
          action: 'Triagem de Frequência',
          author: 'Prof. Marcelo Tavares',
          notes: 'Aluna faltou três vezes seguidas durante a semana de chuvas.',
          result: 'Identificada barreira de mobilidade urbana.'
        },
        {
          id: 'act-5',
          date: '2026-09-12',
          action: 'Envio de Alerta Automatizado',
          author: 'Sistema Busca Ativa',
          notes: 'Pai respondeu solicitando apoio com passe de transporte escolar.',
          result: 'Reunião agendada para formalização de passe escolar.'
        }
      ]
    },
    {
      id: 'int-005',
      studentId: 'std-006',
      studentName: 'Kauã Ferreira Lima',
      classId: '1EM-A',
      className: '1º Ano EM - A',
      guardianName: 'Renato Ferreira Lima',
      guardianPhone: '(11) 98223-1122',
      priority: 'urgente_conselho',
      stage: 'encaminhado_cras_conselho',
      openedAt: '2026-09-04',
      lastUpdatedAt: todayStr,
      assignedPedagogue: 'Profª. Cláudia Valença',
      reason: 'Abandono iminente: 5 faltas consecutivas, sem resposta a 3 tentativas de contato telefônico e notificação por aplicativo.',
      actionPlan: [
        'Emissão de FICAI (Ficha de Comunicação de Aluno Infrequente) para o Conselho Tutelar Regional',
        'Notificação formal ao CREAS / Ministério Público da Infância e Juventude',
        'Busca ativa in loco no endereço cadastrado com equipe de proteção social básica'
      ],
      actionLog: [
        {
          id: 'act-6',
          date: '2026-09-04',
          action: 'Registro de Infrequência Contínua',
          author: 'Profª. Cláudia Valença',
          notes: 'Aluno com 15 faltas no bimestre e sem justificativa.',
          result: 'Prioridade Urgente Conselho.'
        },
        {
          id: 'act-7',
          date: '2026-09-11',
          action: 'Tentativa de Contato Telefônico',
          author: 'Secretaria Escolar',
          notes: 'Linha chamada ocupada ou desligada. Mensagem WhatsApp enviada sem confirmação de leitura.',
          result: 'Encaminhamento para a rede protetiva.'
        },
        {
          id: 'act-8',
          date: todayStr,
          action: 'Ofício ao Conselho Tutelar',
          author: 'Direção Escolar',
          notes: 'Ofício nº 114/2026 protocolado junto ao Conselho Tutelar - Regional Sul.',
          result: 'Aguardando diligência do Conselho Tutelar.'
        }
      ]
    },
    {
      id: 'int-004',
      studentId: 'std-005',
      studentName: 'Enzo Rodrigues Souza',
      classId: '7B',
      className: '7º Ano B',
      guardianName: 'Valéria Souza',
      guardianPhone: '(11) 98112-9900',
      priority: 'media',
      stage: 'reintegrado',
      openedAt: '2026-08-20',
      lastUpdatedAt: todayStr,
      assignedPedagogue: 'Prof. Marcelo Tavares',
      reason: 'Faltas reiteradas devido a crise de asma e tratamento ambulatorial.',
      targetReturnDate: todayStr,
      resolvedDate: todayStr,
      actionPlan: [
        'Organização de Roteiro de Estudos Domiciliares para períodos de crise médica',
        'Autorização especial da junta pedagógica para abono mediante atestados médicos periódicos',
        'Monitoria de colegas de turma para compartilhamento de anotações'
      ],
      actionLog: [
        {
          id: 'act-9',
          date: '2026-08-20',
          action: 'Reunião Presencial com a Mãe',
          author: 'Prof. Marcelo Tavares',
          notes: 'Apresentados laudos médicos e histórico de internações.',
          result: 'Plano de apoio domiciliar homologado.'
        },
        {
          id: 'act-10',
          date: todayStr,
          action: 'Confirmação de Retorno Regular',
          author: 'Profª. Roberta Castro',
          notes: 'Enzo retornou às aulas presenciais hoje com excelente disposição e materiais em dia.',
          result: 'Caso com sucesso de reintegração.'
        }
      ]
    }
  ];

  const gateRecords: GateRecord[] = [
    {
      id: 'gate-001',
      studentId: 'std-002',
      studentName: 'Beatriz Vasconcelos Lima',
      classId: '7B',
      className: '7º Ano B',
      date: todayStr,
      time: '13:35',
      type: 'entrada_tardia',
      reason: 'Atraso no ônibus escolar municipal da linha rural',
      guardianOrAuthorizedPerson: 'Responsável legal comunicou via telefone',
      guardianPhone: '(11) 97654-1122',
      recordedBy: 'Agente de Organização Escolar (AOE)',
      notes: 'Encaminhada para a 2ª aula do turno da tarde.'
    },
    {
      id: 'gate-002',
      studentId: 'std-006',
      studentName: 'Camila Eduarda Duarte',
      classId: '9A',
      className: '9º Ano A',
      date: todayStr,
      time: '11:10',
      type: 'saida_antecipada',
      reason: 'Consulta médica emergencial na UBS',
      guardianOrAuthorizedPerson: 'Cristina Duarte (Mãe)',
      guardianPhone: '(11) 98455-6677',
      recordedBy: 'Agente de Organização Escolar (AOE)',
      notes: 'Mãe assinou termo de responsabilidade de saída antecipada.'
    }
  ];

  const users = generateDefaultUsers();

  return {
    schoolName: 'EE Professor Arlindo Silvestre',
    lastUpdated: new Date().toISOString(),
    classes,
    students,
    attendanceRecords,
    alerts,
    interventions,
    gateRecords,
    users,
  };
}

export function generateDefaultUsers(): UserAccount[] {
  return [
    {
      id: 'usr-admin',
      name: 'Administrador Geral',
      username: 'admin',
      role: 'admin',
      roleLabel: 'Administrador (Master)',
      pin: '1234',
      createdAt: '2026-01-15T08:00:00.000Z',
      active: true,
      notes: 'Perfil Master exclusivo com autoridade para determinar o perfil de cada usuário e gerenciar o banco de acessos.',
    },
    {
      id: 'usr-gestao',
      name: 'Profª. Silvana Rocha',
      username: 'silvana.rocha',
      role: 'gestao_paac',
      roleLabel: 'Gestão / PAAC',
      pin: '2026',
      createdAt: '2026-02-01T08:00:00.000Z',
      active: true,
      notes: 'Coordenação Pedagógica e PAAC. Acesso total a chamadas, relatórios pedagógicos, intervenções e Planilhas Google.',
    },
    {
      id: 'usr-aoe',
      name: 'Carlos Eduardo Mendes',
      username: 'carlos.mendes',
      role: 'aoe',
      roleLabel: 'AOE - Secretaria & Portaria',
      pin: '1010',
      createdAt: '2026-02-10T08:00:00.000Z',
      active: true,
      notes: 'Agente de Organização Escolar. Apenas lançamento de frequências e controle de portaria.',
    },
    {
      id: 'usr-professor',
      name: 'Prof. Rogério Silva',
      username: 'rogerio.silva',
      role: 'professor',
      roleLabel: 'Professor Regente',
      pin: '3344',
      createdAt: '2026-02-15T08:00:00.000Z',
      active: true,
      notes: 'Docente em sala de aula. Acesso estritamente restrito ao motivo das ausências e atestados da turma.',
    },
  ];
}

// Database helper functions
export class SchoolDatabase {
  private static instance: SchoolDatabase;
  private data: DatabaseSchema;

  private constructor() {
    this.data = this.loadDatabase();
  }

  public static getInstance(): SchoolDatabase {
    if (!SchoolDatabase.instance) {
      SchoolDatabase.instance = new SchoolDatabase();
    }
    return SchoolDatabase.instance;
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_PATH)) {
        const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed.students && parsed.classes) {
          parsed.schoolName = 'EE Professor Arlindo Silvestre';
          if (!parsed.gateRecords) {
            parsed.gateRecords = [];
          }
          if (!parsed.users || parsed.users.length === 0) {
            parsed.users = generateDefaultUsers();
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Erro ao ler banco de dados em disco, gerando dados iniciais...', e);
    }

    const seed = generateSeedData();
    this.saveToDisk(seed);
    return seed;
  }

  private saveToDisk(dataToSave: DatabaseSchema = this.data) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (e) {
      console.error('Erro ao salvar banco de dados em disco:', e);
    }
  }

  public getSchoolInfo() {
    const studentIds = new Set(this.data.students.map(s => s.id.toLowerCase()));
    const validAlerts = this.data.alerts.filter(a => studentIds.has((a.studentId || '').toLowerCase()));
    const validInterventions = this.data.interventions.filter(i => studentIds.has((i.studentId || '').toLowerCase()));
    return {
      schoolName: this.data.schoolName,
      lastUpdated: this.data.lastUpdated,
      totalStudents: this.data.students.length,
      totalClasses: this.data.classes.length,
      activeAlertsCount: validAlerts.length,
      activeCasesCount: validInterventions.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado').length
    };
  }

  // --- Gestão de Usuários & Perfis (Master Administrador) ---
  public getUsers(): UserAccount[] {
    if (!this.data.users || this.data.users.length === 0) {
      this.data.users = generateDefaultUsers();
      this.saveToDisk();
    }
    // Garantir que os nomes não contenham parênteses com perfis antigos
    let changed = false;
    this.data.users.forEach(u => {
      const clean = u.name.replace(/\s*\([^)]*\)/g, '').trim();
      if (clean !== u.name) {
        u.name = clean;
        changed = true;
      }
    });
    if (changed) {
      this.saveToDisk();
    }
    return this.data.users;
  }

  public getPublicUsers() {
    return this.getUsers().map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      roleLabel: u.roleLabel,
      active: u.active
    }));
  }

  public getUserById(id: string): UserAccount | undefined {
    return this.getUsers().find(u => u.id === id);
  }

  public createUser(userData: {
    name: string;
    username?: string;
    role: UserRole;
    pin: string;
    notes?: string;
  }): UserAccount {
    const cleanPin = String(userData.pin || '').trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error('A senha de acesso deve conter exatamente 4 dígitos numéricos.');
    }

    const cleanName = String(userData.name || '').trim();
    if (!cleanName) {
      throw new Error('O nome do usuário é obrigatório.');
    }

    const roleLabels: Record<UserRole, string> = {
      admin: 'Administrador (Master)',
      gestao_paac: 'Gestão / PAAC',
      aoe: 'AOE - Secretaria & Portaria',
      professor: 'Professor Regente',
    };

    const role = userData.role || 'professor';
    const id = `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const username = userData.username?.trim() || cleanName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.');

    const newUser: UserAccount = {
      id,
      name: cleanName,
      username,
      role,
      roleLabel: roleLabels[role] || role,
      pin: cleanPin,
      createdAt: new Date().toISOString(),
      active: true,
      notes: userData.notes?.trim() || '',
    };

    const users = this.getUsers();
    users.push(newUser);
    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return newUser;
  }

  public updateUser(
    id: string,
    updates: {
      name?: string;
      role?: UserRole;
      pin?: string;
      notes?: string;
      active?: boolean;
    }
  ): UserAccount {
    const users = this.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    if (updates.name !== undefined) {
      const cleanName = String(updates.name).trim();
      if (!cleanName) throw new Error('O nome não pode ficar em branco.');
      user.name = cleanName;
    }

    if (updates.role !== undefined) {
      const roleLabels: Record<UserRole, string> = {
        admin: 'Administrador (Master)',
        gestao_paac: 'Gestão / PAAC',
        aoe: 'AOE - Secretaria & Portaria',
        professor: 'Professor Regente',
      };
      // Impedir remover perfil de admin do usr-admin se não houver outro admin ativo
      if (user.id === 'usr-admin' && updates.role !== 'admin') {
        const otherAdmins = users.filter(u => u.id !== user.id && u.role === 'admin' && u.active);
        if (otherAdmins.length === 0) {
          throw new Error('Não é permitido remover o perfil de Administrador do perfil master principal sem outro administrador ativo.');
        }
      }
      user.role = updates.role;
      user.roleLabel = roleLabels[updates.role] || updates.role;
    }

    if (updates.pin !== undefined) {
      const cleanPin = String(updates.pin).trim();
      if (!/^\d{4}$/.test(cleanPin)) {
        throw new Error('A senha de acesso deve conter exatamente 4 dígitos numéricos.');
      }
      user.pin = cleanPin;
    }

    if (updates.notes !== undefined) {
      user.notes = updates.notes;
    }

    if (updates.active !== undefined) {
      if (user.id === 'usr-admin' && !updates.active) {
        throw new Error('O Administrador Master principal não pode ser desativado.');
      }
      user.active = updates.active;
    }

    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return user;
  }

  public deleteUser(id: string): boolean {
    const users = this.getUsers();
    if (id === 'usr-admin') {
      throw new Error('O Administrador Master principal não pode ser excluído.');
    }

    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users.splice(index, 1);
      this.data.lastUpdated = new Date().toISOString();
      this.saveToDisk();
    }
    return true;
  }

  public verifyLoginPin(userId: string, pin: string) {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) {
      throw new Error('Usuário não selecionado ou inexistente no banco de dados.');
    }

    if (user.active === false) {
      throw new Error('Este usuário está desativado pelo Administrador.');
    }

    const cleanPin = String(pin || '').trim();
    if (user.pin !== cleanPin) {
      throw new Error('Senha numérica de 4 dígitos incorreta.');
    }

    user.lastLogin = new Date().toISOString();
    this.saveToDisk();

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      roleLabel: user.roleLabel,
    };
  }

  public getClasses(): SchoolClass[] {
    const currentToday = new Date().toISOString().split('T')[0];
    const updated = this.data.classes.map(cls => {
      const classStudents = this.data.students.filter(s => s.classId === cls.id);
      const totalStudents = classStudents.length;
      const atRisk = classStudents.filter(s => s.riskLevel === 'alto' || s.riskLevel === 'critico').length;
      
      const todayRecords = this.data.attendanceRecords.filter(r => r.classId === cls.id && r.date === currentToday);
      let presentToday = 0;
      let absentToday = 0;

      if (todayRecords.length > 0) {
        presentToday = todayRecords.filter(r => r.status === 'presente').length;
        absentToday = todayRecords.filter(r => r.status.startsWith('falta')).length;
      } else {
        presentToday = 0;
        absentToday = 0;
      }

      const totalCounted = presentToday + absentToday || totalStudents || 0;
      const attendanceRateToday = totalCounted > 0
        ? Number(((presentToday / totalCounted) * 100).toFixed(1))
        : 100;

      return {
        ...cls,
        totalStudents,
        presentToday,
        absentToday,
        attendanceRateToday,
        studentsAtRiskCount: atRisk,
      };
    });

    return updated;
  }

  public getStudents(filters?: { classId?: string; riskLevel?: string; status?: string; search?: string }): Student[] {
    let result = [...this.data.students];

    if (filters?.classId && filters.classId !== 'todas') {
      result = result.filter(s => s.classId === filters.classId);
    }

    if (filters?.riskLevel && filters.riskLevel !== 'todos') {
      result = result.filter(s => s.riskLevel === filters.riskLevel);
    }

    if (filters?.status && filters.status !== 'todos') {
      result = result.filter(s => s.status === filters.status);
    }

    if (filters?.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.ra.toLowerCase().includes(q) ||
        s.guardianName.toLowerCase().includes(q) ||
        s.neighborhood.toLowerCase().includes(q)
      );
    }

    return result;
  }

  public getStudentById(id: string): { student: Student; attendanceHistory: AttendanceRecord[]; alerts: ParentAlert[]; intervention?: InterventionCase } | null {
    const student = this.data.students.find(s => s.id === id);
    if (!student) return null;

    const attendanceHistory = this.data.attendanceRecords
      .filter(r => r.studentId === id)
      .sort((a, b) => b.date.localeCompare(a.date));

    const alerts = this.data.alerts
      .filter(a => a.studentId === id)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

    const intervention = this.data.interventions.find(i => i.studentId === id);

    return { student, attendanceHistory, alerts, intervention };
  }

  public getAttendanceRecords(filter?: { classId?: string; date?: string; studentId?: string }): AttendanceRecord[] {
    let records = [...this.data.attendanceRecords];
    if (filter?.classId) records = records.filter(r => r.classId === filter.classId);
    if (filter?.date) records = records.filter(r => r.date === filter.date);
    if (filter?.studentId) records = records.filter(r => r.studentId === filter.studentId);
    return records.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }

  public recordBatchAttendance(
    items: {
      studentId: string;
      status: AttendanceStatus;
      durationDays?: number;
      justification?: string;
      medicalCertificate?: string;
      medicalDays?: number;
    }[],
    classId: string,
    recordedBy: string,
    date?: string
  ): { recordedCount: number; newAlerts: ParentAlert[] } {
    const newAlerts: ParentAlert[] = [];
    const timestamp = new Date().toISOString();
    const recordDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr;

    // Se a turma foi lançada sem alunos cadastrados ou lista vazia, registra marcador da turma
    if (items.length === 0 && classId) {
      const existingClass = this.data.classes.find(c => c.id === classId || c.name === classId);
      const markerRecord: AttendanceRecord = {
        id: `att-cls-${classId}-${recordDate}`,
        studentId: `cls-marker-${classId}`,
        studentName: `Turma ${existingClass?.name || classId} (Chamada Concluída)`,
        classId,
        className: existingClass?.name || classId,
        date: recordDate,
        status: 'presente',
        durationDays: 1,
        isCountedAsAbsence: false,
        recordedBy: recordedBy || 'AOE / Professor',
        recordedAt: timestamp,
      };
      this.data.attendanceRecords = this.data.attendanceRecords.filter(
        r => !(r.classId === classId && r.date === recordDate && r.studentId === markerRecord.studentId)
      );
      this.data.attendanceRecords.push(markerRecord);
    }

    items.forEach(item => {
      const student = this.data.students.find(s => s.id === item.studentId);
      const studentName = student ? student.name : (item as any).studentName || 'Estudante';
      const targetClassId = classId || (student ? student.classId : '');
      const targetClassName = student ? student.className : (item as any).className || '';

      const isCountedAsAbsence = item.status === 'falta_injustificada' || item.status === 'falta_justificada';
      const duration = item.medicalDays || (item.durationDays && item.durationDays > 1 ? item.durationDays : 1);

      if (item.status === 'atestado_medico') {
        const validDays = Math.max(1, duration);
        const endDate = addDaysToDateStr(recordDate, validDays - 1);

        for (let i = 0; i < validDays; i++) {
          const recDate = addDaysToDateStr(recordDate, i);
          const curDay = i + 1;
          const remDays = validDays - curDay;
          const infoText = remDays === 0
            ? `Dia ${curDay} de ${validDays} • Último dia de atestado (conclui hoje)`
            : remDays === 1
            ? `Dia ${curDay} de ${validDays} • Resta 1 dia para finalizar o atestado`
            : `Dia ${curDay} de ${validDays} • Faltam ${remDays} dias para finalizar o atestado`;

          // Remove existing record for that student on recDate
          this.data.attendanceRecords = this.data.attendanceRecords.filter(
            r => !(r.studentId === item.studentId && r.date === recDate)
          );

          this.data.attendanceRecords.push({
            id: `att-med-${item.studentId}-${recDate}`,
            studentId: item.studentId,
            studentName,
            classId: targetClassId,
            className: targetClassName,
            date: recDate,
            status: 'atestado_medico',
            durationDays: validDays,
            medicalDays: validDays,
            medicalDayCurrent: curDay,
            medicalDaysRemaining: remDays,
            medicalStartDate: recordDate,
            medicalEndDate: endDate,
            justification: item.justification || `Atestado Médico de ${validDays} dia(s) (${infoText})`,
            medicalCertificate: `${validDays} dia(s) de atestado • ${infoText}`,
            isCountedAsAbsence: false,
            recordedBy: recordedBy || 'AOE / Professor',
            recordedAt: timestamp,
          });
        }
      } else if (item.status === 'falta_justificada' && duration > 1) {
        const validDays = Math.max(1, duration);
        const endDate = addDaysToDateStr(recordDate, validDays - 1);
        const baseJust = item.justification?.trim() || 'Comunicação familiar prévia homologada';

        for (let i = 0; i < validDays; i++) {
          const recDate = addDaysToDateStr(recordDate, i);
          const curDay = i + 1;
          const remDays = validDays - curDay;
          const infoText = remDays === 0
            ? `Dia ${curDay} de ${validDays} • Último dia justificado (conclui hoje)`
            : remDays === 1
            ? `Dia ${curDay} de ${validDays} • Resta 1 dia de ausência justificada`
            : `Dia ${curDay} de ${validDays} • Faltam ${remDays} dias para finalizar a justificativa`;

          // Remove existing record for that student on recDate
          this.data.attendanceRecords = this.data.attendanceRecords.filter(
            r => !(r.studentId === item.studentId && r.date === recDate)
          );

          this.data.attendanceRecords.push({
            id: `att-just-${item.studentId}-${recDate}`,
            studentId: item.studentId,
            studentName,
            classId: targetClassId,
            className: targetClassName,
            date: recDate,
            status: 'falta_justificada',
            durationDays: validDays,
            justificationDays: validDays,
            justificationDayCurrent: curDay,
            justificationDaysRemaining: remDays,
            justificationStartDate: recordDate,
            justificationEndDate: endDate,
            justification: `${baseJust} • ${infoText}`,
            isCountedAsAbsence: true,
            recordedBy: recordedBy || 'AOE / Professor',
            recordedAt: timestamp,
          });
        }
      } else {
        // Remove existing record for same day & student if any
        this.data.attendanceRecords = this.data.attendanceRecords.filter(
          r => !(r.studentId === item.studentId && r.date === recordDate)
        );

        const record: AttendanceRecord = {
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          studentId: item.studentId,
          studentName,
          classId: targetClassId,
          className: targetClassName,
          date: recordDate,
          status: item.status,
          durationDays: duration,
          justificationDays: item.status === 'falta_justificada' ? duration : undefined,
          justificationDayCurrent: item.status === 'falta_justificada' ? 1 : undefined,
          justificationDaysRemaining: item.status === 'falta_justificada' ? 0 : undefined,
          justification: item.justification,
          medicalCertificate: item.medicalCertificate,
          medicalDays: item.medicalDays,
          isCountedAsAbsence,
          recordedBy: recordedBy || 'AOE / Professor',
          recordedAt: timestamp,
        };
        this.data.attendanceRecords.push(record);
      }

      if (student) {
        // Recalculate student stats:
        // - presente: reset consecutive absences
        // - falta_justificada: retains absence count ("mas sem retirar a contagem da falta")
        // - falta_injustificada: counts absence
        // - atestado_medico: does NOT count absence ("onde não contabiliza a ausência")
        if (item.status === 'presente') {
          student.consecutiveAbsences = 0;
          student.lastAttendanceDate = recordDate;
          if (student.status === 'alerta' && student.consecutiveAbsences === 0) {
            student.status = 'regular';
            student.riskLevel = 'moderado';
          }
        } else if (item.status === 'atestado_medico') {
          // Atestado médico ampara o aluno: NÃO contabiliza como falta nem penaliza índice
          const diasAtestado = item.medicalDays || duration;
          const docInfo = item.medicalCertificate || `${diasAtestado} dia(s) de atestado médico`;
          student.notes = student.notes
            ? `${student.notes} | Atestado médico (${recordDate} - ${diasAtestado} dias): ${docInfo}`
            : `Atestado médico (${recordDate} - ${diasAtestado} dias): ${docInfo}`;
        }

        // Recalcula totais reais do estudante a partir de todos os seus registros
        const studentHistory = this.data.attendanceRecords
          .filter(r => r.studentId === student.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const absenceRecs = studentHistory.filter(
          r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
        );
        student.totalAbsences = absenceRecs.reduce((acc, r) => acc + (r.durationDays || 1), 0);

        let consAbs = 0;
        for (const r of studentHistory) {
          if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
            consAbs += (r.durationDays || 1);
          } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
            break;
          }
        }
        student.consecutiveAbsences = consAbs;

        const lastPresRec = studentHistory.find(r => r.status === 'presente' || (r.status as any) === 'atraso');
        if (lastPresRec) {
          student.lastAttendanceDate = lastPresRec.date;
        }

        // Recompute rate
        student.attendanceRate = Number((((student.totalSchoolDays - student.totalAbsences) / student.totalSchoolDays) * 100).toFixed(1));

        // Automated Alert Triggers (EXCLUSIVAMENTE para ausências injustificadas)
        if (item.status === 'falta_injustificada') {
          let shouldAlert = false;
          let triggerReason: AlertTrigger = 'alerta_manual';
          let triggerLabel = '';
          let alertMessage = '';

          if (student.consecutiveAbsences > 3) {
            shouldAlert = true;
            triggerReason = 'mais_de_3_conselho_tutelar';
            triggerLabel = `Mais de 3 faltas consecutivas (${student.consecutiveAbsences} dias) - Encaminhamento Conselho Tutelar`;
            student.riskLevel = 'critico';
            student.status = 'evasao_iminente';
            alertMessage = `NOTIFICAÇÃO URGENTE - Escola Arlindo Silvestre: Prezado(a) ${student.guardianName}, o(a) estudante ${student.name} (${student.className}) ultrapassou o limite legal com ${student.consecutiveAbsences} faltas consecutivas. Conforme prevê a legislação educacional e o ECA, caso a situação não seja justificada presencialmente na escola de imediato, o caso será encaminhado formalmente ao Conselho Tutelar.`;
          } else if (student.consecutiveAbsences === 3) {
            shouldAlert = true;
            triggerReason = '3_faltas_consecutivas';
            triggerLabel = '3 faltas consecutivas detectadas';
            student.riskLevel = 'alto';
            student.status = 'alerta';
            alertMessage = `Alerta de Infrequência - Escola Arlindo Silvestre: Prezado(a) ${student.guardianName}, informamos que o(a) estudante ${student.name} (${student.className}) registrou a 3ª falta consecutiva hoje (${new Date(recordDate + 'T12:00:00').toLocaleDateString('pt-BR')}). Solicitamos contato urgente ou comparecimento à escola para justificativa e acompanhamento pedagógico.`;
          } else if (student.consecutiveAbsences === 2) {
          shouldAlert = true;
          triggerReason = '2_faltas_consecutivas';
          triggerLabel = '2 faltas consecutivas detectadas';
          student.riskLevel = 'moderado';
          alertMessage = `Aviso Escolar - Escola Arlindo Silvestre: Prezado(a) ${student.guardianName}, o(a) estudante ${student.name} (${student.className}) registrou sua 2ª falta consecutiva. Pedimos atenção para que a rotina escolar não seja prejudicada. Em caso de dúvidas ou necessidade de apoio, contate a escola.`;
        } else if (student.attendanceRate < 75) {
          shouldAlert = true;
          triggerReason = 'frequencia_abaixo_75';
          triggerLabel = `Frequência acumulada abaixo de 75% (${student.attendanceRate}%)`;
          student.riskLevel = 'critico';
          student.status = 'evasao_iminente';
          alertMessage = `URGENTE - Escola Arlindo Silvestre: Prezado(a) ${student.guardianName}, o(a) estudante ${student.name} atingiu a marca de ${student.attendanceRate}% de frequência acumulada, ficando abaixo do mínimo de 75% previsto pela LDB. Convocamos a família para comparecer à escola para plano de regularização.`;
        } else if (student.totalAbsences >= 5 && student.consecutiveAbsences <= 1) {
          shouldAlert = true;
          triggerReason = 'dias_alternados_baixa_frequencia';
          triggerLabel = `Faltas frequentes em dias alternados (${student.totalAbsences} faltas)`;
          student.riskLevel = 'alto';
          alertMessage = `Acompanhamento de Frequência - Escola Arlindo Silvestre: Prezado(a) ${student.guardianName}, identificamos faltas alternadas frequentes do(a) estudante ${student.name} (${student.className}), somando ${student.totalAbsences} ausências. A frequência regular é essencial para a aprendizagem. Entre em contato conosco.`;
        } else if (student.consecutiveAbsences === 1) {
          shouldAlert = true;
          triggerReason = '1_falta';
          triggerLabel = '1ª falta registrada';
          alertMessage = `Aviso do Dia - Escola Arlindo Silvestre: Prezado(a) ${student.guardianName}, informamos que o(a) estudante ${student.name} (${student.className}) faltou às aulas hoje (${new Date(recordDate + 'T12:00:00').toLocaleDateString('pt-BR')}). Caso haja motivo justificado, favor comunicar a secretaria.`;
        }

        if (shouldAlert) {
          // Prevent duplicate alert on the exact same date
          const alreadyAlertedToday = this.data.alerts.some(
            a => a.studentId === student.id && a.sentAt.startsWith(recordDate)
          );

          if (!alreadyAlertedToday) {
            const newAlert: ParentAlert = {
              id: `alt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              studentId: student.id,
              studentName: student.name,
              classId: student.classId,
              className: student.className,
              guardianName: student.guardianName,
              guardianPhone: student.guardianPhone,
              channel: 'whatsapp',
              triggerReason,
              triggerLabel,
              messageContent: alertMessage,
              status: 'enviado',
              sentAt: timestamp,
              autoGenerated: true,
            };

            this.data.alerts.unshift(newAlert);
            newAlerts.push(newAlert);

            // Auto-enroll in Busca Ativa intervention if not already enrolled and consecutive absences >= 3
            if (!student.activeInterventionId && student.consecutiveAbsences >= 3) {
              const interventionId = `int-${Date.now()}`;
              student.activeInterventionId = interventionId;
              const newCase: InterventionCase = {
                id: interventionId,
                studentId: student.id,
                studentName: student.name,
                classId: student.classId,
                className: student.className,
                guardianName: student.guardianName,
                guardianPhone: student.guardianPhone,
                priority: student.consecutiveAbsences >= 4 ? 'urgente_conselho' : 'alta',
                stage: 'alerta_inicial',
                openedAt: recordDate,
                lastUpdatedAt: recordDate,
                assignedPedagogue: 'Equipe de Orientação Pedagógica / PAAC',
                reason: `Gatilho automático: ${student.consecutiveAbsences} faltas consecutivas. Taxa de frequência: ${student.attendanceRate}%.`,
                actionPlan: [
                  'Confirmar recebimento do alerta pelo responsável via WhatsApp',
                  'Caso não haja resposta em 24h, realizar ligação direta',
                  'Agendar atendimento presencial para plano de reposição'
                ],
                actionLog: [
                  {
                    id: `act-${Date.now()}`,
                    date: recordDate,
                    action: 'Disparo Automático de Alerta Busca Ativa',
                    author: recordedBy || 'Sistema Integrado de Frequência',
                    notes: `Alerta automático emitido aos responsáveis (${student.guardianName}) via WhatsApp.`,
                    result: 'Aguardando confirmação do responsável.'
                  }
                ]
              };
              this.data.interventions.unshift(newCase);
            }
          }
        }
      }
    }
    });

    this.data.lastUpdated = timestamp;
    this.saveToDisk();

    return { recordedCount: items.length, newAlerts };
  }

  public deleteAttendanceByDate(dateStr: string, classId?: string): { deletedCount: number } {
    if (!dateStr) return { deletedCount: 0 };
    const beforeCount = this.data.attendanceRecords.length;
    const affectedStudentIds = new Set<string>();

    this.data.attendanceRecords = this.data.attendanceRecords.filter(r => {
      const isMatchDate = r.date === dateStr || (r.date && r.date.startsWith(dateStr)) || r.id.includes(dateStr);
      if (!isMatchDate) return true;
      if (classId) {
        const cleanClass = classId.trim().toLowerCase();
        const rCId = (r.classId || '').trim().toLowerCase();
        const rCName = (r.className || '').trim().toLowerCase();
        const isMatchClass = rCId === cleanClass || rCName === cleanClass || r.id.toLowerCase().includes(cleanClass);
        if (!isMatchClass) return true;
      }
      affectedStudentIds.add(r.studentId);
      return false; // remove
    });

    const deletedCount = beforeCount - this.data.attendanceRecords.length;

    // Recalcula totais para os estudantes afetados
    affectedStudentIds.forEach(studentId => {
      const student = this.data.students.find(s => s.id === studentId);
      if (student) {
        const studentHistory = this.data.attendanceRecords
          .filter(r => r.studentId === student.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const absenceRecs = studentHistory.filter(
          r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
        );
        student.totalAbsences = absenceRecs.reduce((acc, r) => acc + (r.durationDays || 1), 0);

        let consAbs = 0;
        for (const r of studentHistory) {
          if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
            consAbs += (r.durationDays || 1);
          } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
            break;
          }
        }
        student.consecutiveAbsences = consAbs;

        const lastPresRec = studentHistory.find(r => r.status === 'presente' || (r.status as any) === 'atraso');
        if (lastPresRec) {
          student.lastAttendanceDate = lastPresRec.date;
        }

        student.attendanceRate = Number((((student.totalSchoolDays - student.totalAbsences) / student.totalSchoolDays) * 100).toFixed(1));
      }
    });

    this.saveToDisk();
    return { deletedCount };
  }

  public getGateRecords(filters?: { date?: string; classId?: string }): GateRecord[] {
    let records = this.data.gateRecords || [];
    if (filters?.date) {
      records = records.filter(r => r.date === filters.date);
    }
    if (filters?.classId && filters.classId !== 'todas') {
      records = records.filter(r => r.classId === filters.classId);
    }
    return [...records].sort((a, b) => b.time.localeCompare(a.time));
  }

  public createGateRecord(input: Omit<GateRecord, 'id'>): GateRecord {
    if (!this.data.gateRecords) this.data.gateRecords = [];
    const newRecord: GateRecord = {
      id: `gate-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ...input,
    };
    this.data.gateRecords.unshift(newRecord);
    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return newRecord;
  }

  public deleteGateRecord(id: string): boolean {
    if (!this.data.gateRecords) return false;
    const initialLen = this.data.gateRecords.length;
    this.data.gateRecords = this.data.gateRecords.filter(r => r.id !== id);
    if (this.data.gateRecords.length !== initialLen) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  public getSeducContingencyReport(date: string, classId?: string) {
    const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr;
    let targetClasses = this.getClasses();
    if (classId && classId !== 'todas') {
      targetClasses = targetClasses.filter(c => c.id === classId);
    }

    const records = this.data.attendanceRecords.filter(r => r.date === targetDate);
    const gateRecordsToday = (this.data.gateRecords || []).filter(g => g.date === targetDate);

    const classReports = targetClasses.map(cls => {
      const classStudents = this.data.students.filter(s => s.classId === cls.id);
      const classAttendance = records.filter(r => r.classId === cls.id);
      const classGate = gateRecordsToday.filter(g => g.classId === cls.id);

      const studentsDetailed = classStudents.map(student => {
        const att = classAttendance.find(r => r.studentId === student.id);
        const gate = classGate.find(g => g.studentId === student.id);

        let status: AttendanceStatus = att
          ? att.status
          : (student.consecutiveAbsences >= 3 ? 'falta_injustificada' : 'presente');
        let justification = att?.justification || '';
        let medicalCertificate = att?.medicalCertificate || '';

        const isAbsent = status === 'falta_injustificada' || status === 'falta_justificada' || status === 'atestado_medico';
        const isCountedAsAbsence = status === 'falta_injustificada' || status === 'falta_justificada';

        return {
          id: student.id,
          name: student.name,
          ra: student.ra,
          status,
          isAbsent,
          isCountedAsAbsence,
          justification,
          medicalCertificate,
          consecutiveAbsences: student.consecutiveAbsences,
          totalAbsences: student.totalAbsences,
          attendanceRate: student.attendanceRate,
          guardianName: student.guardianName,
          guardianPhone: student.guardianPhone,
          gateRecord: gate ? { type: gate.type, time: gate.time, reason: gate.reason } : null,
        };
      });

      const totalEnrolled = classStudents.length;
      const presentCount = studentsDetailed.filter(s => s.status === 'presente').length;
      const faltaJustificadaCount = studentsDetailed.filter(s => s.status === 'falta_justificada').length;
      const faltaInjustificadaCount = studentsDetailed.filter(s => s.status === 'falta_injustificada').length;
      const atestadoMedicoCount = studentsDetailed.filter(s => s.status === 'atestado_medico').length;
      const atrasoCount = studentsDetailed.filter(s => s.status === 'atraso' || s.gateRecord?.type === 'entrada_tardia').length;

      return {
        classId: cls.id,
        className: cls.name,
        shift: cls.shift,
        grade: cls.grade,
        totalEnrolled,
        presentCount,
        faltaJustificadaCount,
        faltaInjustificadaCount,
        atestadoMedicoCount,
        atrasoCount,
        attendanceRate: totalEnrolled > 0 ? Number(((presentCount / totalEnrolled) * 100).toFixed(1)) : 100,
        absentStudents: studentsDetailed.filter(s => s.isAbsent || s.status === 'atraso'),
        allStudents: studentsDetailed,
      };
    });

    const totalStudents = classReports.reduce((acc, c) => acc + c.totalEnrolled, 0);
    const totalPresent = classReports.reduce((acc, c) => acc + c.presentCount, 0);
    const totalFaltaJustificada = classReports.reduce((acc, c) => acc + c.faltaJustificadaCount, 0);
    const totalFaltaInjustificada = classReports.reduce((acc, c) => acc + c.faltaInjustificadaCount, 0);
    const totalAtestados = classReports.reduce((acc, c) => acc + c.atestadoMedicoCount, 0);
    const totalAtrasos = classReports.reduce((acc, c) => acc + c.atrasoCount, 0);

    return {
      schoolName: this.data.schoolName,
      officialHeader: 'Governo do Estado de São Paulo - Secretaria da Educação do Estado (SEDUC)',
      subHeader: 'Diretoria de Ensino - EE Professor Arlindo Silvestre',
      reportTitle: 'Relatório Diário de Ausências e Frequência por Turma (Contingência SEDUC)',
      date: targetDate,
      formattedDate: new Date(targetDate + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      summary: {
        totalStudents,
        totalPresent,
        totalFaltaJustificada,
        totalFaltaInjustificada,
        totalAtestados,
        totalAtrasos,
        overallAttendanceRate: totalStudents > 0 ? Number(((totalPresent / totalStudents) * 100).toFixed(1)) : 100,
      },
      classReports,
    };
  }

  public getAlerts(): ParentAlert[] {
    return [...this.data.alerts].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }

  public sendManualAlert(alertInput: {
    studentId: string;
    channel: 'whatsapp' | 'sms' | 'ligacao' | 'notificacao_push';
    messageContent: string;
    triggerReason?: AlertTrigger;
    triggerLabel?: string;
  }): ParentAlert {
    const student = this.data.students.find(s => s.id === alertInput.studentId);
    if (!student) throw new Error('Estudante não encontrado');

    const newAlert: ParentAlert = {
      id: `alt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      studentId: student.id,
      studentName: student.name,
      classId: student.classId,
      className: student.className,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      channel: alertInput.channel,
      triggerReason: alertInput.triggerReason || 'alerta_manual',
      triggerLabel: alertInput.triggerLabel || 'Alerta Manual Pedagógico',
      messageContent: alertInput.messageContent,
      status: 'enviado',
      sentAt: new Date().toISOString(),
      autoGenerated: false,
    };

    this.data.alerts.unshift(newAlert);
    this.saveToDisk();
    return newAlert;
  }

  public updateAlertStatus(alertId: string, status: 'enviado' | 'entregue' | 'lido' | 'respondido' | 'falha', feedback?: string) {
    const alert = this.data.alerts.find(a => a.id === alertId);
    if (!alert) return null;

    alert.status = status;
    if (feedback) alert.guardianFeedback = feedback;
    if (status === 'lido' && !alert.readAt) alert.readAt = new Date().toISOString();

    this.saveToDisk();
    return alert;
  }

  public getInterventions(): InterventionCase[] {
    const studentIds = new Set(this.data.students.map(s => (s.id || '').trim().toLowerCase()));
    return this.data.interventions
      .filter(i => studentIds.has((i.studentId || '').trim().toLowerCase()))
      .sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
  }

  public getInterventionById(id: string): InterventionCase | null {
    return this.data.interventions.find(i => i.id === id) || null;
  }

  public deleteIntervention(id: string): boolean {
    const cleanId = String(id || '').trim().toLowerCase();
    const initialLen = this.data.interventions.length;
    this.data.interventions = this.data.interventions.filter(i => (i.id || '').trim().toLowerCase() !== cleanId);
    if (this.data.interventions.length === initialLen) return false;
    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public deleteOpenInterventions(): boolean {
    const initialLen = this.data.interventions.length;
    this.data.interventions = this.data.interventions.filter(
      i => i.stage === 'reintegrado' || i.stage === 'encerrado'
    );
    if (this.data.interventions.length === initialLen) return false;
    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public saveIntervention(intervention: Partial<InterventionCase> & { studentId: string }): InterventionCase {
    const existingIndex = this.data.interventions.findIndex(i => i.id === intervention.id || (intervention.studentId && i.studentId === intervention.studentId));
    const now = new Date().toISOString().split('T')[0];
    const student = this.data.students.find(s => s.id === intervention.studentId);

    if (existingIndex >= 0) {
      const existing = this.data.interventions[existingIndex];
      const updated: InterventionCase = {
        ...existing,
        ...intervention,
        lastUpdatedAt: now,
        actionLog: intervention.actionLog || existing.actionLog,
        actionPlan: intervention.actionPlan || existing.actionPlan,
      };

      if (updated.stage === 'reintegrado' && !updated.resolvedDate) {
        updated.resolvedDate = now;
        if (student) {
          student.status = 'reintegrado';
          student.riskLevel = 'moderado';
        }
      }

      this.data.interventions[existingIndex] = updated;
      this.saveToDisk();
      return updated;
    } else {
      if (!student) throw new Error('Estudante não encontrado para novo caso de busca ativa');

      const newCase: InterventionCase = {
        id: intervention.id || `int-${Date.now()}`,
        studentId: student.id,
        studentName: student.name,
        classId: student.classId,
        className: student.className,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        priority: intervention.priority || 'alta',
        stage: intervention.stage || 'alerta_inicial',
        openedAt: now,
        lastUpdatedAt: now,
        assignedPedagogue: intervention.assignedPedagogue || 'Equipe de Orientação Pedagógica',
        reason: intervention.reason || 'Identificação de evasão ou infrequência crítica.',
        actionPlan: intervention.actionPlan || [
          'Visita domiciliar ou contato de acolhimento',
          'Pacto pedagógico com responsáveis',
          'Monitoramento semanal de frequência'
        ],
        actionLog: intervention.actionLog || [
          {
            id: `act-${Date.now()}`,
            date: now,
            action: 'Instauração de Busca Ativa',
            author: intervention.assignedPedagogue || 'Coordenação',
            notes: 'Caso aberto manualmente pela equipe escolar.',
            result: 'Aguardando intervenção.'
          }
        ]
      };

      student.activeInterventionId = newCase.id;
      student.status = 'em_busca_ativa';
      this.data.interventions.unshift(newCase);
      this.saveToDisk();
      return newCase;
    }
  }

  public addInterventionAction(interventionId: string, action: { action: string; author: string; notes: string; result: string; advanceStageTo?: any }) {
    const intervention = this.data.interventions.find(i => i.id === interventionId);
    if (!intervention) throw new Error('Intervenção não encontrada');

    const now = new Date().toISOString().split('T')[0];
    const newLogItem = {
      id: `act-${Date.now()}`,
      date: now,
      action: action.action,
      author: action.author,
      notes: action.notes,
      result: action.result,
    };

    intervention.actionLog.unshift(newLogItem);
    intervention.lastUpdatedAt = now;
    if (action.advanceStageTo) {
      intervention.stage = action.advanceStageTo;
      if (action.advanceStageTo === 'reintegrado') {
        intervention.resolvedDate = now;
        const student = this.data.students.find(s => s.id === intervention.studentId);
        if (student) {
          student.status = 'reintegrado';
          student.consecutiveAbsences = 0;
          student.riskLevel = 'moderado';
        }
      }
    }

    this.saveToDisk();
    return intervention;
  }

  public getMonthlyReport(monthIndex: number = 9, year: number = 2026, startDate?: string, endDate?: string): MonthlyPedagogicalReport {
    const students = this.data.students;
    const totalEnrolled = students.length;
    const sDate = startDate || (endDate ? endDate : '');
    const eDate = endDate || (startDate ? startDate : '');

    let periodRecords = this.data.attendanceRecords;
    if (sDate && eDate) {
      periodRecords = periodRecords.filter(r => {
        const d = r.date ? r.date.split('T')[0] : '';
        return d >= sDate && d <= eDate;
      });
    }

    const studentRecords = periodRecords.filter(r => !r.studentId?.startsWith('cls-marker-'));
    const totalPresencas = studentRecords.filter(r => r.status === 'presente' || (r.status as any) === 'atraso').length;
    const totalFaltas = studentRecords.filter(r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico').length;
    const totalEvaluated = totalPresencas + totalFaltas;

    const avgAttendance = totalEvaluated > 0
      ? Number(((totalPresencas / totalEvaluated) * 100).toFixed(1))
      : Number((students.reduce((acc, s) => acc + s.attendanceRate, 0) / (totalEnrolled || 1)).toFixed(1));

    const totalAbsences = totalFaltas > 0 ? totalFaltas : students.reduce((acc, s) => acc + s.totalAbsences, 0);
    const studentsWithCriticalAbsence = students.filter(s => s.attendanceRate < 75 || s.riskLevel === 'critico').length;
    const activeSearchCases = this.data.interventions;
    const successfulReintegrations = activeSearchCases.filter(i => i.stage === 'reintegrado' || i.stage === 'encerrado').length;

    let periodAlerts = this.data.alerts;
    if (sDate && eDate) {
      const filteredA = periodAlerts.filter(a => {
        const d = a.sentAt ? a.sentAt.split('T')[0] : '';
        return d >= sDate && d <= eDate;
      });
      if (filteredA.length > 0) periodAlerts = filteredA;
    }
    const alertsDispatched = periodAlerts.length;
    const alertsResponded = periodAlerts.filter(a => a.status === 'respondido' || a.guardianFeedback).length;

    const absenceCauses = [
      { cause: 'Trabalho infantil / Apoio à renda familiar', count: 4, percentage: 33 },
      { cause: 'Dificuldade de transporte / Mobilidade', count: 3, percentage: 25 },
      { cause: 'Problemas de saúde / Cuidados familiares', count: 2, percentage: 17 },
      { cause: 'Desmotivação e defasagem idade-ano', count: 2, percentage: 17 },
      { cause: 'Conflitos interpessoais / Clima escolar', count: 1, percentage: 8 },
    ];

    const riskByClass = this.data.classes.map(c => {
      const classStudents = students.filter(s => s.classId === c.id);
      const cRecords = studentRecords.filter(r => r.classId === c.id || classStudents.some(s => s.id === r.studentId));
      const cp = cRecords.filter(r => r.status === 'presente' || (r.status as any) === 'atraso').length;
      const cf = cRecords.filter(r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico').length;
      const classAvg = cp + cf > 0
        ? Number(((cp / (cp + cf)) * 100).toFixed(1))
        : (classStudents.length > 0
          ? Number((classStudents.reduce((acc, s) => acc + s.attendanceRate, 0) / classStudents.length).toFixed(1))
          : 90);
      const riskCount = classStudents.filter(s => s.riskLevel === 'alto' || s.riskLevel === 'critico').length;
      return {
        classId: c.id,
        className: c.name,
        averageAttendance: classAvg,
        riskStudents: riskCount,
        totalStudents: classStudents.length,
      };
    });

    const attendanceTrend = [
      { week: 'Semana 1', rate: 91.2, absences: 28 },
      { week: 'Semana 2', rate: 89.5, absences: 34 },
      { week: 'Semana 3', rate: 86.8, absences: 42 },
      { week: 'Semana 4 (Atual)', rate: avgAttendance, absences: totalAbsences },
    ];

    const pedagogicalInsights = [
      `A taxa média de frequência global encontra-se em ${avgAttendance}%, com dados consolidados da rotina escolar.`,
      `Foram identificados ${studentsWithCriticalAbsence} estudantes em situação crítica de infrequência com risco de abandono escolar imediato.`,
      `O principal fator de evasão registrado no período foi o trabalho informal/apoio familiar (33%), seguido pela barreira de transporte em dias chuvosos (25%).`,
      `O sistema de alertas automáticos aos responsáveis obteve taxa de retorno de ${Number(((alertsResponded / (alertsDispatched || 1)) * 100).toFixed(0))}%, viabilizando ${successfulReintegrations} reintegrações pedagógicas com sucesso.`,
      `Recomenda-se intensificar a articulação intersetorial com o CRAS e o Conselho Tutelar para os casos em estágio crítico de infrequência.`
    ];

    return {
      month: 'Setembro',
      monthIndex,
      year,
      totalEnrolled,
      averageAttendanceRate: avgAttendance,
      totalAbsences,
      studentsWithCriticalAbsence,
      activeSearchCasesCount: activeSearchCases.length,
      successfulReintegrations,
      alertsDispatched,
      alertsResponded,
      absenceCausesDistribution: absenceCauses,
      riskByClass,
      attendanceTrend,
      pedagogicalInsights,
    };
  }

  public createStudent(input: Partial<Student>): Student {
    if (!input.name || !input.classId) {
      throw new Error('Nome do estudante e Turma são obrigatórios');
    }

    const cls = this.data.classes.find(c => c.id === input.classId);
    const className = cls ? cls.name : (input.className || input.classId);

    const newStudent: Student = {
      id: `std-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: input.name.trim(),
      ra: input.ra?.trim() || `${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      classId: input.classId,
      className,
      tutor: input.tutor?.trim() || '',
      guardianName: input.guardianName?.trim() || 'Responsável Legal',
      guardianPhone: input.guardianPhone?.trim() || '(11) 90000-0000',
      guardianRelationship: input.guardianRelationship?.trim() || 'Responsável',
      address: input.address?.trim() || 'Endereço escolar não informado',
      neighborhood: input.neighborhood?.trim() || 'Centro',
      status: input.status || 'regular',
      riskLevel: input.riskLevel || 'baixo',
      totalSchoolDays: input.totalSchoolDays || 45,
      totalAbsences: input.totalAbsences || 0,
      consecutiveAbsences: input.consecutiveAbsences || 0,
      attendanceRate: input.attendanceRate || 100,
      vulnerabilityFactors: input.vulnerabilityFactors || [],
      lastAttendanceDate: input.lastAttendanceDate || todayStr,
      notes: input.notes || 'Estudante cadastrado pela secretaria escolar.',
    };

    this.data.students.push(newStudent);

    // Update class student count
    if (cls) {
      cls.totalStudents = this.data.students.filter(s => s.classId === cls.id).length;
    }

    this.saveToDisk();
    return newStudent;
  }

  public batchImportStudents(studentsList: Partial<Student>[]): { insertedCount: number; students: Student[] } {
    const inserted: Student[] = [];

    studentsList.forEach(input => {
      if (!input.name || !input.classId) return;

      const cls = this.data.classes.find(c => c.id === input.classId);
      const className = cls ? cls.name : (input.className || input.classId);

      const newStudent: Student = {
        id: `std-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: input.name.trim(),
        ra: input.ra?.trim() || `${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        classId: input.classId,
        className,
        tutor: input.tutor?.trim() || '',
        guardianName: input.guardianName?.trim() || 'Responsável',
        guardianPhone: input.guardianPhone?.trim() || '(11) 90000-0000',
        guardianRelationship: input.guardianRelationship?.trim() || 'Responsável',
        address: input.address?.trim() || 'Endereço não informado',
        neighborhood: input.neighborhood?.trim() || 'Bairro escolar',
        status: input.status || 'regular',
        riskLevel: input.riskLevel || 'baixo',
        totalSchoolDays: input.totalSchoolDays || 45,
        totalAbsences: input.totalAbsences || 0,
        consecutiveAbsences: input.consecutiveAbsences || 0,
        attendanceRate: input.attendanceRate || 100,
        vulnerabilityFactors: input.vulnerabilityFactors || [],
        lastAttendanceDate: input.lastAttendanceDate || todayStr,
        notes: input.notes || 'Importado via planilha da secretaria.',
      };

      this.data.students.push(newStudent);
      inserted.push(newStudent);
    });

    // Refresh class student counts
    this.data.classes.forEach(c => {
      c.totalStudents = this.data.students.filter(s => s.classId === c.id).length;
    });

    this.saveToDisk();
    return { insertedCount: inserted.length, students: inserted };
  }

  public deleteStudent(id: string, purgeAll: boolean = true): boolean {
    const cleanId = String(id || '').trim().toLowerCase();
    const initialLen = this.data.students.length;
    this.data.students = this.data.students.filter(s => (s.id || '').trim().toLowerCase() !== cleanId);
    if (this.data.students.length === initialLen) return false;

    // Remove from active interventions / "Casos de Busca Ativa & IA" in BOTH modes
    this.data.interventions = this.data.interventions.filter(
      i => (i.studentId || '').trim().toLowerCase() !== cleanId
    );

    // If purgeAll is true, delete attendance records, alerts and gate records as well
    if (purgeAll) {
      this.data.attendanceRecords = this.data.attendanceRecords.filter(
        r => (r.studentId || '').trim().toLowerCase() !== cleanId
      );
      this.data.alerts = this.data.alerts.filter(
        a => (a.studentId || '').trim().toLowerCase() !== cleanId
      );
      if (this.data.gateRecords) {
        this.data.gateRecords = this.data.gateRecords.filter(
          g => (g.studentId || '').trim().toLowerCase() !== cleanId
        );
      }
    }

    // Refresh class student counts & at-risk counters
    this.data.classes.forEach(c => {
      const classStudents = this.data.students.filter(s => s.classId === c.id);
      c.totalStudents = classStudents.length;
      c.studentsAtRiskCount = classStudents.filter(s => s.riskLevel === 'alto' || s.riskLevel === 'critico').length;
    });

    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public updateStudent(id: string, updates: Partial<Student>): Student | null {
    const student = this.data.students.find(s => s.id === id);
    if (!student) return null;

    if (updates.name !== undefined) student.name = String(updates.name).trim();
    if (updates.ra !== undefined) student.ra = String(updates.ra).trim();
    if (updates.classId !== undefined && updates.classId !== student.classId) {
      student.classId = updates.classId;
      const cls = this.data.classes.find(c => c.id === updates.classId);
      if (cls) student.className = cls.name;
    }
    if (updates.className !== undefined) student.className = updates.className;
    if (updates.tutor !== undefined) student.tutor = String(updates.tutor).trim();
    if (updates.guardianName !== undefined) student.guardianName = updates.guardianName.trim();
    if (updates.guardianPhone !== undefined) student.guardianPhone = updates.guardianPhone.trim();
    if (updates.guardianRelationship !== undefined) student.guardianRelationship = updates.guardianRelationship.trim();
    if (updates.address !== undefined) student.address = updates.address.trim();
    if (updates.neighborhood !== undefined) student.neighborhood = updates.neighborhood.trim();
    if (updates.status !== undefined) student.status = updates.status;
    if (updates.riskLevel !== undefined) student.riskLevel = updates.riskLevel;
    if (updates.notes !== undefined) student.notes = updates.notes;
    if (updates.vulnerabilityFactors !== undefined) student.vulnerabilityFactors = updates.vulnerabilityFactors;
    if (updates.totalAbsences !== undefined) student.totalAbsences = updates.totalAbsences;
    if (updates.consecutiveAbsences !== undefined) student.consecutiveAbsences = updates.consecutiveAbsences;
    if (updates.attendanceRate !== undefined) student.attendanceRate = updates.attendanceRate;

    // Refresh class student counts
    this.data.classes.forEach(c => {
      c.totalStudents = this.data.students.filter(s => s.classId === c.id).length;
    });

    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return student;
  }

  public createClass(input: { id: string; name: string; grade: string; shift: string }): SchoolClass {
    if (!input.id || !input.name) throw new Error('Identificador e Nome da Turma são obrigatórios');

    const existing = this.data.classes.find(c => c.id === input.id);
    if (existing) throw new Error(`Turma com identificador ${input.id} já existe`);

    const newClass: SchoolClass = {
      id: input.id.trim(),
      name: input.name.trim(),
      grade: input.grade || 'Ensino Fundamental',
      shift: (['Manhã', 'Tarde', 'Integral', 'Noite'].includes(input.shift) ? input.shift : 'Manhã') as any,
      totalStudents: 0,
      presentToday: 0,
      absentToday: 0,
      attendanceRateToday: 100,
      studentsAtRiskCount: 0,
    };

    this.data.classes.push(newClass);
    this.saveToDisk();
    return newClass;
  }

  public deleteClass(classId: string): boolean {
    const cleanId = String(classId).trim().toLowerCase();
    this.data.classes = this.data.classes.filter(c => c.id.trim().toLowerCase() !== cleanId);

    // Clean up or reassign students associated with this class, or remove their records
    const studentsInClass = this.data.students.filter(s => (s.classId || '').trim().toLowerCase() === cleanId);
    studentsInClass.forEach(s => {
      this.deleteStudent(s.id);
    });

    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public updateClass(classId: string, updates: Partial<SchoolClass>): SchoolClass | null {
    const cls = this.data.classes.find(c => c.id === classId);
    if (!cls) return null;
    if (updates.name !== undefined) cls.name = String(updates.name).trim();
    if (updates.grade !== undefined) cls.grade = updates.grade;
    if (updates.shift !== undefined) cls.shift = updates.shift;
    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return cls;
  }

  public getGoogleSheetsConfig() {
    return this.data.googleSheetsConfig || {
      spreadsheetId: null,
      spreadsheetUrl: null,
      title: null,
      lastSync: null,
      connectedUserEmail: null,
      syncedCounts: {
        students: 0,
        attendance: 0,
        interventions: 0,
        gateRecords: 0,
        alerts: 0,
      },
    };
  }

  public updateGoogleSheetsConfig(config: any) {
    this.data.googleSheetsConfig = {
      ...this.getGoogleSheetsConfig(),
      ...config,
    };
    this.saveToDisk();
    return this.data.googleSheetsConfig;
  }

  public getAllDataRaw(): DatabaseSchema {
    return this.data;
  }

  public getSpreadsheetDatasets() {
    // 1. Alunos
    const alunosHeaders = [
      'ID Estudante',
      'RA',
      'Nome Completo',
      'Código Turma',
      'Nome da Turma',
      'Professor(a) Tutor(a)',
      'Nome do Responsável',
      'Telefone / WhatsApp',
      'Parentesco',
      'Endereço',
      'Bairro',
      'Status Escolar',
      'Grau de Risco',
      'Dias Letivos',
      'Total de Faltas',
      'Faltas Consecutivas',
      'Frequência (%)',
      'Fatores de Vulnerabilidade',
      'Último Registro',
      'Observações',
    ];
    const alunosRows = this.data.students.map(s => [
      s.id,
      s.ra,
      s.name,
      s.classId,
      s.className,
      s.tutor || 'Não atribuído',
      s.guardianName,
      s.guardianPhone,
      s.guardianRelationship,
      s.address,
      s.neighborhood,
      s.status,
      s.riskLevel,
      s.totalSchoolDays,
      s.totalAbsences,
      s.consecutiveAbsences,
      s.attendanceRate,
      (s.vulnerabilityFactors || []).join('; '),
      s.lastAttendanceDate || '',
      s.notes || '',
    ]);

    // 2. Frequência Diária (Lista de Lançamentos)
    const freqHeaders = [
      'ID Registro',
      'Data (AAAA-MM-DD)',
      'Código Turma',
      'ID Estudante',
      'Nome do Estudante',
      'Status',
      'Código Calendário (0=Presença, 1=Falta, AT=Atestado)',
      'Justificativa / Motivo',
      'Duração (Dias)',
      'Atestado Médico (Dias)',
      'Registrado Por',
      'Data/Hora Gravação',
    ];
    const freqRows = this.data.attendanceRecords.map(r => {
      let code = '0';
      if (r.status === 'falta_injustificada' || r.status === 'falta_justificada') code = '1';
      else if (r.status === 'atestado_medico') code = 'AT';

      return [
        r.id,
        r.date,
        r.classId,
        r.studentId,
        r.studentName,
        r.status,
        code,
        r.justification || '',
        (r as any).durationDays || (r.status === 'falta_injustificada' || r.status === 'falta_justificada' ? 1 : ''),
        r.medicalCertificate || '',
        r.recordedBy,
        r.recordedAt,
      ];
    });

    // 2b. Calendário de Frequência (Visão Matriz: 0 = presença, 1 = ausência, AT = atestado)
    // Coleta todas as datas distintas ordenadas
    const allDates = Array.from(new Set(this.data.attendanceRecords.map(r => r.date))).sort();
    const calendarioHeaders = ['RA', 'Nome do Aluno', 'Turma', ...allDates, 'Total Faltas (1)', 'Total Atestados (AT)'];

    // Mapeamento de (studentId, date) -> code
    const attendanceMap: Record<string, string> = {};
    this.data.attendanceRecords.forEach(r => {
      let code = '0';
      if (r.status === 'falta_injustificada' || r.status === 'falta_justificada') code = '1';
      else if (r.status === 'atestado_medico') code = 'AT';
      attendanceMap[`${r.studentId}_${r.date}`] = code;
    });

    const calendarioRows = this.data.students.map(student => {
      let faltasCount = 0;
      let atestadoCount = 0;

      const dateCells = allDates.map(d => {
        const key = `${student.id}_${d}`;
        const val = attendanceMap[key];
        if (val === '1') {
          faltasCount++;
          return '1';
        }
        if (val === 'AT') {
          atestadoCount++;
          return 'AT';
        }
        if (val === '0') {
          return '0';
        }
        // Se não houver registro para a data, retorna traço ou 0 conforme padrão escolar
        return '-';
      });

      return [
        student.ra,
        student.name,
        student.className,
        ...dateCells,
        faltasCount,
        atestadoCount,
      ];
    });

    // 3. Casos de Busca Ativa
    const buscaHeaders = [
      'ID Caso',
      'ID Estudante',
      'Nome do Estudante',
      'Turma',
      'Responsável',
      'Telefone',
      'Prioridade',
      'Estágio Atual',
      'Data de Abertura',
      'Última Atualização',
      'Pedagogo / Responsável Caso',
      'Motivo da Infrequência',
      'Plano de Ações (Resumo)',
      'Histórico de Atuações',
    ];
    const buscaRows = this.data.interventions.map(i => [
      i.id,
      i.studentId,
      i.studentName,
      i.className,
      i.guardianName,
      i.guardianPhone,
      i.priority,
      i.stage,
      i.openedAt,
      i.lastUpdatedAt,
      i.assignedPedagogue,
      i.reason,
      (i.actionPlan || []).join(' | '),
      (i.actionLog || []).map(a => `[${a.date} - ${a.author}]: ${a.action} -> ${a.result}`).join('\n'),
    ]);

    // 4. Portaria e Movimentações
    const portariaHeaders = [
      'ID Movimentação',
      'Data',
      'Hora',
      'ID Estudante',
      'Nome do Estudante',
      'Código Turma',
      'Nome Turma',
      'Tipo (Entrada Tardia / Saída Antecipada)',
      'Motivo Declarado',
      'Responsável que Retirou / Autorizou',
      'Telefone Responsável',
      'Registrado Por (AOE)',
      'Observações',
    ];
    const portariaRows = (this.data.gateRecords || []).map(g => [
      g.id,
      g.date,
      g.time,
      g.studentId,
      g.studentName,
      g.classId,
      g.className,
      g.type === 'entrada_tardia' ? 'Entrada Tardia' : 'Saída Antecipada',
      g.reason,
      g.guardianOrAuthorizedPerson,
      g.guardianPhone || '',
      g.recordedBy,
      g.notes || '',
    ]);

    // 5. Alertas Enviados aos Responsáveis
    const alertasHeaders = [
      'ID Alerta',
      'ID Estudante',
      'Nome do Estudante',
      'Turma',
      'Responsável',
      'Telefone',
      'Canal',
      'Gatilho do Alerta',
      'Status Entrega',
      'Data/Hora Envio',
      'Mensagem Enviada',
      'Feedback do Responsável',
    ];
    const alertasRows = this.data.alerts.map(a => [
      a.id,
      a.studentId,
      a.studentName,
      a.className,
      a.guardianName,
      a.guardianPhone,
      a.channel,
      a.triggerLabel,
      a.status,
      a.sentAt,
      a.messageContent,
      a.guardianFeedback || '',
    ]);

    // 6. Turmas
    const turmasHeaders = [
      'Código',
      'Nome da Turma',
      'Nível / Etapa',
      'Turno',
      'Total de Estudantes',
      'Presentes Hoje',
      'Ausentes Hoje',
      'Taxa de Presença Hoje (%)',
      'Alunos em Risco',
    ];
    const turmasRows = this.data.classes.map(c => [
      c.id,
      c.name,
      c.grade,
      c.shift,
      c.totalStudents,
      c.presentToday,
      c.absentToday,
      c.attendanceRateToday,
      c.studentsAtRiskCount,
    ]);

    // 7. Usuários e Perfis de Acesso
    const usuariosHeaders = ['ID', 'Usuário / Identificador', 'Nome do Profissional', 'Perfil de Acesso (Role)', 'Nível de Permissão', 'Status', 'Último Acesso', 'Observações'];
    const usuariosRows = this.getUsers().map(u => [
      u.id,
      u.username,
      u.name,
      u.role,
      u.roleLabel,
      u.active ? 'Ativo' : 'Inativo',
      u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-BR') : 'Nunca acessou',
      u.notes || ''
    ]);

    return {
      Alunos: [alunosHeaders, ...alunosRows],
      Calendario_Frequencia: [calendarioHeaders, ...calendarioRows],
      Frequencia_Diaria: [freqHeaders, ...freqRows],
      Buscas_Ativas: [buscaHeaders, ...buscaRows],
      Portaria_Movimentacoes: [portariaHeaders, ...portariaRows],
      Alertas_Responsaveis: [alertasHeaders, ...alertasRows],
      Turmas: [turmasHeaders, ...turmasRows],
      Usuarios_Login: [usuariosHeaders, ...usuariosRows],
    };
  }

  public importStudentsFromGoogleSheet(rows: any[][]) {
    if (!rows || rows.length < 2) return { updatedCount: 0 };
    const dataRows = rows.slice(1);
    let updatedCount = 0;

    dataRows.forEach(r => {
      if (!r || r.length < 3) return;
      const [id, ra, name, classId, className, guardianName, guardianPhone, guardianRelationship, address, neighborhood] = r;
      if (!name || !ra) return;

      const existing = this.data.students.find(s => s.ra === String(ra).trim() || s.id === String(id).trim());
      if (existing) {
        existing.name = String(name).trim();
        if (classId) existing.classId = String(classId).trim();
        if (className) existing.className = String(className).trim();
        if (guardianName) existing.guardianName = String(guardianName).trim();
        if (guardianPhone) existing.guardianPhone = String(guardianPhone).trim();
        if (guardianRelationship) existing.guardianRelationship = String(guardianRelationship).trim();
        if (address) existing.address = String(address).trim();
        if (neighborhood) existing.neighborhood = String(neighborhood).trim();
        updatedCount++;
      }
    });

    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return { updatedCount };
  }

  public resetDemoData() {
    this.data = generateSeedData();
    this.saveToDisk();
    return this.data;
  }

  public wipeAllData() {
    // Preserve ONLY the Master Administrator user
    const users = this.getUsers();
    const masterUser = users.find(u => u.role === 'admin') || {
      id: 'usr-admin',
      name: 'Administrador Master',
      username: 'admin',
      role: 'admin' as const,
      roleLabel: 'Administrador (Master)',
      pin: '1234',
      createdAt: new Date().toISOString(),
      active: true,
      notes: 'Perfil Master exclusivo da escola',
    };

    this.data.classes = [];
    this.data.students = [];
    this.data.attendanceRecords = [];
    this.data.alerts = [];
    this.data.interventions = [];
    this.data.gateRecords = [];
    this.data.users = [masterUser];
    if (this.data.googleSheetsConfig?.syncedCounts) {
      this.data.googleSheetsConfig.syncedCounts = {
        students: 0,
        attendance: 0,
        interventions: 0,
        gateRecords: 0,
        alerts: 0,
      };
    }
    this.data.lastUpdated = new Date().toISOString();
    this.saveToDisk();
    return {
      success: true,
      message: 'Sistema totalmente limpo. Todas as turmas, estudantes, frequências, alertas, casos de busca ativa e usuários auxiliares foram removidos. O perfil Master foi preservado.',
      masterUser: {
        id: masterUser.id,
        name: masterUser.name,
        role: masterUser.role,
        roleLabel: masterUser.roleLabel,
      }
    };
  }
}
