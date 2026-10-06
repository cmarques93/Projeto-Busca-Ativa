import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Printer,
  UserCheck,
  UserX,
  Users,
  Calendar,
  Send,
  RefreshCw,
  FileText,
  BarChart3,
  Shield,
  HelpCircle,
  PlusCircle,
  Check,
  X,
  Sparkles,
  BookOpen,
  TrendingUp,
  Inbox,
  Phone,
  MessageSquare,
  ExternalLink,
  Lock,
  Percent,
  CheckCircle,
  Trash2,
  Settings,
  Edit2,
  Plus,
  Loader2,
  School,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';
import { SchoolClass, Student, AttendanceRecord, UserAccount } from '../types';
import { getStudentPhones, cleanPhoneForWhatsApp } from '../utils/phoneUtils';
import { storageService } from '../data/storageService';
import { carregarOcorrenciasSeguro, salvarOcorrenciaSeguro, excluirOcorrenciaSeguro, salvarConfigOcorrenciasSeguro } from '../lib/sheetsSyncService';
import { firestoreService } from '../lib/firestoreService';
import { formatarRelatoComGemini, limparTextoFormatado, testarChaveGemini, getStoredGeminiKey, saveStoredGeminiKey } from '../lib/geminiClient';
import ocorrenciasBaseline from '../data/ocorrenciasBaseline.json';

export interface HorarioAula {
  id: string;
  nome: string; // Ex: '1ª Aula', '2ª Aula', 'Intervalo / Recreio', '7ª Aula', etc.
  inicio: string; // '07:00'
  fim: string; // '07:45'
  tipo: 'aula' | 'intervalo';
}

export const GRADE_HORARIOS_PADRAO: HorarioAula[] = [
  { id: '1', nome: '1ª Aula', inicio: '07:00', fim: '07:45', tipo: 'aula' },
  { id: '2', nome: '2ª Aula', inicio: '07:45', fim: '08:30', tipo: 'aula' },
  { id: '3', nome: '3ª Aula', inicio: '08:30', fim: '09:15', tipo: 'aula' },
  { id: '4', nome: 'Intervalo / Recreio Manhã', inicio: '09:15', fim: '09:35', tipo: 'intervalo' },
  { id: '5', nome: '4ª Aula', inicio: '09:35', fim: '10:20', tipo: 'aula' },
  { id: '6', nome: '5ª Aula', inicio: '10:20', fim: '11:05', tipo: 'aula' },
  { id: '7', nome: '6ª Aula', inicio: '11:05', fim: '11:50', tipo: 'aula' },
  { id: '8', nome: 'Almoço / Intervalo Intermediário', inicio: '11:50', fim: '12:40', tipo: 'intervalo' },
  { id: '9', nome: '7ª Aula', inicio: '12:40', fim: '13:25', tipo: 'aula' },
  { id: '10', nome: '8ª Aula', inicio: '13:25', fim: '14:10', tipo: 'aula' },
  { id: '11', nome: '9ª Aula', inicio: '14:10', fim: '14:55', tipo: 'aula' },
];

export interface OcorrenciaRecord {
  id: string;
  data: string;
  aula: string;
  turma: string;
  estudante: string;
  tutor?: string;
  professor: string;
  ocorrencia: string;
  medida: string;
  auxilio: string;
  descricao?: string;
  mediacao?: string;
  mediador?: string;
  status: string;
  // Campos de auditoria de preenchimento (exclusivo para monitoramento da gestão)
  criadoEm?: string;
  horarioRegistro?: string;
  dataPreenchimento?: string;
  timestampPreenchimento?: number;
}

export interface PreenchimentoInfo {
  dataHoraFormatada: string;
  tempoDecorridoOuTipo: 'no_ato' | 'mesmo_dia' | 'posterior' | 'estimado';
  diasDiferenca?: number;
  horarioAulaStr?: string;
  detalheAuditoria?: string;
  tagBadge: string;
  isEstimado: boolean;
}

export interface TratativaFamilia {
  id?: string;
  data: string;
  estudante: string;
  tratativa: string;
  mediador: string;
}

export interface OcorrenciasDatabase {
  estudantes: Array<{ nome: string; turma: string; tutor: string }>;
  professores: Array<{ nome: string; pin: string | number; perfil: string }>;
  turmasPersonalizadas?: string[];
  ocorrencias: string[];
  medidas: string[];
  aulas: string[];
  gradeHorarios?: HorarioAula[];
  auxilio: string[];
  registros: OcorrenciaRecord[];
  tratativasFamilia: TratativaFamilia[];
  geminiApiKey?: string;
}

/**
 * Converte qualquer formato de data de ocorrência (DD/MM/YYYY, YYYY-MM-DD, ISO) para timestamp numérico
 */
export const parseDataOcorrenciaToTimestamp = (dStr: string): number => {
  if (!dStr) return 0;
  const str = String(dStr).trim();
  // Formato brasileiro DD/MM/YYYY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const ano = y.length === 2 ? `20${y}` : y;
      const ms = new Date(`${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00`).getTime();
      if (!isNaN(ms)) return ms;
    }
  }
  // Formato ISO ou YYYY-MM-DD
  if (str.includes('-')) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const ano = y.length === 2 ? `20${y}` : y;
      const ms = new Date(`${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00`).getTime();
      if (!isNaN(ms)) return ms;
    }
  }
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Helper que extrai o carimbo real de quando o professor preencheu a ocorrência
 * Usado exclusivamente pelos perfis de ADMIN e GESTÃO/PAAC para monitorar pontualidade (preenchimento no ato vs posterior)
 * Cruza o momento do preenchimento com a grade de horários das aulas cadastradas no sistema.
 */
export const obterInfoPreenchimento = (
  reg: OcorrenciaRecord,
  gradeHorarios: HorarioAula[] = GRADE_HORARIOS_PADRAO
): PreenchimentoInfo => {
  let timeReg: number | null = null;
  let horarioRealTexto: string | null = null;

  // 1. Verifica se há um timestamp real registrado no ato do envio pelo professor
  if (reg.timestampPreenchimento && !isNaN(Number(reg.timestampPreenchimento))) {
    timeReg = Number(reg.timestampPreenchimento);
  } else if (reg.id && reg.id.startsWith('REG-')) {
    const match = reg.id.match(/^REG-(\d{12,})-/);
    if (match && match[1]) {
      const ts = Number(match[1]);
      if (ts > 1600000000000 && ts < 2500000000000) {
        timeReg = ts;
      }
    }
  }

  // Se houver timestamp autêntico do momento da submissão:
  if (timeReg) {
    const d = new Date(timeReg);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    horarioRealTexto = `${dia}/${mes}/${ano} às ${hora}:${min}`;

    const dataFatoTs = parseDataOcorrenciaToTimestamp(reg.data);
    let tagBadge = '🟢 Preenchido no ato (Mesmo dia)';
    let tipo: PreenchimentoInfo['tempoDecorridoOuTipo'] = 'no_ato';
    let diasDiferenca = 0;
    let detalheAuditoria = '';
    let horarioAulaStr = '';

    if (dataFatoTs) {
      const dFato = new Date(dataFatoTs);
      dFato.setHours(0, 0, 0, 0);
      const dReg = new Date(timeReg);
      dReg.setHours(0, 0, 0, 0);

      const diffDias = Math.round((dReg.getTime() - dFato.getTime()) / (1000 * 60 * 60 * 24));
      diasDiferenca = diffDias;

      if (diffDias > 1) {
        tipo = 'posterior';
        tagBadge = `🔴 Preenchido ${diffDias} dias após a aula`;
        detalheAuditoria = `Lançado ${diffDias} dias após a data da aula (${reg.data}).`;
      } else if (diffDias === 1) {
        tipo = 'posterior';
        tagBadge = '🟡 Preenchido 1 dia após a aula';
        detalheAuditoria = `Lançado no dia seguinte à data da aula.`;
      } else {
        // diffDias <= 0 (Mesmo dia da ocorrência!)
        // Cruza com a grade de horários configurada para a aula indicada
        const listaGrade = gradeHorarios && gradeHorarios.length > 0 ? gradeHorarios : GRADE_HORARIOS_PADRAO;
        const aulaNorm = (reg.aula || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const horarioAula = listaGrade.find(h => {
          const hNorm = h.nome.toLowerCase().replace(/[^a-z0-9]/g, '');
          return aulaNorm.includes(hNorm) || hNorm.includes(aulaNorm);
        });

        const regMinTotal = Number(hora) * 60 + Number(min);

        if (horarioAula && horarioAula.inicio && horarioAula.fim) {
          horarioAulaStr = `${horarioAula.nome} (${horarioAula.inicio} às ${horarioAula.fim})`;
          const [hIni, mIni] = horarioAula.inicio.split(':').map(Number);
          const [hFim, mFim] = horarioAula.fim.split(':').map(Number);
          const inicioMin = hIni * 60 + mIni;
          const fimMin = hFim * 60 + mFim;

          // Se preencheu durante a aula ou até 15 minutos após o término:
          if (regMinTotal >= inicioMin - 5 && regMinTotal <= fimMin + 15) {
            tipo = 'no_ato';
            tagBadge = `🟢 Preenchido no ato (Durante a ${horarioAula.nome})`;
            detalheAuditoria = `Docente registrou no ato da aula (${horarioAula.inicio} - ${horarioAula.fim}).`;
          } else if (regMinTotal > fimMin + 15) {
            const minAtraso = regMinTotal - fimMin;
            tipo = 'mesmo_dia';
            if (minAtraso < 60) {
              tagBadge = `🟡 Preenchido no mesmo dia (${minAtraso} min após a aula)`;
              detalheAuditoria = `Enviado no mesmo dia, ${minAtraso} minutos após o término da aula (${horarioAula.fim}).`;
            } else {
              const horas = Math.floor(minAtraso / 60);
              const restoMin = minAtraso % 60;
              tagBadge = `🟡 Preenchido no mesmo dia (${horas}h${restoMin > 0 ? ` e ${restoMin}min` : ''} após a aula)`;
              detalheAuditoria = `Enviado no mesmo dia, cerca de ${horas}h após o horário da aula (${horarioAula.inicio} às ${horarioAula.fim}).`;
            }
          } else {
            tipo = 'no_ato';
            tagBadge = `🟢 Preenchido no ato (${horarioAula.nome})`;
            detalheAuditoria = `Registrado no mesmo dia (${horarioAula.inicio} às ${horarioAula.fim}).`;
          }
        } else {
          tipo = 'no_ato';
          tagBadge = '🟢 Preenchido no ato (Mesmo dia)';
          detalheAuditoria = `Registrado no mesmo dia da data da ocorrência.`;
        }
      }
    }

    return {
      dataHoraFormatada: horarioRealTexto,
      tempoDecorridoOuTipo: tipo,
      diasDiferenca,
      horarioAulaStr,
      detalheAuditoria,
      tagBadge,
      isEstimado: false,
    };
  }

  // 2. Registro Legado (preenchido antes da criação deste recurso):
  const dataFmt = reg.data ? (reg.data.includes('-') ? reg.data.split('T')[0].split('-').reverse().join('/') : reg.data) : 'Data não informada';
  return {
    dataHoraFormatada: `${dataFmt} (Horário não registrado no sistema anterior)`,
    tempoDecorridoOuTipo: 'estimado',
    diasDiferenca: 0,
    tagBadge: '📄 Registro Anterior (Sem carimbo de hora)',
    detalheAuditoria: 'Ocorrência lançada antes da implantação do monitoramento de pontualidade.',
    isEstimado: true,
  };
};

/**
 * Ordena ocorrências em ordem cronológica decrescente: OCORRÊNCIAS RECENTES SEMPRE EM PRIMEIRO LUGAR
 */
export const ordenarOcorrenciasPorMaisRecentes = (registros: OcorrenciaRecord[]): OcorrenciaRecord[] => {
  if (!registros || !Array.isArray(registros)) return [];
  return [...registros].sort((a, b) => {
    const timeA = parseDataOcorrenciaToTimestamp(a.data);
    const timeB = parseDataOcorrenciaToTimestamp(b.data);

    // 1. Data mais recente primeiro (maior timestamp)
    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // 2. Se as datas forem iguais, compara pelo número ou timestamp contido no ID
    const extractNum = (idStr: string) => {
      const match = String(idStr || '').match(/\d+/g);
      return match ? Number(match.join('')) : 0;
    };
    const numA = extractNum(a.id);
    const numB = extractNum(b.id);
    if (numB !== numA) {
      return numB - numA;
    }

    // 3. Se houver aula (ex: 7ª Aula vs 1ª Aula)
    const extrairAula = (aulaStr: string) => {
      const match = String(aulaStr || '').match(/\d+/);
      return match ? Number(match[0]) : 0;
    };
    const aulaA = extrairAula(a.aula);
    const aulaB = extrairAula(b.aula);
    if (aulaB !== aulaA) {
      return aulaB - aulaA;
    }

    return (b.id || '').localeCompare(a.id || '', 'pt-BR', { numeric: true });
  });
};

/**
 * Verifica se a ocorrência foi indicada como resolvida em sala de aula
 */
export const verificarResolvidoEmSala = (auxilioStr: string): boolean => {
  const aux = String(auxilioStr || '').toLowerCase();
  return (
    aux.includes('nenhum auxílio') ||
    aux.includes('sem necessidade') ||
    aux.includes('nenhum') ||
    aux.includes('resolvido em sala')
  );
};

/**
 * Identifica se a ocorrência está Concluída (Finalizada pela gestão ou resolvida em sala)
 */
export const isOcorrenciaConcluida = (r: OcorrenciaRecord): boolean => {
  const statusNorm = String(r.status || '').trim().toLowerCase();
  if (statusNorm === 'resolvido' || statusNorm === 'concluído' || statusNorm === 'concluido') {
    return true;
  }
  // Se foi resolvida em sala pelo professor e a gestão não abriu acompanhamento ativo
  if (verificarResolvidoEmSala(r.auxilio) && statusNorm !== 'em andamento' && statusNorm !== 'em acompanhamento') {
    return true;
  }
  return false;
};

/**
 * Identifica se a ocorrência está Em Andamento (Possui atendimento/registro da gestão, mas ainda sem conclusão)
 */
export const isOcorrenciaEmAndamento = (r: OcorrenciaRecord): boolean => {
  if (isOcorrenciaConcluida(r)) return false;
  const statusNorm = String(r.status || '').trim().toLowerCase();
  if (statusNorm === 'em andamento' || statusNorm === 'em acompanhamento') {
    return true;
  }
  // Se já possui mediação/parecer registrado pela gestão e ainda não foi marcado como concluído
  if (r.mediacao && r.mediacao.trim().length > 0) {
    return true;
  }
  return false;
};

/**
 * Identifica se a ocorrência está Pendente (Nova ocorrência solicitando suporte aguardando primeiro registro da gestão)
 */
export const isOcorrenciaPendente = (r: OcorrenciaRecord): boolean => {
  return !isOcorrenciaConcluida(r) && !isOcorrenciaEmAndamento(r);
};

interface OcorrenciasManagerProps {
  currentUser?: { id: string; name: string; role: string; pin?: string } | null;
  classes: SchoolClass[];
  students: Student[];
}

export const OcorrenciasManager: React.FC<OcorrenciasManagerProps> = ({
  currentUser,
  classes,
  students,
}) => {
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' | '' }>({
    texto: '',
    tipo: '',
  });

  // Base de Dados vinda do Firestore / Google Sheets + Fallback local e baseline oficial (com ocorrências recentes em 1º lugar)
  const [bancoDeDados, setBancoDeDados] = useState<OcorrenciasDatabase>(() => {
    try {
      const cached = localStorage.getItem('CACHE_OCORRENCIAS_APP');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.registros && parsed.registros.length > 0) {
          return {
            ...parsed,
            registros: ordenarOcorrenciasPorMaisRecentes(parsed.registros),
          };
        }
      }
    } catch {}
    const base = (ocorrenciasBaseline as unknown as OcorrenciasDatabase) || {
      estudantes: [],
      professores: [],
      ocorrencias: [
        'Uso indevido de celular/fone em aula',
        'Desrespeito verbal com colega',
        'Desrespeito com professor/funcionário',
        'Não realização das atividades propostas',
        'Conversa excessiva e dispersão da turma',
        'Atraso recorrente para entrada em sala',
        'Saída de sala sem autorização prévia',
        'Dano ao patrimônio escolar / pichação',
        'Agressão física ou vias de fato',
      ],
      medidas: [
        'Conversa individual e advertência verbal',
        'Mudança de assento em sala',
        'Assinatura de termo de compromisso',
        'Contato telefônico imediato com a família',
        'Encaminhamento à Coordenação/Gestão',
        'Retirada do celular para guarda na secretaria',
      ],
      aulas: ['1ª Aula', '2ª Aula', '3ª Aula', '4ª Aula', '5ª Aula', '6ª Aula', '7ª Aula', '8ª Aula', '9ª Aula'],
      auxilio: [
        'Nenhum auxílio solicitado (Resolvido em sala)',
        'Necessita intervenção da Gestão Escolar',
        'Necessita convocação urgente da família',
      ],
      registros: [],
      tratativasFamilia: [],
    };
    return {
      ...base,
      registros: ordenarOcorrenciasPorMaisRecentes(base.registros || []),
    };
  });

  // Identificação do Usuário
  const userName = currentUser?.name || 'Professor / Servidor';
  const userRole = (currentUser?.role || 'professor').toLowerCase();
  const userRoleLabel = (currentUser as any)?.roleLabel ? String((currentUser as any).roleLabel).toLowerCase() : '';
  const isAdmin =
    userRole === 'admin' ||
    userRole === 'administrador' ||
    userRole.includes('admin') ||
    userRoleLabel.includes('administrador');
  const isGestao =
    isAdmin ||
    userRole.includes('gest') ||
    userRole.includes('paac') ||
    userRole.includes('diret') ||
    userRole.includes('coord');

  // Modal de Exclusão de Ocorrência (Exclusivo Administrador)
  const [ocorrenciaParaExcluir, setOcorrenciaParaExcluir] = useState<OcorrenciaRecord | null>(null);
  const [excluindoOcorrencia, setExcluindoOcorrencia] = useState(false);

  // Lista de Usuários do Sistema para Seleção
  const [usuariosCadastrados, setUsuariosCadastrados] = useState<UserAccount[]>(() => {
    try {
      return storageService.getUsers();
    } catch {
      return [];
    }
  });

  useEffect(() => {
    firestoreService.getUsers().then(users => {
      if (users && users.length > 0) {
        setUsuariosCadastrados(users);
      }
    }).catch(() => {});
  }, []);

  const listaProfessoresDisponiveis = useMemo(() => {
    const profsUsers = usuariosCadastrados
      .filter(u => u.active !== false && (u.role === 'professor' || (u.roleLabel && u.roleLabel.toLowerCase().includes('prof'))))
      .map(u => u.name.trim());
    const profsDb = (bancoDeDados.professores || []).map((p: any) =>
      typeof p === 'string' ? p.trim() : (p?.nome || '').trim()
    );
    const profsFromRecords = (bancoDeDados.registros || []).map(r => (r.professor || '').trim());
    const todos = Array.from(new Set([...profsUsers, ...profsDb, ...profsFromRecords, userName])).filter(Boolean);
    return todos.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [usuariosCadastrados, bancoDeDados.professores, bancoDeDados.registros, userName]);

  const listaMembrosGestaoDisponiveis = useMemo(() => {
    const gestaoUsers = usuariosCadastrados
      .filter(u => u.active !== false && (u.role === 'admin' || u.role === 'gestao_paac' || u.role !== 'professor'))
      .map(u => u.name.trim());
    const gestaoFromRecords = (bancoDeDados.registros || []).map(r => (r.mediador || '').trim());
    const gestaoDefaults = [
      'Equipe Gestora',
      'Direção Escolar',
      'Coordenação Pedagógica',
      'Prof. Mediador PAAC',
      'Vice-Direção'
    ];
    const todos = Array.from(new Set([...gestaoUsers, ...gestaoFromRecords, ...gestaoDefaults, userName])).filter(Boolean);
    return todos.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [usuariosCadastrados, bancoDeDados.registros, userName]);

  // Modo de digitação livre de professor e mediador (útil para migração do sistema antigo)
  const [modoProfessorAvulso, setModoProfessorAvulso] = useState(false);
  const [modoMediadorAvulso, setModoMediadorAvulso] = useState(false);

  // Abas de Navegação
  const [abaGestao, setAbaGestao] = useState<
    'pendentes' | 'em_andamento' | 'concluidos' | 'sala' | 'consulta' | 'estatisticas' | 'registrar' | 'meus_registros' | 'devolutivas' | 'tutorados' | 'config_admin'
  >(isGestao ? 'pendentes' : 'registrar');

  // Filtro interno para a aba de Concluídos: Todos | Gestão | Resolvidos em Sala
  const [filtroConcluidos, setFiltroConcluidos] = useState<'todos' | 'gestao' | 'sala'>('todos');

  const [abaProfessor, setAbaProfessor] = useState<'registrar' | 'meus_registros' | 'devolutivas' | 'tutorados'>(
    'registrar'
  );

  // Estados do Painel de Administração (Edição de Ocorrências Principais, Medidas Tomadas, Grade de Horários e IA Gemini)
  const [abaAdminConfig, setAbaAdminConfig] = useState<'ocorrencias' | 'medidas' | 'horarios' | 'ia_gemini'>('ocorrencias');
  const [novoItemConfig, setNovoItemConfig] = useState('');
  const [itemEditando, setItemEditando] = useState<{
    tipo: 'ocorrencia' | 'medida';
    index: number;
    valorAntigo: string;
    valorNovo: string;
  } | null>(null);
  const [itemParaExcluirConfig, setItemParaExcluirConfig] = useState<{
    tipo: 'ocorrencia' | 'medida';
    index: number;
    valor: string;
  } | null>(null);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Estados de Configuração da Grade de Horários das Aulas e Intervalos
  const [gradeHorarios, setGradeHorarios] = useState<HorarioAula[]>(() => {
    if (bancoDeDados.gradeHorarios && bancoDeDados.gradeHorarios.length > 0) {
      return bancoDeDados.gradeHorarios;
    }
    return GRADE_HORARIOS_PADRAO;
  });
  const [novoHorarioNome, setNovoHorarioNome] = useState('');
  const [novoHorarioInicio, setNovoHorarioInicio] = useState('07:00');
  const [novoHorarioFim, setNovoHorarioFim] = useState('07:45');
  const [novoHorarioTipo, setNovoHorarioTipo] = useState<'aula' | 'intervalo'>('aula');
  const [salvandoHorarios, setSalvandoHorarios] = useState(false);

  // Estados de Configuração da Chave do Gemini
  const [chaveGeminiInput, setChaveGeminiInput] = useState(() => getStoredGeminiKey());
  const [mostrarChave, setMostrarChave] = useState(false);
  const [testandoGemini, setTestandoGemini] = useState(false);
  const [resultadoTesteGemini, setResultadoTesteGemini] = useState<{ success: boolean; message: string; formattedSample?: string } | null>(null);
  const [modalConfigurarChave, setModalConfigurarChave] = useState(false);

  // Estados de IA Gemini para Formatação Pedagógica e WhatsApp
  const [formatandoComIA, setFormatandoComIA] = useState(false);
  const [formatandoWhatsAppIA, setFormatandoWhatsAppIA] = useState(false);

  // Estados de Interface
  const [tutoradosExpandidos, setTutoradosExpandidos] = useState<Record<string, boolean>>({});
  const [termoBusca, setTermoBusca] = useState('');

  // Formulário de Registro
  const todayIso = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState<{
    data: string;
    aula: string;
    turma: string;
    estudantes: Array<{ nome: string; tutor: string }>;
    professor: string;
    ocorrencia: string;
    medida: string;
    auxilio: string;
    descricao: string;
  }>({
    data: todayIso,
    aula: '',
    turma: '',
    estudantes: [],
    professor: userName,
    ocorrencia: '',
    medida: '',
    auxilio: 'Nenhum auxílio solicitado (Resolvido em sala)',
    descricao: '',
  });

  // Modal de Mediação
  const [modalMediacao, setModalMediacao] = useState<OcorrenciaRecord | null>(null);
  const [formMediacao, setFormMediacao] = useState({
    status: 'Resolvido',
    mediacao: '',
    mediador: userName,
  });

  // Modal de Tratativa com Família
  const [modalFamilia, setModalFamilia] = useState<{
    nome: string;
    turma?: string;
    tutor?: string;
  } | null>(null);
  const [formFamilia, setFormFamilia] = useState({ tratativa: '' });

  // Modal de Dossiê Imprimível Oficial
  const [dossieAluno, setDossieAluno] = useState<{
    nome: string;
    turma: string;
    tutor: string;
    ocorrencias: OcorrenciaRecord[];
    tratativas: TratativaFamilia[];
    estudanteObj?: Student;
    historicoFrequencia?: AttendanceRecord[];
  } | null>(null);

  // Modal de Disparo de WhatsApp de Ocorrência para os Responsáveis (Exclusivo Gestão)
  const [modalWhatsApp, setModalWhatsApp] = useState<{
    ocorrencia: OcorrenciaRecord;
    estudanteObj?: Student;
    guardianPhones: Array<{ formatted: string; whatsAppUrl: string; digits: string }>;
    mensagemPadrao: string;
  } | null>(null);

  // Modal de Edição de Ocorrência Registrada
  const [modalEdicaoOcorrencia, setModalEdicaoOcorrencia] = useState<OcorrenciaRecord | null>(null);
  const [formEdicaoOcorrencia, setFormEdicaoOcorrencia] = useState<{
    id: string;
    data: string;
    aula: string;
    turma: string;
    estudante: string;
    tutor: string;
    professor: string;
    ocorrencia: string;
    medida: string;
    auxilio: string;
    descricao: string;
    status: string;
    mediacao?: string;
    mediador?: string;
  }>({
    id: '',
    data: '',
    aula: '',
    turma: '',
    estudante: '',
    tutor: '',
    professor: '',
    ocorrencia: '',
    medida: '',
    auxilio: '',
    descricao: '',
    status: 'Pendente',
    mediacao: '',
    mediador: '',
  });
  const [salvandoEdicaoOcorrencia, setSalvandoEdicaoOcorrencia] = useState(false);
  const [formatandoEdicaoIA, setFormatandoEdicaoIA] = useState(false);

  // Alerta de Reincidência no mesmo dia
  const [alertaOcorrencia, setAlertaOcorrencia] = useState<{
    dataFmt: string;
    alunos: Array<{ nome: string; lista: OcorrenciaRecord[] }>;
  } | null>(null);

  // Sincroniza nome do usuário logado
  useEffect(() => {
    if (userName) {
      setForm(prev => ({ ...prev, professor: userName }));
    }
  }, [userName]);

  // Formatador de Data BR
  const formatarDataBR = (dataStr: string) => {
    if (!dataStr) return '';
    if (dataStr.includes('/') && dataStr.length === 10) return dataStr;
    try {
      if (dataStr.includes('-') && dataStr.length === 10) {
        const [a, m, d] = dataStr.split('-');
        return `${d}/${m}/${a}`;
      }
      const dataObjeto = new Date(dataStr);
      if (!isNaN(dataObjeto.getTime())) {
        const dia = String(dataObjeto.getDate()).padStart(2, '0');
        const mes = String(dataObjeto.getMonth() + 1).padStart(2, '0');
        const ano = dataObjeto.getFullYear();
        return `${dia}/${mes}/${ano}`;
      }
      return dataStr;
    } catch {
      return dataStr;
    }
  };

  const verificarResolvidoEmSala = (auxilioStr: string) => {
    const aux = String(auxilioStr || '').toLowerCase();
    return (
      aux.includes('nenhum auxílio') ||
      aux.includes('sem necessidade') ||
      aux.includes('nenhum') ||
      aux.includes('resolvido em sala')
    );
  };

  // Carregamento via Serviço Seguro de Sincronização (com tripla redundância)
  const carregarDados = async () => {
    setCarregando(true);

    try {
      const resultado = await carregarOcorrenciasSeguro(classes, students);
      const data = resultado.data;

      if (data) {
        if (!data.tratativasFamilia) data.tratativasFamilia = [];

        // Mescla estudantes da plataforma com os estudantes da planilha se necessário
        let listaEstudantes = data.estudantes || [];
        if (listaEstudantes.length === 0 && students.length > 0) {
          listaEstudantes = students.map(s => {
            const cls = classes.find(c => c.id === s.classId);
            return {
              nome: s.name,
              turma: cls ? cls.name : 'Turma Geral',
              tutor: s.tutor || 'Equipe Pedagógica',
            };
          });
        }

        // Desduplicação estrita de registros de ocorrências
        const registrosUnicosMap = new Map<string, any>();
        for (const reg of (data.registros || [])) {
          const key = [
            (reg.data || '').trim(),
            (reg.aula || '').trim(),
            (reg.turma || '').trim(),
            (reg.estudante || '').trim(),
            (reg.ocorrencia || '').trim(),
          ].join('::');
          if (!registrosUnicosMap.has(key)) {
            registrosUnicosMap.set(key, reg);
          }
        }
        const registrosLimpos = Array.from(registrosUnicosMap.values());

        const novoDb: OcorrenciasDatabase = {
          estudantes: listaEstudantes,
          professores: data.professores || [],
          turmasPersonalizadas:
            data.turmasPersonalizadas && data.turmasPersonalizadas.length > 0
              ? data.turmasPersonalizadas
              : bancoDeDados.turmasPersonalizadas || [
                  '6ºA', '6ºB', '6ºC', '7ºA', '7ºB', '8ºA', '8ºB', '9ºA', '9ºB', '1ªEM A', '2ªEM A', '3ªEM A'
                ],
          ocorrencias:
            data.ocorrencias && data.ocorrencias.length > 0
              ? data.ocorrencias
              : bancoDeDados.ocorrencias,
          medidas:
            data.medidas && data.medidas.length > 0 ? data.medidas : bancoDeDados.medidas,
          aulas: data.aulas && data.aulas.length > 0 ? data.aulas : bancoDeDados.aulas,
          gradeHorarios:
            data.gradeHorarios && data.gradeHorarios.length > 0
              ? data.gradeHorarios
              : bancoDeDados.gradeHorarios && bancoDeDados.gradeHorarios.length > 0
              ? bancoDeDados.gradeHorarios
              : GRADE_HORARIOS_PADRAO,
          auxilio:
            data.auxilio && data.auxilio.length > 0 ? data.auxilio : bancoDeDados.auxilio,
          registros: ordenarOcorrenciasPorMaisRecentes(registrosLimpos),
          tratativasFamilia: data.tratativasFamilia || [],
          geminiApiKey: data.geminiApiKey || bancoDeDados.geminiApiKey || getStoredGeminiKey(),
        };

        if (data.gradeHorarios && data.gradeHorarios.length > 0) {
          setGradeHorarios(data.gradeHorarios);
        }

        if (data.geminiApiKey && typeof data.geminiApiKey === 'string') {
          saveStoredGeminiKey(data.geminiApiKey);
          setChaveGeminiInput(data.geminiApiKey);
        }

        setBancoDeDados(novoDb);

        if (resultado.source === 'api' || resultado.source === 'direct') {
          setMensagem({
            texto: `✅ Base sincronizada com sucesso com o Firebase! (${registrosLimpos.length} ocorrências e ${novoDb.estudantes.length} estudantes carregados)`,
            tipo: 'sucesso',
          });
        } else {
          setMensagem({
            texto: `ℹ️ Modo local ativado: ${registrosLimpos.length} ocorrências disponíveis (${resultado.message || 'offline'})`,
            tipo: 'info',
          });
        }
        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
      } else {
        setMensagem({
          texto: 'Conectado à base do Firebase',
          tipo: 'info',
        });
      }
    } catch (err: any) {
      console.warn('Erro ao carregar ocorrências:', err.message);
      setMensagem({
        texto: 'Modo de contingência ativado com dados salvos no navegador.',
        tipo: 'info',
      });
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Turmas e Estudantes disponíveis - buscados EXCLUSIVAMENTE no cadastro de Turmas do sistema de Busca Ativa
  const turmasUnicas = useMemo(() => {
    const turmasFromClasses = (classes || []).map(c => c.name.trim()).filter(Boolean);
    let lista: string[] = Array.from(new Set(turmasFromClasses));
    if (lista.length === 0 && storageService) {
      try {
        const stClasses = storageService.getClasses();
        if (stClasses && stClasses.length > 0) {
          lista = Array.from(new Set(stClasses.map(c => c.name.trim()).filter(Boolean)));
        }
      } catch {}
    }
    if (lista.length === 0 && students && students.length > 0) {
      const studentTurmas = students
        .map(s => {
          const cls = (classes || []).find(c => c.id === s.classId);
          return cls ? cls.name.trim() : (s as any).className || '';
        })
        .filter(Boolean);
      lista = Array.from(new Set(studentTurmas));
    }
    return lista.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [classes, students]);

  const alunosDaTurma = useMemo(() => {
    if (!form.turma) return [];
    const turmaNormalizada = form.turma.trim().toLowerCase();
    const turmaObj = (classes || []).find(
      c => c.name.trim().toLowerCase() === turmaNormalizada || c.id === form.turma
    );

    let listaAlunos = (students || []).filter(s => {
      if (turmaObj && s.classId === turmaObj.id) return true;
      if (s.className && s.className.trim().toLowerCase() === turmaNormalizada) return true;
      const sCls = (classes || []).find(c => c.id === s.classId);
      return sCls && sCls.name.trim().toLowerCase() === turmaNormalizada;
    });

    if (listaAlunos.length === 0 && storageService) {
      try {
        const stStudents = storageService.getStudents();
        listaAlunos = (stStudents || []).filter(s => {
          if (turmaObj && s.classId === turmaObj.id) return true;
          if (s.className && s.className.trim().toLowerCase() === turmaNormalizada) return true;
          const sCls = (classes || []).find(c => c.id === s.classId);
          return sCls && sCls.name.trim().toLowerCase() === turmaNormalizada;
        });
      } catch {}
    }

    return listaAlunos
      .map(s => ({
        nome: s.name.trim(),
        turma: form.turma,
        tutor: s.tutor || (s as any).responsibleTutor || 'Equipe Pedagógica',
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [form.turma, classes, students]);

  const alunosDaTurmaEdicao = useMemo(() => {
    if (!formEdicaoOcorrencia.turma) return [];
    const turmaNormalizada = formEdicaoOcorrencia.turma.trim().toLowerCase();
    const turmaObj = (classes || []).find(
      c => c.name.trim().toLowerCase() === turmaNormalizada || c.id === formEdicaoOcorrencia.turma
    );

    let listaAlunos = (students || []).filter(s => {
      if (turmaObj && s.classId === turmaObj.id) return true;
      if (s.className && s.className.trim().toLowerCase() === turmaNormalizada) return true;
      const sCls = (classes || []).find(c => c.id === s.classId);
      return sCls && sCls.name.trim().toLowerCase() === turmaNormalizada;
    });

    if (listaAlunos.length === 0 && storageService) {
      try {
        const stStudents = storageService.getStudents();
        listaAlunos = (stStudents || []).filter(s => {
          if (turmaObj && s.classId === turmaObj.id) return true;
          if (s.className && s.className.trim().toLowerCase() === turmaNormalizada) return true;
          const sCls = (classes || []).find(c => c.id === s.classId);
          return sCls && sCls.name.trim().toLowerCase() === turmaNormalizada;
        });
      } catch {}
    }

    return listaAlunos
      .map(s => ({
        nome: s.name.trim(),
        turma: formEdicaoOcorrencia.turma,
        tutor: s.tutor || (s as any).responsibleTutor || 'Equipe Pedagógica',
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [formEdicaoOcorrencia.turma, classes, students]);

  // Handle Form Change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm(prev => {
      const novo = { ...prev, [name]: value };
      if (name === 'turma') novo.estudantes = [];
      return novo;
    });
  };

  // Envio de nova Ocorrência
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.estudantes.length === 0) {
      setMensagem({ texto: '⚠️ Selecione pelo menos um estudante envolvido.', tipo: 'erro' });
      return;
    }

    if (!form.descricao || !form.descricao.trim()) {
      setMensagem({ texto: '⚠️ O campo descrição/relato da ocorrência é obrigatório.', tipo: 'erro' });
      return;
    }

    setEnviando(true);
    setMensagem({ texto: 'Salvando registros na planilha, aguarde...', tipo: 'sucesso' });

    let sucessoCount = 0;
    let erroCount = 0;

    const agora = new Date();
    const diaFmt = String(agora.getDate()).padStart(2, '0') + '/' + String(agora.getMonth() + 1).padStart(2, '0') + '/' + agora.getFullYear();
    const horaFmt = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
    const horarioStr = `${diaFmt} às ${horaFmt}`;
    const isoAgora = agora.toISOString();
    const tsAgora = agora.getTime();

    const novosRegistrosParaCache: OcorrenciaRecord[] = [];

    for (const est of form.estudantes) {
      const payload = {
        ...form,
        estudante: est.nome,
        tutor: est.tutor,
        criadoEm: isoAgora,
        horarioRegistro: horarioStr,
        dataPreenchimento: horarioStr,
        timestampPreenchimento: tsAgora,
      };

      const salvo = await salvarOcorrenciaSeguro(payload);
      if (salvo) {
        sucessoCount++;
      } else {
        erroCount++;
      }

      // Adiciona localmente para garantir persistência mesmo em offline
      novosRegistrosParaCache.push({
        id: `REG-${tsAgora}-${Math.floor(Math.random() * 1000)}`,
        data: form.data,
        aula: form.aula,
        turma: form.turma,
        estudante: est.nome,
        tutor: est.tutor,
        professor: form.professor,
        ocorrencia: form.ocorrencia,
        medida: form.medida,
        auxilio: form.auxilio,
        descricao: form.descricao,
        status: verificarResolvidoEmSala(form.auxilio) ? 'Resolvido' : 'Pendente',
        criadoEm: isoAgora,
        horarioRegistro: horarioStr,
        dataPreenchimento: horarioStr,
        timestampPreenchimento: tsAgora,
      });
    }

    // Atualiza base local imediatamente (com registros recentes sempre no topo)
    setBancoDeDados(prev => {
      const atualizados = ordenarOcorrenciasPorMaisRecentes([...novosRegistrosParaCache, ...prev.registros]);
      const novoDb = { ...prev, registros: atualizados };
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));
      return novoDb;
    });

    setEnviando(false);
    if (erroCount === 0 || sucessoCount > 0) {
      setMensagem({
        texto: `✅ ${sucessoCount || form.estudantes.length} ocorrência(s) registrada(s) com sucesso na nuvem!`,
        tipo: 'sucesso',
      });
      setForm(prev => ({
        ...prev,
        data: todayIso,
        aula: '',
        turma: '',
        estudantes: [],
        ocorrencia: '',
        medida: '',
        auxilio: 'Nenhum auxílio solicitado (Resolvido em sala)',
        descricao: '',
      }));
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
      carregarDados();
    } else {
      setMensagem({
        texto: '⚠️ Registrado na base local da plataforma (sincronização com o Firebase será repetida).',
        tipo: 'erro',
      });
    }
  };

  // Abrir Modal de Mediação
  const abrirMediacao = (r: OcorrenciaRecord) => {
    setModalMediacao(r);
    const statusInicial = isOcorrenciaConcluida(r)
      ? 'Concluído'
      : isOcorrenciaEmAndamento(r)
      ? 'Em Andamento'
      : 'Concluído';

    setFormMediacao({
      status: statusInicial,
      mediacao: r.mediacao || '',
      mediador: r.mediador || userName,
    });
    setModoMediadorAvulso(false);
  };

  // Salvar Mediação da Gestão
  const handleSalvarMediacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalMediacao) return;
    setEnviando(true);

    const mediadorFinal = (formMediacao.mediador || userName).trim();
    const statusFinal = formMediacao.status; // 'Concluído' | 'Em Andamento' | 'Pendente'

    const payload = {
      action: 'mediacao',
      acao: 'mediar',
      id: modalMediacao.id,
      status: statusFinal,
      mediacao: formMediacao.mediacao,
      mediador: mediadorFinal,
    };

    await salvarOcorrenciaSeguro(payload);

    // Atualiza base local com registros recentes sempre no topo
    setBancoDeDados(prev => {
      const registrosAtualizados = prev.registros.map(r =>
        r.id === modalMediacao.id
          ? {
              ...r,
              status: statusFinal,
              mediacao: formMediacao.mediacao,
              mediador: mediadorFinal,
            }
          : r
      );
      const novoDb = { ...prev, registros: ordenarOcorrenciasPorMaisRecentes(registrosAtualizados) };
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));
      return novoDb;
    });

    setEnviando(false);
    const msgSucesso =
      statusFinal === 'Em Andamento'
        ? '⏳ Ocorrência registrada e alocada na aba "Em Andamento"!'
        : statusFinal === 'Concluído'
        ? '✅ Ocorrência concluída com sucesso e movida para a aba "Concluídos"!'
        : '✅ Parecer de mediação registrado com sucesso!';

    setMensagem({ texto: msgSucesso, tipo: 'sucesso' });
    setModalMediacao(null);
    setFormMediacao({ status: 'Concluído', mediacao: '', mediador: userName });
    setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    carregarDados();
  };

  // Confirmar Exclusão de Ocorrência (Exclusivo Administrador)
  const handleConfirmarExclusaoOcorrencia = async () => {
    if (!ocorrenciaParaExcluir || !isAdmin) return;
    setExcluindoOcorrencia(true);
    try {
      await excluirOcorrenciaSeguro(ocorrenciaParaExcluir.id, bancoDeDados);

      // Atualiza base local imediatamente
      setBancoDeDados(prev => {
        const registrosAtualizados = prev.registros.filter(r => r.id !== ocorrenciaParaExcluir.id);
        const novoDb = { ...prev, registros: registrosAtualizados };
        localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));
        return novoDb;
      });

      setMensagem({
        texto: `✅ Ocorrência #${ocorrenciaParaExcluir.id} de ${ocorrenciaParaExcluir.estudante} excluída com sucesso!`,
        tipo: 'sucesso',
      });
      setOcorrenciaParaExcluir(null);
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    } catch (err: any) {
      setMensagem({ texto: 'Erro ao excluir ocorrência: ' + err.message, tipo: 'erro' });
    } finally {
      setExcluindoOcorrencia(false);
    }
  };

  // Abrir Modal de Edição de Ocorrência Registrada (somente antes da mediação)
  const abrirEdicaoOcorrencia = (r: OcorrenciaRecord) => {
    if (r.mediacao && r.mediacao.trim().length > 0) {
      setMensagem({
        texto: '🔒 Esta ocorrência já recebeu mediação da gestão escolar e não pode mais ser editada.',
        tipo: 'erro',
      });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
      return;
    }

    let dataIso = r.data;
    if (r.data && r.data.includes('/')) {
      const parts = r.data.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const ano = y.length === 2 ? `20${y}` : y;
        dataIso = `${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    setFormEdicaoOcorrencia({
      id: r.id,
      data: dataIso || todayIso,
      aula: r.aula || '',
      turma: r.turma || '',
      estudante: r.estudante || '',
      tutor: r.tutor || '',
      professor: r.professor || userName,
      ocorrencia: r.ocorrencia || '',
      medida: r.medida || '',
      auxilio: r.auxilio || 'Nenhum auxílio solicitado (Resolvido em sala)',
      descricao: r.descricao || '',
      status: r.status || 'Pendente',
      mediacao: r.mediacao || '',
      mediador: r.mediador || '',
    });
    setModalEdicaoOcorrencia(r);
  };

  // Salvar Edição da Ocorrência Registrada
  const handleSalvarEdicaoOcorrencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEdicaoOcorrencia) return;

    if (modalEdicaoOcorrencia.mediacao && modalEdicaoOcorrencia.mediacao.trim().length > 0) {
      setMensagem({
        texto: '🔒 Ação bloqueada: esta ocorrência já possui mediação da gestão escolar.',
        tipo: 'erro',
      });
      setModalEdicaoOcorrencia(null);
      return;
    }

    if (!formEdicaoOcorrencia.estudante.trim()) {
      setMensagem({ texto: '⚠️ O nome do estudante é obrigatório.', tipo: 'erro' });
      return;
    }

    if (!formEdicaoOcorrencia.descricao.trim()) {
      setMensagem({ texto: '⚠️ O relato descritivo da ocorrência é obrigatório.', tipo: 'erro' });
      return;
    }

    setSalvandoEdicaoOcorrencia(true);

    const agora = new Date();
    const diaFmt = String(agora.getDate()).padStart(2, '0') + '/' + String(agora.getMonth() + 1).padStart(2, '0') + '/' + agora.getFullYear();
    const horaFmt = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
    const editadoEmStr = `${diaFmt} às ${horaFmt}`;

    // Preserva o status original do registro (Status é de alçada exclusiva da Gestão Escolar)
    const statusPreservado =
      modalEdicaoOcorrencia.status ||
      (verificarResolvidoEmSala(formEdicaoOcorrencia.auxilio) ? 'Resolvido' : 'Pendente');

    const payload = {
      action: 'editar',
      acao: 'editar',
      id: modalEdicaoOcorrencia.id,
      data: formEdicaoOcorrencia.data,
      aula: formEdicaoOcorrencia.aula,
      turma: formEdicaoOcorrencia.turma,
      estudante: formEdicaoOcorrencia.estudante.trim(),
      tutor: formEdicaoOcorrencia.tutor.trim(),
      professor: formEdicaoOcorrencia.professor.trim(),
      ocorrencia: formEdicaoOcorrencia.ocorrencia,
      medida: formEdicaoOcorrencia.medida,
      auxilio: formEdicaoOcorrencia.auxilio,
      descricao: formEdicaoOcorrencia.descricao.trim(),
      status: statusPreservado,
      mediacao: modalEdicaoOcorrencia.mediacao || '',
      mediador: modalEdicaoOcorrencia.mediador || '',
      editadoEm: editadoEmStr,
      editadoPor: userName,
    };

    try {
      await salvarOcorrenciaSeguro(payload, bancoDeDados);

      // Atualiza base local mantendo a ordenação por mais recentes
      setBancoDeDados(prev => {
        const registrosAtualizados = prev.registros.map(r => {
          if (r.id === modalEdicaoOcorrencia.id) {
            return {
              ...r,
              ...payload,
            };
          }
          return r;
        });
        const novoDb = { ...prev, registros: ordenarOcorrenciasPorMaisRecentes(registrosAtualizados) };
        localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));
        return novoDb;
      });

      setMensagem({
        texto: `✅ Ocorrência #${modalEdicaoOcorrencia.id} (${formEdicaoOcorrencia.estudante}) atualizada com sucesso!`,
        tipo: 'sucesso',
      });
      setModalEdicaoOcorrencia(null);
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
      carregarDados();
    } catch (err: any) {
      setMensagem({ texto: 'Erro ao salvar edição: ' + err.message, tipo: 'erro' });
    } finally {
      setSalvandoEdicaoOcorrencia(false);
    }
  };

  // Formatar com IA no Modal de Edição
  const handleFormatarEdicaoDescricaoIA = async () => {
    const textoRelato = (formEdicaoOcorrencia.descricao || '').trim();
    if (!textoRelato) {
      setMensagem({
        texto: '⚠️ Digite o texto do relato para que a IA possa reformular e corrigir a gramática.',
        tipo: 'erro',
      });
      return;
    }
    setFormatandoEdicaoIA(true);
    try {
      const chaveAtiva = bancoDeDados.geminiApiKey || getStoredGeminiKey();
      const textoFormatado = await formatarRelatoComGemini(textoRelato, chaveAtiva);
      if (textoFormatado) {
        setFormEdicaoOcorrencia(prev => ({ ...prev, descricao: textoFormatado }));
        setMensagem({
          texto: '✨ Relato revisado com sucesso pelo Gemini com gramática correta e tom pedagógico!',
          tipo: 'sucesso',
        });
        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
      } else {
        throw new Error('Retorno vazio');
      }
    } catch (err: any) {
      console.warn('Erro ao formatar edição com IA:', err);
      let raw = textoRelato.charAt(0).toUpperCase() + textoRelato.slice(1);
      if (!/[.!?]$/.test(raw)) raw += '.';
      setFormEdicaoOcorrencia(prev => ({ ...prev, descricao: limparTextoFormatado(raw) }));
      setMensagem({
        texto: '⚠️ ' + (err?.message || 'Formatação padrão aplicada.'),
        tipo: 'erro',
      });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    } finally {
      setFormatandoEdicaoIA(false);
    }
  };

  // Salvar Tratativa com a Família
  const handleSalvarFamilia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalFamilia) return;
    setEnviando(true);

    const hojeBR = new Date().toLocaleDateString('pt-BR');
    const payload = {
      acao: 'tratativa_familia',
      estudante: modalFamilia.nome,
      tratativa: formFamilia.tratativa,
      mediador: userName,
    };

    await salvarOcorrenciaSeguro(payload);

    // Salva localmente
    const novaTratativa: TratativaFamilia = {
      id: `TRAT-${Date.now()}`,
      data: hojeBR,
      estudante: modalFamilia.nome,
      tratativa: formFamilia.tratativa,
      mediador: userName,
    };

    setBancoDeDados(prev => {
      const tratativas = [novaTratativa, ...prev.tratativasFamilia];
      const novoDb = { ...prev, tratativasFamilia: tratativas };
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));
      return novoDb;
    });

    setEnviando(false);
    setMensagem({
      texto: '✅ Registro de reunião e acordo com a família salvo com sucesso!',
      tipo: 'sucesso',
    });
    setModalFamilia(null);
    setFormFamilia({ tratativa: '' });
    setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    carregarDados();
  };

  // Helper para localizar o objeto completo do estudante
  const encontrarEstudante = (nomeEstudante: string, turmaEstudante?: string): Student | undefined => {
    const nomeNorm = nomeEstudante.trim().toLowerCase();
    // Procura na lista de estudantes fornecida pelas props
    let match = students.find(s => s.name.trim().toLowerCase() === nomeNorm);
    if (!match && storageService) {
      match = storageService.getStudents().find(s => s.name.trim().toLowerCase() === nomeNorm);
    }
    return match;
  };

  // Gerador de Dossiê Geral Oficial Completo (Frequência + Ocorrências + Reuniões/Tratativas)
  const abrirDossie = (aluno: {
    nome: string;
    turma: string;
    tutor: string;
    ocorrencias: OcorrenciaRecord[];
    tratativas: TratativaFamilia[];
  }) => {
    const stObj = encontrarEstudante(aluno.nome, aluno.turma);
    let freqHistory: AttendanceRecord[] = [];

    if (stObj) {
      try {
        freqHistory = storageService.getAttendanceRecords()
          .filter(r => r.studentId === stObj.id || r.studentName.toLowerCase() === aluno.nome.toLowerCase())
          .sort((a, b) => b.date.localeCompare(a.date));
      } catch (err) {
        console.warn('Erro ao carregar frequência para o dossiê:', err);
      }
    }

    // Calcula as estatísticas de ausências fielmente a partir do histórico real de registros
    let computedTotalAbsences = stObj?.totalAbsences || 0;
    let computedConsecutive = stObj?.consecutiveAbsences || 0;
    let computedRate = stObj?.attendanceRate ?? 100;

    if (freqHistory.length > 0) {
      const absenceRecs = freqHistory.filter(
        r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
      );
      computedTotalAbsences = absenceRecs.length;

      let cons = 0;
      for (const r of freqHistory) {
        if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
          cons++;
        } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
          break;
        }
      }
      computedConsecutive = cons;
      const totalDays = stObj?.totalSchoolDays || 46;
      computedRate = Math.max(0, Math.min(100, Math.round(((totalDays - computedTotalAbsences) / totalDays) * 100)));
    }

    const synchronizedStudent = stObj ? {
      ...stObj,
      totalAbsences: computedTotalAbsences,
      consecutiveAbsences: computedConsecutive,
      attendanceRate: computedRate,
    } : undefined;

    setDossieAluno({
      ...aluno,
      ocorrencias: ordenarOcorrenciasPorMaisRecentes(aluno.ocorrencias),
      estudanteObj: synchronizedStudent,
      historicoFrequencia: freqHistory,
    });
  };

  // Abrir Modal de Disparo de WhatsApp para os Pais (Exclusivo Gestão)
  const abrirWhatsAppOcorrencia = (reg: OcorrenciaRecord) => {
    if (!isGestao) return;

    const stObj = encontrarEstudante(reg.estudante, reg.turma);
    const rawPhone = stObj?.guardianPhone || '';
    const parsedPhones = getStudentPhones(rawPhone);

    const responsavelNome = stObj?.guardianName || 'Responsável Legal';
    const parentesco = stObj?.guardianRelationship || 'Família';
    const dataFmt = formatarDataBR(reg.data);

    let msg = `Olá, ${responsavelNome} (${parentesco}).\n`;
    msg += `Aqui é da Gestão Escolar da *EE Professor Arlindo Silvestre*.\n\n`;
    msg += `Informamos que no dia *${dataFmt}* (${reg.aula}), foi registrado um comunicado escolar referente ao(à) estudante *${reg.estudante}* (${reg.turma}):\n\n`;
    msg += `📌 *Ocorrência:* ${reg.ocorrencia}\n`;
    msg += `👤 *Professor(a) responsável:* ${reg.professor}\n`;
    msg += `📋 *Medida pedagógica tomada:* ${reg.medida}\n`;

    if (reg.descricao && reg.descricao.trim()) {
      msg += `📝 *Relato da aula:* "${reg.descricao.trim()}"\n`;
    }

    if (reg.mediacao && reg.mediacao.trim()) {
      msg += `🤝 *Parecer da Gestão/Coordenação:* ${reg.mediacao.trim()}\n`;
    }

    msg += `\nSolicitamos que dialogue com o(a) estudante para fortalecermos juntos a convivência escolar. Permanecemos à disposição para qualquer esclarecimento.\n\n`;
    msg += `Atenciosamente,\n*Equipe Gestora Escolar*`;

    setModalWhatsApp({
      ocorrencia: reg,
      estudanteObj: stObj,
      guardianPhones: parsedPhones.map(p => ({
        formatted: p.formatted,
        whatsAppUrl: `https://wa.me/${p.digits}?text=${encodeURIComponent(msg)}`,
        digits: p.digits,
      })),
      mensagemPadrao: msg,
    });
  };

  // --- FORMATAÇÃO INTELIGENTE DE DESCRIÇÃO COM GEMINI ---
  const handleFormatarDescricaoIA = async () => {
    const textoRelato = (form.descricao || '').trim();
    if (!textoRelato) {
      setMensagem({
        texto: '⚠️ Digite o texto do relato na descrição para que a IA possa reformular e corrigir a gramática.',
        tipo: 'erro',
      });
      return;
    }
    setFormatandoComIA(true);
    try {
      const chaveAtiva = bancoDeDados.geminiApiKey || getStoredGeminiKey();
      const textoFormatado = await formatarRelatoComGemini(textoRelato, chaveAtiva);
      if (textoFormatado) {
        setForm(prev => ({ ...prev, descricao: textoFormatado }));
        setMensagem({
          texto: '✨ Relato revisado com sucesso pelo Gemini com gramática correta e tom respeitoso aos responsáveis!',
          tipo: 'sucesso',
        });
        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
      } else {
        throw new Error('Retorno vazio');
      }
    } catch (err: any) {
      console.warn('Erro ao formatar com IA:', err);
      if (err?.message === 'CHAVE_GEMINI_AUSENTE') {
        setMensagem({
          texto: '🔑 Para formatar com IA no front-end da Vercel, informe a chave de API gratuita do Gemini.',
          tipo: 'erro',
        });
        setModalConfigurarChave(true);
      } else {
        // Fallback local: corrige primeira letra maiúscula e ponto final sem injetar opções nem títulos
        let raw = textoRelato.charAt(0).toUpperCase() + textoRelato.slice(1);
        if (!/[.!?]$/.test(raw)) {
          raw += '.';
        }
        setForm(prev => ({ ...prev, descricao: limparTextoFormatado(raw) }));
        setMensagem({
          texto: '⚠️ ' + (err?.message || 'Falha ao conectar à API do Gemini. O texto recebeu formatação padrão.'),
          tipo: 'erro',
        });
      }
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 6000);
    } finally {
      setFormatandoComIA(false);
    }
  };

  // Salvar Chave do Gemini na Nuvem (Firestore) e no Dispositivo
  const handleSalvarChaveGemini = async (chave: string) => {
    const limpa = (chave || '').trim();
    saveStoredGeminiKey(limpa);
    setChaveGeminiInput(limpa);

    const novoDb: OcorrenciasDatabase = {
      ...bancoDeDados,
      geminiApiKey: limpa,
    };
    setBancoDeDados(novoDb);
    localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

    try {
      await salvarConfigOcorrenciasSeguro({
        geminiApiKey: limpa,
        ocorrencias: bancoDeDados.ocorrencias,
        medidas: bancoDeDados.medidas,
      }, novoDb);

      setMensagem({
        texto: limpa
          ? '✅ Chave do Gemini salva com sucesso! O recurso de IA agora funciona em qualquer dispositivo e na Vercel.'
          : 'ℹ️ Chave do Gemini removida.',
        tipo: 'sucesso',
      });
      setModalConfigurarChave(false);
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
    } catch (err: any) {
      console.warn('Erro ao persistir chave no Firestore:', err);
      setMensagem({
        texto: '✅ Chave salva localmente no navegador.',
        tipo: 'sucesso',
      });
      setModalConfigurarChave(false);
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    }
  };

  // Testar Conexão com a Chave do Gemini
  const handleTestarChaveGemini = async () => {
    if (!chaveGeminiInput.trim()) {
      setResultadoTesteGemini({
        success: false,
        message: 'Por favor, cole a chave de API do Google AI Studio antes de testar.',
      });
      return;
    }
    setTestandoGemini(true);
    setResultadoTesteGemini(null);
    try {
      const res = await testarChaveGemini(chaveGeminiInput.trim());
      setResultadoTesteGemini(res);
    } catch (err: any) {
      setResultadoTesteGemini({
        success: false,
        message: err?.message || 'Erro inesperado ao testar conexão.',
      });
    } finally {
      setTestandoGemini(false);
    }
  };

  // --- FORMATAÇÃO INTELIGENTE DA MENSAGEM WHATSAPP COM GEMINI ---
  const handleFormatarWhatsAppIA = async () => {
    if (!modalWhatsApp) return;
    setFormatandoWhatsAppIA(true);
    try {
      const res = await fetch('/api/ai/format-occurrence-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: modalWhatsApp.ocorrencia.descricao || modalWhatsApp.ocorrencia.ocorrencia,
          estudante: modalWhatsApp.ocorrencia.estudante,
          turma: modalWhatsApp.ocorrencia.turma,
          ocorrencia: modalWhatsApp.ocorrencia.ocorrencia,
          medida: modalWhatsApp.ocorrencia.medida,
          professor: modalWhatsApp.ocorrencia.professor,
          aula: modalWhatsApp.ocorrencia.aula,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mensagemWhatsApp) {
          const novaMsg = data.mensagemWhatsApp;
          setModalWhatsApp(prev => {
            if (!prev) return null;
            return {
              ...prev,
              mensagemPadrao: novaMsg,
              guardianPhones: prev.guardianPhones.map(p => ({
                ...p,
                whatsAppUrl: `https://wa.me/${p.digits}?text=${encodeURIComponent(novaMsg)}`,
              })),
            };
          });
          setMensagem({
            texto: '✨ Mensagem para o WhatsApp dos responsáveis reescrita com clareza e empatia pelo Gemini!',
            tipo: 'sucesso',
          });
          setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
        }
      }
    } catch (err: any) {
      console.warn('Erro ao formatar mensagem para WhatsApp:', err);
    } finally {
      setFormatandoWhatsAppIA(false);
    }
  };

  // --- GESTÃO DE CONFIGURAÇÕES DE OCORRÊNCIAS E MEDIDAS (ADMIN) ---
  const handleAdicionarItemConfig = async (tipo: 'ocorrencia' | 'medida') => {
    const valor = novoItemConfig.trim();
    if (!valor) return;
    setSalvandoConfig(true);

    try {
      let novasOcorrencias = [...bancoDeDados.ocorrencias];
      let novasMedidas = [...bancoDeDados.medidas];

      if (tipo === 'ocorrencia') {
        if (!novasOcorrencias.includes(valor)) {
          novasOcorrencias = [...novasOcorrencias, valor];
        }
      } else if (tipo === 'medida') {
        if (!novasMedidas.includes(valor)) {
          novasMedidas = [...novasMedidas, valor];
        }
      }

      const novoDb: OcorrenciasDatabase = {
        ...bancoDeDados,
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      };

      setBancoDeDados(novoDb);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      }, novoDb);

      setNovoItemConfig('');
      setMensagem({
        texto: `✅ ${tipo === 'ocorrencia' ? 'Ocorrência principal' : 'Medida pedagógica'} cadastrada e atualizada nas opções de registro!`,
        tipo: 'sucesso',
      });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    } catch (err: any) {
      setMensagem({ texto: 'Erro ao salvar configuração: ' + err.message, tipo: 'erro' });
    } finally {
      setSalvandoConfig(false);
    }
  };

  const handleSalvarEdicaoConfig = async () => {
    if (!itemEditando) return;
    const valorNovo = itemEditando.valorNovo.trim();
    if (!valorNovo) return;
    setSalvandoConfig(true);

    try {
      let novasOcorrencias = [...bancoDeDados.ocorrencias];
      let novasMedidas = [...bancoDeDados.medidas];

      if (itemEditando.tipo === 'ocorrencia') {
        novasOcorrencias[itemEditando.index] = valorNovo;
      } else if (itemEditando.tipo === 'medida') {
        novasMedidas[itemEditando.index] = valorNovo;
      }

      const novoDb: OcorrenciasDatabase = {
        ...bancoDeDados,
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      };

      setBancoDeDados(novoDb);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      }, novoDb);

      setItemEditando(null);
      setMensagem({ texto: '✅ Alteração salva e atualizada em tempo real no formulário!', tipo: 'sucesso' });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    } catch (err: any) {
      setMensagem({ texto: 'Erro ao salvar edição: ' + err.message, tipo: 'erro' });
    } finally {
      setSalvandoConfig(false);
    }
  };

  const handleConfirmarExclusaoConfig = async () => {
    if (!itemParaExcluirConfig) return;
    setSalvandoConfig(true);

    try {
      let novasOcorrencias = [...bancoDeDados.ocorrencias];
      let novasMedidas = [...bancoDeDados.medidas];

      if (itemParaExcluirConfig.tipo === 'ocorrencia') {
        novasOcorrencias = novasOcorrencias.filter((_, idx) => idx !== itemParaExcluirConfig.index);
      } else if (itemParaExcluirConfig.tipo === 'medida') {
        novasMedidas = novasMedidas.filter((_, idx) => idx !== itemParaExcluirConfig.index);
      }

      const novoDb: OcorrenciasDatabase = {
        ...bancoDeDados,
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      };

      setBancoDeDados(novoDb);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      }, novoDb);

      setItemParaExcluirConfig(null);
      setMensagem({ texto: '✅ Item excluído com sucesso das opções de registro!', tipo: 'sucesso' });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    } catch (err: any) {
      setMensagem({ texto: 'Erro ao excluir item: ' + err.message, tipo: 'erro' });
    } finally {
      setSalvandoConfig(false);
    }
  };

  // --- GESTÃO DA GRADE DE HORÁRIOS DAS AULAS & INTERVALOS (ADMIN / GESTÃO) ---
  const handleSalvarGradeHorarios = async (novaGrade: HorarioAula[]) => {
    setSalvandoHorarios(true);
    try {
      const aulasNomes = novaGrade.filter(g => g.tipo === 'aula').map(g => g.nome);
      const novoDb: OcorrenciasDatabase = {
        ...bancoDeDados,
        gradeHorarios: novaGrade,
        aulas: aulasNomes.length > 0 ? aulasNomes : bancoDeDados.aulas,
      };

      setBancoDeDados(novoDb);
      setGradeHorarios(novaGrade);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        gradeHorarios: novaGrade,
        aulas: aulasNomes.length > 0 ? aulasNomes : bancoDeDados.aulas,
        ocorrencias: bancoDeDados.ocorrencias,
        medidas: bancoDeDados.medidas,
      }, novoDb);

      setMensagem({
        texto: '⏰ Grade de horários salva com sucesso! O sistema de auditoria de preenchimento agora avalia a pontualidade com base nesses horários exatos.',
        tipo: 'sucesso',
      });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
    } catch (err: any) {
      setMensagem({ texto: 'Erro ao salvar grade de horários: ' + err.message, tipo: 'erro' });
    } finally {
      setSalvandoHorarios(false);
    }
  };

  const handleAdicionarHorario = () => {
    const nome = novoHorarioNome.trim();
    if (!nome) {
      setMensagem({ texto: '⚠️ Digite o nome da aula ou intervalo para cadastrar.', tipo: 'erro' });
      return;
    }
    const novoItem: HorarioAula = {
      id: `H-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      nome,
      inicio: novoHorarioInicio,
      fim: novoHorarioFim,
      tipo: novoHorarioTipo,
    };
    const novaGrade = [...gradeHorarios, novoItem];
    setNovoHorarioNome('');
    handleSalvarGradeHorarios(novaGrade);
  };

  const handleRemoverHorario = (id: string) => {
    const novaGrade = gradeHorarios.filter(h => h.id !== id);
    handleSalvarGradeHorarios(novaGrade);
  };

  const handleAtualizarHorarioItem = (id: string, campo: 'nome' | 'inicio' | 'fim' | 'tipo', valor: string) => {
    const novaGrade = gradeHorarios.map(h => {
      if (h.id === id) {
        return { ...h, [campo]: valor };
      }
      return h;
    });
    setGradeHorarios(novaGrade);
  };

  const handleRestaurarGradePadrao = () => {
    if (window.confirm('Deseja restaurar a grade de horários para a tabela oficial padrão da SEDUC / PEI?')) {
      handleSalvarGradeHorarios(GRADE_HORARIOS_PADRAO);
    }
  };

  // Card de Ocorrência Reutilizável
  const OcorrenciaCard: React.FC<{
    reg: OcorrenciaRecord;
    resolvidoEmSala?: boolean;
    tipoStatus?: 'pendente' | 'em_andamento' | 'concluido';
    onMediar?: (r: OcorrenciaRecord) => void;
    permitirEditar?: boolean;
  }> = ({
    reg,
    resolvidoEmSala,
    tipoStatus,
    onMediar,
    permitirEditar = false,
  }) => {
    const concluido = tipoStatus === 'concluido' || isOcorrenciaConcluida(reg);
    const emAndamento = !concluido && (tipoStatus === 'em_andamento' || isOcorrenciaEmAndamento(reg));
    const ehResolvidoEmSala = resolvidoEmSala ?? verificarResolvidoEmSala(reg.auxilio);

    return (
      <div
        className={`bg-white p-5 rounded-2xl shadow-xs border-l-4 transition-all duration-150 ${
          concluido
            ? 'border-emerald-500'
            : emAndamento
            ? 'border-blue-500'
            : 'border-amber-500'
        } flex flex-col sm:flex-row justify-between gap-4 border-slate-200 border`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap text-xs text-slate-500">
            <span className="bg-slate-100 px-2 py-0.5 rounded-md font-mono font-bold text-slate-700">
              {reg.id}
            </span>
            <span>📅 {formatarDataBR(reg.data)}</span>
            <span className="hidden sm:inline">•</span>
            <span>🕒 {reg.aula}</span>
            <span className="hidden sm:inline">•</span>
            <span
              className={`font-bold ${ehResolvidoEmSala ? 'text-emerald-700' : 'text-rose-600'}`}
            >
              🤝 {reg.auxilio}
            </span>
            <span
              className={`ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                concluido
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : emAndamento
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {concluido ? '✅ Concluído' : emAndamento ? '⏳ Em Andamento' : '🚨 Pendente'}
            </span>
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            {reg.estudante}{' '}
            <span className="text-indigo-600 text-xs bg-indigo-50 px-2 py-0.5 rounded-md font-semibold">
              {reg.turma}
            </span>
          </h3>
          <p className="text-slate-800 mt-1 font-semibold text-sm">{reg.ocorrencia}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Lançado por: <strong>{reg.professor}</strong> (Medida: {reg.medida})
          </p>
          {reg.descricao && (
            <p className="text-xs text-slate-700 mt-2 bg-slate-50 p-2.5 rounded-lg italic border border-slate-200">
              "{reg.descricao}"
            </p>
          )}

          {reg.mediacao ? (
            <div className="mt-3 bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 text-xs">
              <p className="font-bold text-indigo-900 mb-0.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                <span>Parecer da Gestão / Mediação{reg.mediador ? ` (${reg.mediador})` : ''}:</span>
              </p>
              <p className="text-indigo-950 whitespace-pre-line">{reg.mediacao}</p>
            </div>
          ) : (
            !ehResolvidoEmSala && (
              <div className="mt-2.5 text-xs text-amber-700 italic flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Aguardando apontamento da equipe gestora...</span>
              </div>
            )
          )}

          {/* Auditoria de Data e Horário de Preenchimento pelo Professor (VISÍVEL SOMENTE PARA ADMINISTRADOR E GESTÃO/PAAC) */}
          {isGestao && (() => {
            const info = obterInfoPreenchimento(reg, gradeHorarios);
            return (
              <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200/90 text-xs flex flex-col gap-1.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="text-slate-500 font-medium">Preenchido pelo professor em:</span>
                      <strong className="text-slate-900 font-mono">{info.dataHoraFormatada}</strong>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        info.tempoDecorridoOuTipo === 'no_ato'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : info.tempoDecorridoOuTipo === 'mesmo_dia'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : info.tempoDecorridoOuTipo === 'posterior'
                          ? (info.diasDiferenca && info.diasDiferenca > 1)
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {info.tagBadge}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    <Shield className="w-3 h-3 text-indigo-500" />
                    <span>Auditoria de Gestão/PAAC</span>
                  </span>
                </div>
                {info.detalheAuditoria && (
                  <p className="text-[11px] text-slate-600 font-medium pl-5">
                    ℹ️ {info.detalheAuditoria}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 shrink-0">
          {/* Envio via WhatsApp aos Responsáveis - Restrito para Perfil de Gestão */}
          {isGestao && (
            <button
              type="button"
              onClick={() => abrirWhatsAppOcorrencia(reg)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3.5 rounded-xl text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              title="Enviar comunicado da ocorrência via WhatsApp aos responsáveis"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Enviar aos Pais</span>
            </button>
          )}

          {/* Editar Ocorrência (Exclusivo na aba 'Meus Registros' antes da mediação da gestão) */}
          {permitirEditar && (!reg.mediacao || reg.mediacao.trim() === '') && (
            <button
              type="button"
              onClick={() => abrirEdicaoOcorrencia(reg)}
              className="w-full sm:w-auto bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2 px-3.5 rounded-xl text-xs border border-indigo-200 shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              title="Editar dados desta ocorrência antes da mediação da gestão"
            >
              <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Editar</span>
            </button>
          )}

          {onMediar && (
            <button
              type="button"
              onClick={() => onMediar(reg)}
              className={`w-full sm:w-auto text-white font-bold py-2 px-4 rounded-xl text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                concluido
                  ? 'bg-slate-800 hover:bg-slate-900'
                  : emAndamento
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              <span>
                {concluido
                  ? 'Ver / Atualizar Parecer'
                  : emAndamento
                  ? 'Atualizar Andamento / Concluir'
                  : 'Registrar Mediação'}
              </span>
            </button>
          )}

          {/* Excluir Ocorrência - Exclusivo Administrador */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setOcorrenciaParaExcluir(reg)}
              className="w-full sm:w-auto bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2 px-3 rounded-xl text-xs border border-rose-200 shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              title="Excluir ocorrência do banco de dados (Exclusivo Administrador)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Excluir</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  // Renderização do Formulário de Registro
  const renderFormularioRegistro = () => (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
            Data da Ocorrência
          </label>
          <input
            type="date"
            name="data"
            value={form.data}
            onChange={handleChange}
            required
            className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
            <span>Professor(a) Relator(a)</span>
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
              <Lock className="w-3 h-3 text-slate-500" />
              <span>Login do Docente (Não editável)</span>
            </span>
          </label>
          <div className="flex items-center gap-2 p-2 bg-slate-100/90 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-inner">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0">
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 truncate">
              <span className="text-slate-900">{userName}</span>
              <span className="ml-2 text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                Usuário Autenticado
              </span>
            </div>
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Turma</label>
          <select
            name="turma"
            value={form.turma}
            onChange={handleChange}
            required
            className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800"
          >
            <option value="">Selecione a turma...</option>
            {turmasUnicas.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
            Estudantes Envolvidos
          </label>
          {!form.turma ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 text-xs">
              Selecione a turma primeiro para listar os estudantes...
            </div>
          ) : (
            <div className="border border-slate-300 rounded-xl overflow-hidden flex flex-col">
              <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700">
                  {form.estudantes.length} de {alunosDaTurma.length} selecionado(s)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (form.estudantes.length === alunosDaTurma.length) {
                      setForm(p => ({ ...p, estudantes: [] }));
                    } else {
                      const dataFmtBusca = formatarDataBR(form.data || todayIso);
                      const alunosComOcorrencia: Array<{ nome: string; lista: OcorrenciaRecord[] }> =
                        [];

                      alunosDaTurma.forEach(a => {
                        const ocorrenciasHoje = bancoDeDados.registros.filter(
                          r => r.estudante === a.nome && formatarDataBR(r.data) === dataFmtBusca
                        );
                        if (ocorrenciasHoje.length > 0) {
                          alunosComOcorrencia.push({ nome: a.nome, lista: ocorrenciasHoje });
                        }
                      });

                      if (alunosComOcorrencia.length > 0) {
                        setAlertaOcorrencia({
                          dataFmt: dataFmtBusca,
                          alunos: alunosComOcorrencia,
                        });
                      }

                      setForm(p => ({
                        ...p,
                        estudantes: alunosDaTurma.map(a => ({ nome: a.nome, tutor: a.tutor })),
                      }));
                    }
                  }}
                  className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  {form.estudantes.length === alunosDaTurma.length
                    ? 'Desmarcar Todos'
                    : 'Selecionar Todos'}
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto p-2 space-y-1">
                {alunosDaTurma.map(a => {
                  const isChecked = form.estudantes.some(e => e.nome === a.nome);
                  return (
                    <label
                      key={a.nome}
                      className="flex items-center space-x-3 p-2 hover:bg-indigo-50/70 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          const checked = e.target.checked;
                          if (checked) {
                            const dataFmtBusca = formatarDataBR(form.data || todayIso);
                            const ocorrenciasHoje = bancoDeDados.registros.filter(
                              r => r.estudante === a.nome && formatarDataBR(r.data) === dataFmtBusca
                            );

                            if (ocorrenciasHoje.length > 0) {
                              setAlertaOcorrencia({
                                dataFmt: dataFmtBusca,
                                alunos: [{ nome: a.nome, lista: ocorrenciasHoje }],
                              });
                            }

                            setForm(p => ({
                              ...p,
                              estudantes: [...p.estudantes, { nome: a.nome, tutor: a.tutor }],
                            }));
                          } else {
                            setForm(p => ({
                              ...p,
                              estudantes: p.estudantes.filter(est => est.nome !== a.nome),
                            }));
                          }
                        }}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span
                        className={`text-xs ${
                          isChecked ? 'font-black text-indigo-900' : 'text-slate-700 font-medium'
                        }`}
                      >
                        {a.nome}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Aula</label>
          <select
            name="aula"
            value={form.aula}
            onChange={handleChange}
            required
            className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800"
          >
            <option value="">Selecione o horário/aula...</option>
            {bancoDeDados.aulas.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
            Necessita Auxílio da Gestão?
          </label>
          <select
            name="auxilio"
            value={form.auxilio}
            onChange={handleChange}
            required
            className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800"
          >
            {bancoDeDados.auxilio.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
          Ocorrência Principal
        </label>
        <select
          name="ocorrencia"
          value={form.ocorrencia}
          onChange={handleChange}
          required
          className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800"
        >
          <option value="">Selecione a infração principal...</option>
          {bancoDeDados.ocorrencias.map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
          Medida Tomada no Momento pelo Professor
        </label>
        <select
          name="medida"
          value={form.medida}
          onChange={handleChange}
          required
          className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800"
        >
          <option value="">Selecione a ação disciplinar imediata...</option>
          {bancoDeDados.medidas.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-bold text-slate-700 uppercase">
            Descrição / Relato Detalhado <span className="text-rose-600 font-extrabold">* (Obrigatório)</span>
          </label>
          <button
            type="button"
            onClick={handleFormatarDescricaoIA}
            disabled={formatandoComIA}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Ajusta o texto com IA do Gemini para uma linguagem formal, correta e clara para os responsáveis"
          >
            {formatandoComIA ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Formatando com IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>✨ Formatar com IA (Gemini)</span>
              </>
            )}
          </button>
        </div>
        <textarea
          name="descricao"
          value={form.descricao}
          onChange={handleChange}
          required
          rows={3}
          placeholder="Descreva o relato detalhado da ocorrência (obrigatório). Em seguida, você pode clicar em '✨ Formatar com IA' para revisar a gramática e o tom respeitoso..."
          className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden text-slate-800 font-medium bg-white"
        />
        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-500" />
          <span>A IA Gemini formata o relato de forma formal, clara e acessível para envio aos responsáveis via WhatsApp.</span>
        </p>
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        <span>{enviando ? 'Salvando Ocorrência na Nuvem...' : 'Salvar Ocorrência Oficial'}</span>
      </button>
    </form>
  );

  // Painel Estratégico (Estatísticas Globais)
  const renderEstatisticasGlobais = () => {
    const registros = bancoDeDados.registros;
    if (registros.length === 0) {
      return (
        <div className="text-center p-12 bg-white rounded-2xl shadow-xs border border-slate-200 text-slate-500">
          <BookOpen className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm">Sem dados suficientes para gerar relatórios.</p>
          <p className="text-xs text-slate-400 mt-1">
            Lance a primeira ocorrência para alimentar os gráficos.
          </p>
        </div>
      );
    }

    const autonomiaPorProf: Record<string, { resSala: number; encGestao: number; total: number }> =
      {};
    let encGestaoGeral = 0;
    let resSalaGeral = 0;

    registros.forEach(r => {
      const prof = r.professor || 'Desconhecido';
      if (!autonomiaPorProf[prof])
        autonomiaPorProf[prof] = { resSala: 0, encGestao: 0, total: 0 };

      if (verificarResolvidoEmSala(r.auxilio)) {
        autonomiaPorProf[prof].resSala++;
        resSalaGeral++;
      } else {
        autonomiaPorProf[prof].encGestao++;
        encGestaoGeral++;
      }
      autonomiaPorProf[prof].total++;
    });

    const listaAutonomia = Object.entries(autonomiaPorProf).sort(
      (a, b) => b[1].total - a[1].total
    );

    const totalAux = encGestaoGeral + resSalaGeral;
    const pctSalaGeral = totalAux > 0 ? Math.round((resSalaGeral / totalAux) * 100) : 0;
    const pctGestaoGeral = totalAux > 0 ? Math.round((encGestaoGeral / totalAux) * 100) : 0;

    const contTurmas: Record<string, number> = {};
    registros.forEach(r => {
      if (r.turma) contTurmas[r.turma] = (contTurmas[r.turma] || 0) + 1;
    });
    const topTurmas = Object.entries(contTurmas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const contAlunos: Record<string, number> = {};
    registros.forEach(r => {
      if (r.estudante) contAlunos[r.estudante] = (contAlunos[r.estudante] || 0) + 1;
    });
    const topAlunos = Object.entries(contAlunos)
      .sort((a, b) => b[1] - a[1])
      .filter(a => a[1] > 1)
      .slice(0, 5);

    const contAulas: Record<string, number> = {};
    registros.forEach(r => {
      if (r.aula) contAulas[r.aula] = (contAulas[r.aula] || 0) + 1;
    });
    const topAulas = Object.entries(contAulas).sort((a, b) => b[1] - a[1]);

    const contOcorrencias: Record<string, number> = {};
    const contMedidas: Record<string, number> = {};
    registros.forEach(r => {
      if (r.ocorrencia) contOcorrencias[r.ocorrencia] = (contOcorrencias[r.ocorrencia] || 0) + 1;
      if (r.medida) contMedidas[r.medida] = (contMedidas[r.medida] || 0) + 1;
    });
    const topOcorrencias = Object.entries(contOcorrencias)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
    const topMedidas = Object.entries(contMedidas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-black text-slate-900">Painel Estratégico & Clima Escolar</h2>
          <p className="text-xs text-slate-500 font-medium">
            Diagnóstico consolidado com base em <strong>{registros.length}</strong> registro(s).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col justify-center items-center">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Total de Ocorrências
            </p>
            <p className="text-4xl font-black text-indigo-600 mt-2">{registros.length}</p>

            <div className="w-full mt-6 pt-5 border-t border-slate-100 text-center">
              <h3 className="text-[11px] font-bold text-slate-700 uppercase mb-2">
                Autonomia Geral da Equipe
              </h3>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-emerald-700">Resolvidos em Sala: {pctSalaGeral}%</span>
                <span className="text-rose-600">Gestão: {pctGestaoGeral}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 flex overflow-hidden">
                <div
                  className="bg-emerald-500 h-2.5 transition-all"
                  style={{ width: `${pctSalaGeral}%` }}
                />
                <div
                  className="bg-rose-500 h-2.5 transition-all"
                  style={{ width: `${pctGestaoGeral}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 md:col-span-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Autonomia Docente (Por Professor)
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Proporção de casos resolvidos em sala (Verde) vs. Encaminhados à Gestão (Vermelho)
            </p>

            <div className="overflow-y-auto max-h-48 pr-2 space-y-3">
              {listaAutonomia.map(([prof, stats]) => {
                const pctS = Math.round((stats.resSala / stats.total) * 100);
                const pctG = Math.round((stats.encGestao / stats.total) * 100);
                return (
                  <div key={prof}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-slate-800 truncate pr-2">
                        {prof}{' '}
                        <span className="font-normal text-slate-500">({stats.total} reg.)</span>
                      </span>
                      <span className="text-slate-500">
                        <span className="text-emerald-700">{pctS}%</span> /{' '}
                        <span className="text-rose-600">{pctG}%</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 flex overflow-hidden">
                      {pctS > 0 && (
                        <div
                          className="bg-emerald-500 h-2.5 transition-all"
                          style={{ width: `${pctS}%` }}
                        />
                      )}
                      {pctG > 0 && (
                        <div
                          className="bg-rose-500 h-2.5 transition-all"
                          style={{ width: `${pctG}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Mapa de Horários Quentes</span>
            </h3>
            {topAulas.map(([aula, qtd]) => {
              const pct = Math.round((qtd / registros.length) * 100);
              return (
                <div key={aula} className="mb-2.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span className="truncate pr-2">{aula}</span>
                    <span className="font-bold text-amber-600">{qtd} reg.</span>
                  </div>
                  <div className="w-full bg-amber-50 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-500 h-2 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-200 border-t-4 border-t-rose-500">
            <h3 className="text-sm font-bold text-rose-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Alerta de Reincidência (Alunos)</span>
            </h3>
            {topAlunos.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Nenhum estudante com mais de 1 ocorrência registrada.
              </p>
            ) : (
              <ul className="space-y-2">
                {topAlunos.map(([aluno, qtd], index) => (
                  <li
                    key={aluno}
                    className="flex justify-between items-center p-2.5 bg-rose-50 rounded-xl border border-rose-100 text-xs"
                  >
                    <span className="font-bold text-rose-950 truncate">
                      <span className="text-rose-400 mr-2">#{index + 1}</span>
                      {aluno}
                    </span>
                    <span className="bg-rose-500 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                      {qtd} registros
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Principais Infrações</h3>
            {topOcorrencias.map(([nome, qtd]) => (
              <div
                key={nome}
                className="flex justify-between text-xs mb-2 border-b border-slate-100 pb-1"
              >
                <span className="truncate pr-2 text-slate-600">{nome}</span>
                <span className="font-bold text-slate-900">{qtd}</span>
              </div>
            ))}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Medidas Docentes Tomadas</h3>
            {topMedidas.map(([nome, qtd]) => (
              <div
                key={nome}
                className="flex justify-between text-xs mb-2 border-b border-slate-100 pb-1"
              >
                <span className="truncate pr-2 text-slate-600">{nome}</span>
                <span className="font-bold text-indigo-600">{qtd}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Consulta e Impressão de Dossiê
  const renderConsultaImpressao = () => {
    const busca = termoBusca.toLowerCase().trim();
    const ocorrenciasPorAluno: Record<
      string,
      {
        nome: string;
        turma: string;
        tutor: string;
        ocorrencias: OcorrenciaRecord[];
        tratativas: TratativaFamilia[];
      }
    > = {};

    bancoDeDados.registros.forEach(r => {
      if (
        !busca ||
        r.estudante.toLowerCase().includes(busca) ||
        r.id.toLowerCase().includes(busca) ||
        (r.turma && r.turma.toLowerCase().includes(busca))
      ) {
        if (!ocorrenciasPorAluno[r.estudante]) {
          const tutorDoAluno =
            bancoDeDados.estudantes.find(e => e.nome === r.estudante)?.tutor || 'Sem Tutor';
          ocorrenciasPorAluno[r.estudante] = {
            nome: r.estudante,
            turma: r.turma,
            tutor: tutorDoAluno,
            ocorrencias: [],
            tratativas: [],
          };
        }
        ocorrenciasPorAluno[r.estudante].ocorrencias.push(r);
      }
    });

    (bancoDeDados.tratativasFamilia || []).forEach(t => {
      if (!busca || t.estudante.toLowerCase().includes(busca)) {
        if (!ocorrenciasPorAluno[t.estudante]) {
          const alunoDb = bancoDeDados.estudantes.find(e => e.nome === t.estudante);
          ocorrenciasPorAluno[t.estudante] = {
            nome: t.estudante,
            turma: alunoDb ? alunoDb.turma : '',
            tutor: alunoDb ? alunoDb.tutor : 'Sem Tutor',
            ocorrencias: [],
            tratativas: [],
          };
        }
      }
    });

    const listaAlunos = Object.values(ocorrenciasPorAluno).sort((a, b) =>
      a.nome.localeCompare(b.nome)
    );
    listaAlunos.forEach(alunoItem => {
      // Ocorrências do aluno em ordem cronológica decrescente (mais recentes primeiro)
      alunoItem.ocorrencias = ordenarOcorrenciasPorMaisRecentes(alunoItem.ocorrencias);
      alunoItem.tratativas = (bancoDeDados.tratativasFamilia || [])
        .filter(t => t.estudante.trim().toLowerCase() === alunoItem.nome.trim().toLowerCase())
        .sort((a, b) => parseDataOcorrenciaToTimestamp(b.data) - parseDataOcorrenciaToTimestamp(a.data));
    });

    const listaExibicao = busca ? listaAlunos : listaAlunos.slice(0, 15);

    return (
      <div className="space-y-4">
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-600" />
            <span>Buscar Dossiê do Estudante</span>
          </h3>
          <input
            type="text"
            placeholder="Digite o nome do estudante, turma ou código da ocorrência..."
            value={termoBusca}
            onChange={e => setTermoBusca(e.target.value)}
            className="w-full p-3 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-indigo-50/30 text-xs font-medium"
          />
        </div>

        {listaExibicao.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500">
            <Inbox className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-xs">
              Nenhum estudante com ocorrências ou tratativas localizado.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {listaExibicao.map(aluno => (
              <div
                key={aluno.nome}
                className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden"
              >
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      {aluno.nome}{' '}
                      <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-md font-semibold">
                        {aluno.turma}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Total de <strong>{aluno.ocorrencias.length}</strong> ocorrência(s) e{' '}
                      <strong>{aluno.tratativas.length}</strong> reunião(ões) com a família.
                    </p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setModalFamilia(aluno)}
                      className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-3.5 rounded-xl shadow-xs text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Reunião Família</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirDossie(aluno)}
                      className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-3.5 rounded-xl shadow-xs text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Dossiê PDF</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-bold text-xs text-slate-700 border-b border-slate-200 pb-2 mb-2">
                      Histórico de Infrações ({aluno.ocorrencias.length}) — Mais Recentes Primeiro
                    </h4>
                    {aluno.ocorrencias.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        Sem ocorrências registradas para este estudante.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {aluno.ocorrencias.map(o => (
                          <div
                            key={o.id}
                            className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs"
                          >
                            <div className="flex justify-between font-bold text-slate-600 mb-1">
                              <span>
                                📅 {formatarDataBR(o.data)} ({o.aula})
                              </span>
                              <span
                                className={
                                  o.status === 'Resolvido' ? 'text-emerald-700' : 'text-amber-600'
                                }
                              >
                                {o.status}
                              </span>
                            </div>
                            <p className="text-slate-900 font-semibold">{o.ocorrencia}</p>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              Ação: {o.medida} (Prof: {o.professor})
                            </p>
                            {o.descricao && (
                              <p className="text-[11px] text-slate-600 mt-1.5 bg-white p-2 rounded-lg italic border border-slate-200">
                                "{o.descricao}"
                              </p>
                            )}
                            {o.mediacao && (
                              <div className="mt-1.5 bg-indigo-50 p-2 rounded-lg border border-indigo-100 text-[11px]">
                                <p className="font-bold text-indigo-900">📋 Parecer Gestão:</p>
                                <p className="text-indigo-950 whitespace-pre-line">{o.mediacao}</p>
                              </div>
                            )}

                            {/* Auditoria de Preenchimento (VISÍVEL SOMENTE PARA ADMINISTRADOR E GESTÃO/PAAC) */}
                            {isGestao && (() => {
                              const info = obterInfoPreenchimento(o, gradeHorarios);
                              return (
                                <div className="mt-1.5 p-2 bg-slate-100/90 rounded-lg border border-slate-200 text-[10px] space-y-1">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <span className="text-slate-600 font-medium">
                                      🕒 Preenchido pelo prof: <strong className="text-slate-900 font-mono">{info.dataHoraFormatada}</strong>
                                    </span>
                                    <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
                                      info.tempoDecorridoOuTipo === 'no_ato'
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : info.tempoDecorridoOuTipo === 'posterior'
                                        ? (info.diasDiferenca && info.diasDiferenca > 1)
                                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}>
                                      {info.tagBadge}
                                    </span>
                                  </div>
                                  {info.detalheAuditoria && (
                                    <p className="text-[10px] text-slate-500 font-mono">
                                      {info.detalheAuditoria}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}

                            {(isGestao || isAdmin) && (
                              <div className="mt-2 pt-1.5 border-t border-slate-200 flex justify-end items-center gap-2 flex-wrap">
                                {isGestao && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => abrirWhatsAppOcorrencia(o)}
                                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors"
                                      title="Enviar este registro via WhatsApp aos responsáveis"
                                    >
                                      <Phone className="w-3 h-3 text-emerald-600" />
                                      <span>WhatsApp Responsáveis</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => abrirMediacao(o)}
                                      className="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1 cursor-pointer transition-colors"
                                      title="Mediar ou atualizar parecer desta ocorrência"
                                    >
                                      <Shield className="w-3 h-3 text-amber-600" />
                                      <span>{o.mediacao ? 'Editar Mediação' : 'Mediar'}</span>
                                    </button>
                                  </>
                                )}
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => setOcorrenciaParaExcluir(o)}
                                    className="text-[11px] font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Excluir ocorrência (Exclusivo Administrador)"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-600" />
                                    <span>Excluir</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-xs text-indigo-900 border-b border-indigo-200 pb-2 mb-2">
                      Tratativas com a Família ({aluno.tratativas.length})
                    </h4>
                    {aluno.tratativas.length === 0 ? (
                      <div className="bg-indigo-50/50 p-4 rounded-xl text-center border border-indigo-100">
                        <p className="text-xs text-indigo-700 italic">
                          Nenhum registro oficial de reunião com a família até o momento.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {aluno.tratativas.map((t, idx) => (
                          <div
                            key={t.id || idx}
                            className="bg-white p-2.5 rounded-xl border-l-4 border-indigo-500 shadow-2xs border-slate-200 border text-xs"
                          >
                            <p className="font-bold text-indigo-900 mb-0.5">
                              {t.data} — Mediador: {t.mediador}
                            </p>
                            <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                              {t.tratativa}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Meus Registros: Ocorrências lançadas pelo usuário atual que AINDA NÃO POSSUEM MEDIAÇÃO da gestão
  // SOMENTE AQUI É PERMITIDO EDITAR A OCORRÊNCIA!
  const renderMeusRegistros = () => {
    return (
      <div className="space-y-4">
        <div className="bg-indigo-50/80 border border-indigo-200 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-indigo-950 flex items-center gap-2">
                <span>Meus Registros</span>
                <span className="bg-indigo-200 text-indigo-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                  {meusRegistrosSemMediacao.length} pendente(s) de mediação
                </span>
              </h2>
              <p className="text-xs text-indigo-800 mt-0.5">
                Ocorrências registradas por <strong>{userName}</strong> que ainda aguardam atendimento da gestão.
              </p>
            </div>
          </div>
          <div className="text-[11px] text-indigo-900 bg-white/90 px-3 py-2 rounded-xl border border-indigo-200 font-medium">
            ✏️ <strong>Edição Habilitada:</strong> Você pode editar qualquer dado enquanto a Gestão não registrar o parecer.
          </div>
        </div>

        {meusRegistrosSemMediacao.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-1" />
            <p className="font-bold text-sm text-slate-800">
              Nenhuma ocorrência pendente de mediação!
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Todas as ocorrências registradas por você já receberam devolutiva da equipe gestora (disponíveis na aba <strong>Minhas Devolutivas</strong>) ou você ainda não realizou novos lançamentos.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {meusRegistrosSemMediacao.map(reg => (
              <OcorrenciaCard
                key={reg.id}
                reg={reg}
                resolvidoEmSala={verificarResolvidoEmSala(reg.auxilio)}
                permitirEditar={true}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Minhas Devolutivas: Ocorrências com parecer/mediação oficial já registrado pela gestão
  // AQUI A EDIÇÃO É BLOQUEADA PORQUE A GESTÃO JÁ MEDIOU/INTERVEIO!
  const renderMinhasDevolutivas = () => {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50/80 border border-emerald-200 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-emerald-950 flex items-center gap-2">
                <span>Minhas Devolutivas & Mediações</span>
                <span className="bg-emerald-200 text-emerald-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                  {minhasDevolutivasComMediacao.length} atendida(s)
                </span>
              </h2>
              <p className="text-xs text-emerald-800 mt-0.5">
                Ocorrências de <strong>{userName}</strong> que já receberam parecer oficial e tratativa da gestão escolar.
              </p>
            </div>
          </div>
          <div className="text-[11px] text-emerald-900 bg-white/90 px-3 py-2 rounded-xl border border-emerald-200 font-medium">
            🔒 <strong>Mediação Concluída:</strong> O registro recebeu intervenção oficial da gestão e não permite mais alteração.
          </div>
        </div>

        {minhasDevolutivasComMediacao.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500 space-y-2">
            <Clock className="w-10 h-10 text-amber-500 mx-auto mb-1" />
            <p className="font-bold text-sm text-slate-800">
              Ainda não há devolutivas registradas pela equipe gestora.
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Assim que a coordenação ou direção registrar o parecer e as providências tomadas para suas ocorrências, elas migrarão automaticamente para cá.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {minhasDevolutivasComMediacao.map(reg => (
              <OcorrenciaCard
                key={reg.id}
                reg={reg}
                resolvidoEmSala={verificarResolvidoEmSala(reg.auxilio)}
                permitirEditar={false}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Meus Tutorados (Ocorrências mais recentes em primeiro lugar)
  const renderMeusTutorados = () => {
    const meus = bancoDeDados.estudantes
      .filter(e => e.tutor.toLowerCase() === userName.toLowerCase())
      .sort((a, b) => a.nome.localeCompare(b.nome));

    if (meus.length === 0) {
      return (
        <div className="bg-white p-8 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500 text-xs">
          <p className="font-bold">Você não possui estudantes vinculados à sua tutoria na base.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          Acompanhamento de Tutorados ({meus.length})
        </h2>
        <div className="grid gap-3">
          {meus.map(aluno => {
            const ocorrenciasDoAluno = ordenarOcorrenciasPorMaisRecentes(
              bancoDeDados.registros.filter(r => r.estudante.trim().toLowerCase() === aluno.nome.trim().toLowerCase())
            );
            const qtd = ocorrenciasDoAluno.length;
            const isExpandido = tutoradosExpandidos[aluno.nome];

            return (
              <div
                key={aluno.nome}
                className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden"
              >
                <div className="p-4 flex justify-between items-center gap-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">
                      {aluno.nome}{' '}
                      <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs">
                        {aluno.turma}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {qtd} ocorrência(s) registrada(s)
                    </p>
                  </div>

                  {qtd > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setTutoradosExpandidos(p => ({ ...p, [aluno.nome]: !p[aluno.nome] }))
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      {isExpandido ? 'Ocultar' : 'Ver Histórico'}
                    </button>
                  )}
                </div>

                {isExpandido && qtd > 0 && (
                  <div className="bg-slate-50 p-4 border-t border-slate-200 space-y-2">
                    {ocorrenciasDoAluno.map(reg => (
                      <OcorrenciaCard
                        key={reg.id}
                        reg={reg}
                        resolvidoEmSala={verificarResolvidoEmSala(reg.auxilio)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Painel de Gestão do Administrador (Ocorrências Principais e Medidas Pedagógicas)
  const renderPainelAdminConfig = () => {
    const listaOcorrencias = bancoDeDados.ocorrencias || [];
    const listaMedidas = bancoDeDados.medidas || [];

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-black text-slate-900">
                  Painel de Configurações & Grade de Horários (Admin & Gestão/PAAC)
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastre e edite a grade de horários das aulas/intervalos para auditoria de pontualidade, além de motivos de ocorrência e medidas pedagógicas.
              </p>
            </div>
            <span className="self-start sm:self-auto bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold px-2.5 py-1 rounded-lg">
              🛡️ {isAdmin ? 'Modo Administrador' : 'Modo Gestão / PAAC'}
            </span>
          </div>

          {/* Banner Informativo: Turmas e Estudantes Integrados Exclusivamente do Busca Ativa */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-4 mb-6 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <span>Turmas e Estudantes Integrados Exclusivamente do Busca Ativa</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  Sincronização Oficial Ativa
                </span>
              </h4>
              <p className="text-xs text-indigo-900/90 leading-relaxed mt-1">
                Todas as <strong>{turmasUnicas.length} turmas</strong> disponíveis para registro de ocorrências e os estudantes correspondentes são carregados exclusivamente a partir do cadastro oficial do Sistema de Busca Ativa Escolar. Para adicionar ou alterar turmas e alunos, utilize o módulo principal de Cadastro de Turmas e Estudantes.
              </p>
            </div>
          </div>

          {/* Sub-abas do Painel Admin */}
          <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => { setAbaAdminConfig('ocorrencias'); setNovoItemConfig(''); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaAdminConfig === 'ocorrencias'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>⚠️ Ocorrência Principal (Motivos)</span>
              <span className="bg-black/20 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {listaOcorrencias.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setAbaAdminConfig('medidas'); setNovoItemConfig(''); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaAdminConfig === 'medidas'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>⚖️ Medidas Pedagógicas Tomadas</span>
              <span className="bg-black/20 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {listaMedidas.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setAbaAdminConfig('horarios'); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaAdminConfig === 'horarios'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>⏰ Grade de Horários (Aulas & Intervalos)</span>
              <span className="bg-black/20 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {gradeHorarios.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setAbaAdminConfig('ia_gemini'); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaAdminConfig === 'ia_gemini'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🤖 Inteligência Artificial (Google Gemini)</span>
              {bancoDeDados.geminiApiKey || getStoredGeminiKey() ? (
                <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                  Ativa
                </span>
              ) : (
                <span className="bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                  Configurar
                </span>
              )}
            </button>
          </div>

          {/* Painel de Configuração da IA Gemini (Vercel / Nuvem / Local) */}
          {abaAdminConfig === 'ia_gemini' && (
            <div className="space-y-4">
              <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Sparkles className="w-5 h-5 text-amber-300" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-purple-950 flex items-center gap-2">
                      <span>Configuração da Chave do Google Gemini (IA)</span>
                      {bancoDeDados.geminiApiKey || getStoredGeminiKey() ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Conectada
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Pendente
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-purple-900/80 leading-relaxed">
                      Para que o botão <strong>"Formatar com IA"</strong> funcione no front-end da <strong>Vercel</strong>, no computador ou no celular dos professores com custo zero, salve aqui a sua chave de API gratuita obtida no <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="underline font-bold text-purple-700 hover:text-purple-900 inline-flex items-center gap-0.5">Google AI Studio <ExternalLink className="w-3 h-3 inline" /></a>.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <label className="block text-xs font-bold text-purple-950 uppercase tracking-wider">
                    Chave de API do Gemini (Google AI Studio)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type={mostrarChave ? 'text' : 'password'}
                        value={chaveGeminiInput}
                        onChange={e => setChaveGeminiInput(e.target.value)}
                        placeholder="Ex: AIzaSy..."
                        className="w-full p-2.5 pr-10 text-xs border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden font-mono bg-white text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarChave(!mostrarChave)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={mostrarChave ? 'Ocultar chave' : 'Mostrar chave'}
                      >
                        {mostrarChave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={testandoGemini || !chaveGeminiInput.trim()}
                      onClick={handleTestarChaveGemini}
                      className="px-4 py-2.5 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {testandoGemini ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Testando...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-purple-700" />
                          <span>Testar Chave</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSalvarChaveGemini(chaveGeminiInput)}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvar para Todos</span>
                    </button>
                  </div>

                  {/* Feedback do Teste */}
                  {resultadoTesteGemini && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs animate-in fade-in ${
                        resultadoTesteGemini.success
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold mb-1">
                        {resultadoTesteGemini.success ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                        )}
                        <span>{resultadoTesteGemini.message}</span>
                      </div>
                      {resultadoTesteGemini.formattedSample && (
                        <div className="mt-2 p-2.5 bg-white rounded-lg border border-emerald-200 text-[11px] text-slate-800 font-medium">
                          <strong>Exemplo reformulado pelo Gemini:</strong> "{resultadoTesteGemini.formattedSample}"
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-purple-900/70 border-t border-purple-200/60">
                    <span>💡 A chave é salva de forma criptografada no Firebase e compartilhada com segurança entre os professores.</span>
                    {bancoDeDados.geminiApiKey && (
                      <button
                        type="button"
                        onClick={() => handleSalvarChaveGemini('')}
                        className="text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                      >
                        Remover chave salva
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Painel de Configuração da Grade de Horários (Aulas e Intervalos) */}
          {abaAdminConfig === 'horarios' && (
            <div className="space-y-6">
              {/* Banner Explicativo */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Clock className="w-5 h-5 text-indigo-100" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                    <span>Grade de Horários das Aulas & Intervalos Escolares</span>
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      Auditoria Ativa
                    </span>
                  </h3>
                  <p className="text-xs text-indigo-900/80 leading-relaxed">
                    Cadastre o horário exato de início e término de cada aula ou intervalo. O sistema utiliza esses horários para comparar o instante em que o professor submete a ocorrência e indicar para a gestão se o relato foi realizado <strong>no ato da aula</strong>, <strong>minutos/horas após no mesmo dia</strong> ou <strong>dias depois</strong>.
                  </p>
                </div>
              </div>

              {/* Form para Cadastrar Novo Horário */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Cadastrar Novo Período / Aula / Intervalo</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Identificação / Nome
                    </label>
                    <input
                      type="text"
                      value={novoHorarioNome}
                      onChange={e => setNovoHorarioNome(e.target.value)}
                      placeholder="Ex: 10ª Aula, Intervalo da Tarde..."
                      className="w-full p-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-medium bg-white text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Horário Início
                    </label>
                    <input
                      type="time"
                      value={novoHorarioInicio}
                      onChange={e => setNovoHorarioInicio(e.target.value)}
                      className="w-full p-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono font-bold bg-white text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Horário Término
                    </label>
                    <input
                      type="time"
                      value={novoHorarioFim}
                      onChange={e => setNovoHorarioFim(e.target.value)}
                      className="w-full p-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono font-bold bg-white text-slate-800"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="novoHorarioTipo"
                        checked={novoHorarioTipo === 'aula'}
                        onChange={() => setNovoHorarioTipo('aula')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Aula Regular</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="novoHorarioTipo"
                        checked={novoHorarioTipo === 'intervalo'}
                        onChange={() => setNovoHorarioTipo('intervalo')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Intervalo / Recreio / Almoço</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={salvandoHorarios || !novoHorarioNome.trim()}
                    onClick={handleAdicionarHorario}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar à Grade</span>
                  </button>
                </div>
              </div>

              {/* Tabela de Horários Cadastrados */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Grade Atual de Horários ({gradeHorarios.length} períodos)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={salvandoHorarios}
                      onClick={handleRestaurarGradePadrao}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      title="Restaura os horários oficiais para a grade padrão SEDUC/PEI"
                    >
                      🔄 Restaurar Padrão SEDUC
                    </button>
                    <button
                      type="button"
                      disabled={salvandoHorarios}
                      onClick={() => handleSalvarGradeHorarios(gradeHorarios)}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{salvandoHorarios ? 'Salvando...' : 'Salvar Grade'}</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                      <tr>
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3">Nome / Período</th>
                        <th className="p-3 w-32">Tipo</th>
                        <th className="p-3 w-32 text-center">Início</th>
                        <th className="p-3 w-32 text-center">Término</th>
                        <th className="p-3 w-20 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {gradeHorarios.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 text-center font-mono font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.nome}
                              onChange={e => handleAtualizarHorarioItem(item.id, 'nome', e.target.value)}
                              className="w-full p-1.5 text-xs border border-slate-200 rounded-lg font-bold text-slate-800 bg-white"
                            />
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                                item.tipo === 'aula'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {item.tipo === 'aula' ? 'Aula Regular' : 'Intervalo'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="time"
                              value={item.inicio}
                              onChange={e => handleAtualizarHorarioItem(item.id, 'inicio', e.target.value)}
                              className="p-1.5 text-xs border border-slate-200 rounded-lg font-mono font-bold text-slate-800 bg-white text-center w-24"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="time"
                              value={item.fim}
                              onChange={e => handleAtualizarHorarioItem(item.id, 'fim', e.target.value)}
                              className="p-1.5 text-xs border border-slate-200 rounded-lg font-mono font-bold text-slate-800 bg-white text-center w-24"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoverHorario(item.id)}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                              title="Excluir período da grade"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={salvandoHorarios}
                    onClick={() => handleSalvarGradeHorarios(gradeHorarios)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Grade de Horários para Todos</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Form para Adicionar Novo Item (Ocorrências e Medidas) */}
          {(abaAdminConfig === 'ocorrencias' || abaAdminConfig === 'medidas') && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  Cadastrar Novo(a){' '}
                  {abaAdminConfig === 'ocorrencias'
                    ? 'Tipo de Ocorrência Principal'
                    : 'Medida Pedagógica Tomada'}
                </span>
              </h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={novoItemConfig}
                  onChange={e => setNovoItemConfig(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdicionarItemConfig(
                        abaAdminConfig === 'ocorrencias'
                          ? 'ocorrencia'
                          : 'medida'
                      );
                    }
                  }}
                  placeholder={
                    abaAdminConfig === 'ocorrencias'
                      ? 'Ex: Descumprimento de regras de laboratório...'
                      : 'Ex: Mediação formativa com o professor tutor...'
                  }
                  className="flex-1 p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-medium bg-white text-slate-800"
                />
                <button
                  type="button"
                  disabled={salvandoConfig || !novoItemConfig.trim()}
                  onClick={() =>
                    handleAdicionarItemConfig(
                      abaAdminConfig === 'ocorrencias'
                        ? 'ocorrencia'
                        : 'medida'
                    )
                  }
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar às Opções</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                💡 Qualquer novo item adicionado, editado ou excluído é atualizado imediatamente no formulário de registro de ocorrências para todos os usuários.
              </p>
            </div>
          )}

          {/* Lista de Itens com Ações de Edição e Exclusão */}
          {(abaAdminConfig === 'ocorrencias' || abaAdminConfig === 'medidas') && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Opções Ativas no Formulário de Registro (
                {abaAdminConfig === 'ocorrencias'
                  ? listaOcorrencias.length
                  : listaMedidas.length}
                )
              </h3>

              {abaAdminConfig === 'ocorrencias' && (
                <div className="space-y-2">
                  {listaOcorrencias.map((ocorr, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-slate-200 hover:border-indigo-200 rounded-xl flex items-start justify-between gap-3 shadow-2xs group transition-all"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="font-semibold text-xs text-slate-800 leading-relaxed">{ocorr}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setItemEditando({
                              tipo: 'ocorrencia',
                              index: idx,
                              valorAntigo: ocorr,
                              valorNovo: ocorr,
                            })
                          }
                          className="p-1.5 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 rounded-lg text-xs cursor-pointer transition-colors"
                          title="Editar ocorrência"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setItemParaExcluirConfig({
                              tipo: 'ocorrencia',
                              index: idx,
                              valor: ocorr,
                            })
                          }
                          className="p-1.5 hover:bg-rose-50 text-rose-600 hover:text-rose-800 rounded-lg text-xs cursor-pointer transition-colors"
                          title="Excluir ocorrência"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {abaAdminConfig === 'medidas' && (
                <div className="space-y-2">
                  {listaMedidas.map((med, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-slate-200 hover:border-indigo-200 rounded-xl flex items-start justify-between gap-3 shadow-2xs group transition-all"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="font-semibold text-xs text-slate-800 leading-relaxed">{med}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setItemEditando({
                              tipo: 'medida',
                              index: idx,
                              valorAntigo: med,
                              valorNovo: med,
                            })
                          }
                          className="p-1.5 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 rounded-lg text-xs cursor-pointer transition-colors"
                          title="Editar medida"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setItemParaExcluirConfig({
                              tipo: 'medida',
                              index: idx,
                              valor: med,
                            })
                          }
                          className="p-1.5 hover:bg-rose-50 text-rose-600 hover:text-rose-800 rounded-lg text-xs cursor-pointer transition-colors"
                          title="Excluir medida"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Estados de busca individual por aba
  const [buscaPendentes, setBuscaPendentes] = useState('');
  const [buscaEmAndamento, setBuscaEmAndamento] = useState('');
  const [buscaConcluidos, setBuscaConcluidos] = useState('');
  const [buscaSala, setBuscaSala] = useState('');

  // Listas de Ocorrências com ordenação estrita: MAIS RECENTES SEMPRE EM PRIMEIRO LUGAR
  // 1. Pendentes: Novas ocorrências com solicitação de suporte aguardando primeiro registro da gestão
  const pendentes = useMemo(
    () => ordenarOcorrenciasPorMaisRecentes(bancoDeDados.registros.filter(isOcorrenciaPendente)),
    [bancoDeDados.registros]
  );

  // 2. Em Andamento: Ocorrências onde a gestão fez registro e marcou como "Em Andamento" (sem conclusão definitiva)
  const emAndamento = useMemo(
    () => ordenarOcorrenciasPorMaisRecentes(bancoDeDados.registros.filter(isOcorrenciaEmAndamento)),
    [bancoDeDados.registros]
  );

  // 3. Concluídos: Todas as ocorrências concluídas (finalizadas pela gestão ou resolvidas)
  const concluidos = useMemo(
    () => ordenarOcorrenciasPorMaisRecentes(bancoDeDados.registros.filter(isOcorrenciaConcluida)),
    [bancoDeDados.registros]
  );

  // Sub-filtros para Concluídos
  const concluidosGestao = useMemo(
    () =>
      concluidos.filter(
        r => !verificarResolvidoEmSala(r.auxilio) || (r.mediacao && r.mediacao.trim().length > 0)
      ),
    [concluidos]
  );

  const resolvidosEmSala = useMemo(
    () =>
      ordenarOcorrenciasPorMaisRecentes(
        bancoDeDados.registros.filter(
          r => verificarResolvidoEmSala(r.auxilio) && (!r.mediacao || r.mediacao.trim().length === 0) && String(r.status || '').toLowerCase() !== 'em andamento'
        )
      ),
    [bancoDeDados.registros]
  );

  // 4. Meus Registros: Ocorrências do usuário atual que AINDA NÃO POSSUEM MEDIAÇÃO da gestão (permite edição)
  const meusRegistrosSemMediacao = useMemo(() => {
    return ordenarOcorrenciasPorMaisRecentes(
      bancoDeDados.registros.filter(
        r =>
          (r.professor || '').trim().toLowerCase() === userName.trim().toLowerCase() &&
          (!r.mediacao || r.mediacao.trim() === '')
      )
    );
  }, [bancoDeDados.registros, userName]);

  // 5. Minhas Devolutivas: Ocorrências do usuário atual que JÁ POSSUEM MEDIAÇÃO da gestão (edição bloqueada)
  const minhasDevolutivasComMediacao = useMemo(() => {
    return ordenarOcorrenciasPorMaisRecentes(
      bancoDeDados.registros.filter(
        r =>
          (r.professor || '').trim().toLowerCase() === userName.trim().toLowerCase() &&
          r.mediacao &&
          r.mediacao.trim().length > 0
      )
    );
  }, [bancoDeDados.registros, userName]);

  // Listas filtradas pela barra de busca rápida
  const pendentesFiltrados = useMemo(() => {
    if (!buscaPendentes.trim()) return pendentes;
    const q = buscaPendentes.toLowerCase().trim();
    return pendentes.filter(
      r =>
        r.estudante.toLowerCase().includes(q) ||
        r.turma.toLowerCase().includes(q) ||
        r.professor.toLowerCase().includes(q) ||
        r.ocorrencia.toLowerCase().includes(q) ||
        (r.id && r.id.toLowerCase().includes(q))
    );
  }, [pendentes, buscaPendentes]);

  const emAndamentoFiltrados = useMemo(() => {
    if (!buscaEmAndamento.trim()) return emAndamento;
    const q = buscaEmAndamento.toLowerCase().trim();
    return emAndamento.filter(
      r =>
        r.estudante.toLowerCase().includes(q) ||
        r.turma.toLowerCase().includes(q) ||
        r.professor.toLowerCase().includes(q) ||
        (r.mediador && r.mediador.toLowerCase().includes(q)) ||
        r.ocorrencia.toLowerCase().includes(q) ||
        (r.mediacao && r.mediacao.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q))
    );
  }, [emAndamento, buscaEmAndamento]);

  const concluidosFiltrados = useMemo(() => {
    let base = concluidos;
    if (filtroConcluidos === 'gestao') {
      base = concluidosGestao;
    } else if (filtroConcluidos === 'sala') {
      base = resolvidosEmSala;
    }
    if (!buscaConcluidos.trim()) return base;
    const q = buscaConcluidos.toLowerCase().trim();
    return base.filter(
      r =>
        r.estudante.toLowerCase().includes(q) ||
        r.turma.toLowerCase().includes(q) ||
        r.professor.toLowerCase().includes(q) ||
        (r.mediador && r.mediador.toLowerCase().includes(q)) ||
        r.ocorrencia.toLowerCase().includes(q) ||
        (r.id && r.id.toLowerCase().includes(q))
    );
  }, [concluidos, concluidosGestao, resolvidosEmSala, filtroConcluidos, buscaConcluidos]);

  const salaFiltrados = useMemo(() => {
    if (!buscaSala.trim()) return resolvidosEmSala;
    const q = buscaSala.toLowerCase().trim();
    return resolvidosEmSala.filter(
      r =>
        r.estudante.toLowerCase().includes(q) ||
        r.turma.toLowerCase().includes(q) ||
        r.professor.toLowerCase().includes(q) ||
        r.ocorrencia.toLowerCase().includes(q) ||
        (r.id && r.id.toLowerCase().includes(q))
    );
  }, [resolvidosEmSala, buscaSala]);

  return (
    <div className="space-y-6">
      {/* Top Banner do Módulo */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Gestão de Ocorrências & Mediação Disciplinar
              </h1>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 uppercase">
                {isAdmin ? 'Painel Administrador (Master)' : isGestao ? 'Painel de Gestão' : 'Portal do Professor'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Base Unificada do Sistema • Usuário ativo:{' '}
              <strong className="text-slate-800">{userName}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Toast de Mensagem */}
      {mensagem.texto && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in ${
            mensagem.tipo === 'sucesso'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {mensagem.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{mensagem.texto}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensagem({ texto: '', tipo: '' })}
            className="cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Abas de Navegação */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-2xs flex overflow-x-auto no-scrollbar gap-1">
        {isGestao ? (
          <>
            {/* Aba 1: Pendentes */}
            <button
              type="button"
              onClick={() => setAbaGestao('pendentes')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaGestao === 'pendentes'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>🚨 Pendentes</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaGestao === 'pendentes' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {pendentes.length}
              </span>
            </button>

            {/* Aba 2: Em Andamento */}
            <button
              type="button"
              onClick={() => setAbaGestao('em_andamento')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaGestao === 'em_andamento'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>⏳ Em Andamento</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaGestao === 'em_andamento' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                }`}
              >
                {emAndamento.length}
              </span>
            </button>

            {/* Aba 3: Concluídos */}
            <button
              type="button"
              onClick={() => setAbaGestao('concluidos')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaGestao === 'concluidos'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>✅ Concluídos</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaGestao === 'concluidos' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {concluidos.length}
              </span>
            </button>

            {/* Aba 4: Resolvidos em Sala */}
            <button
              type="button"
              onClick={() => setAbaGestao('sala')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaGestao === 'sala'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📂 Resolvidos em Sala</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaGestao === 'sala' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {resolvidosEmSala.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAbaGestao('consulta')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'consulta'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🔍 Consulta & Dossiê
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('estatisticas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'estatisticas'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📊 Painel Estratégico
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('registrar')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'registrar'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📝 Novo Registro
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('meus_registros')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaGestao === 'meus_registros'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📋 Meus Registros</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaGestao === 'meus_registros' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {meusRegistrosSemMediacao.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('devolutivas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaGestao === 'devolutivas'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📬 Minhas Devolutivas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaGestao === 'devolutivas' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {minhasDevolutivasComMediacao.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('tutorados')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'tutorados'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              👨‍🎓 Meus Tutorados
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAbaProfessor('registrar')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaProfessor === 'registrar'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📝 Novo Registro
            </button>
            <button
              type="button"
              onClick={() => setAbaProfessor('meus_registros')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaProfessor === 'meus_registros'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📋 Meus Registros</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaProfessor === 'meus_registros' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {meusRegistrosSemMediacao.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAbaProfessor('devolutivas')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                abaProfessor === 'devolutivas'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📬 Minhas Devolutivas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  abaProfessor === 'devolutivas' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {minhasDevolutivasComMediacao.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAbaProfessor('tutorados')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaProfessor === 'tutorados'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              👨‍🎓 Meus Tutorados
            </button>
          </>
        )}
      </div>

      {/* Conteúdo da Aba */}
      <div>
        {isGestao ? (
          <>
            {/* ABA 1: PENDENTES (Novas ocorrências com solicitação de suporte) */}
            {abaGestao === 'pendentes' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <span>🚨 Ocorrências com Solicitação de Suporte</span>
                      <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                        {pendentes.length} pendente(s)
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Novas ocorrências abertas pelos docentes solicitando intervenção ou convocação da família.
                    </p>
                  </div>

                  <div className="w-full sm:w-72">
                    <input
                      type="text"
                      value={buscaPendentes}
                      onChange={e => setBuscaPendentes(e.target.value)}
                      placeholder="Filtrar por estudante, turma ou professor..."
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-slate-50"
                    />
                  </div>
                </div>

                {pendentesFiltrados.length === 0 ? (
                  <div className="bg-white p-12 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                    <p className="font-bold text-sm text-slate-800">
                      {buscaPendentes
                        ? 'Nenhuma ocorrência pendente corresponde à busca.'
                        : 'Nenhuma ocorrência pendente de suporte no momento!'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {buscaPendentes
                        ? 'Tente buscar por outro termo ou limpe o campo.'
                        : 'Todos os pedidos de auxílio foram atendidos ou alocados.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {pendentesFiltrados.map(reg => (
                      <OcorrenciaCard
                        key={reg.id}
                        reg={reg}
                        tipoStatus="pendente"
                        resolvidoEmSala={false}
                        onMediar={abrirMediacao}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA 2: EM ANDAMENTO (Registros iniciados pela gestão sem conclusão) */}
            {abaGestao === 'em_andamento' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <span>⏳ Ocorrências em Acompanhamento / Em Andamento</span>
                      <span className="bg-blue-100 text-blue-900 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                        {emAndamento.length} caso(s)
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Casos com atendimento iniciado pela gestão escolar aguardando conclusão definitiva ou novas tratativas.
                    </p>
                  </div>

                  <div className="w-full sm:w-72">
                    <input
                      type="text"
                      value={buscaEmAndamento}
                      onChange={e => setBuscaEmAndamento(e.target.value)}
                      placeholder="Filtrar por estudante, turma ou mediador..."
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-slate-50"
                    />
                  </div>
                </div>

                {emAndamentoFiltrados.length === 0 ? (
                  <div className="bg-white p-12 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500">
                    <Clock className="w-10 h-10 mx-auto text-blue-500 mb-2" />
                    <p className="font-bold text-sm text-slate-800">
                      {buscaEmAndamento
                        ? 'Nenhum caso em andamento corresponde à busca.'
                        : 'Nenhuma ocorrência em andamento no momento.'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {buscaEmAndamento
                        ? 'Tente buscar por outro termo.'
                        : 'Quando a gestão mediar e marcar "Em Andamento", o caso será exibido aqui.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {emAndamentoFiltrados.map(reg => (
                      <OcorrenciaCard
                        key={reg.id}
                        reg={reg}
                        tipoStatus="em_andamento"
                        resolvidoEmSala={false}
                        onMediar={abrirMediacao}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA 3: CONCLUÍDOS (Casos finalizados pela gestão ou resolvidos) */}
            {abaGestao === 'concluidos' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>✅ Ocorrências Concluídas & Finalizadas</span>
                        <span className="bg-emerald-100 text-emerald-900 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                          {concluidos.length} concluído(s)
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Histórico completo de ocorrências solucionadas pela equipe gestora ou resolvidas em sala de aula.
                      </p>
                    </div>

                    <div className="w-full sm:w-72">
                      <input
                        type="text"
                        value={buscaConcluidos}
                        onChange={e => setBuscaConcluidos(e.target.value)}
                        placeholder="Filtrar concluídos..."
                        className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* Sub-filtros para Concluídos */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setFiltroConcluidos('todos')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        filtroConcluidos === 'todos'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Todos os Concluídos ({concluidos.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroConcluidos('gestao')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        filtroConcluidos === 'gestao'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Concluídos pela Gestão ({concluidosGestao.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroConcluidos('sala')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        filtroConcluidos === 'sala'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Resolvidos em Sala ({resolvidosEmSala.length})
                    </button>
                  </div>
                </div>

                {concluidosFiltrados.length === 0 ? (
                  <div className="bg-white p-12 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                    <p className="font-bold text-sm text-slate-800">
                      {buscaConcluidos
                        ? 'Nenhum registro concluído corresponde à busca.'
                        : 'Nenhuma ocorrência concluída nesta categoria.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {concluidosFiltrados.map(reg => (
                      <OcorrenciaCard
                        key={reg.id}
                        reg={reg}
                        tipoStatus="concluido"
                        resolvidoEmSala={verificarResolvidoEmSala(reg.auxilio)}
                        onMediar={abrirMediacao}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA 4: RESOLVIDOS EM SALA */}
            {abaGestao === 'sala' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <span>📂 Resolvidos em Sala de Aula</span>
                      <span className="bg-slate-100 text-slate-800 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                        {resolvidosEmSala.length} registro(s)
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ocorrências administradas autonomamente pelos professores em sala sem solicitação de intervenção da gestão.
                    </p>
                  </div>

                  <div className="w-full sm:w-72">
                    <input
                      type="text"
                      value={buscaSala}
                      onChange={e => setBuscaSala(e.target.value)}
                      placeholder="Filtrar resolvidos em sala..."
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-slate-50"
                    />
                  </div>
                </div>

                {salaFiltrados.length === 0 ? (
                  <div className="bg-white p-8 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500 text-xs">
                    Nenhum registro resolvido em sala localizado.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {salaFiltrados.map(reg => (
                      <OcorrenciaCard
                        key={reg.id}
                        reg={reg}
                        tipoStatus="concluido"
                        resolvidoEmSala={true}
                        onMediar={abrirMediacao}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {abaGestao === 'consulta' && renderConsultaImpressao()}
            {abaGestao === 'estatisticas' && renderEstatisticasGlobais()}
            {abaGestao === 'registrar' && renderFormularioRegistro()}
            {abaGestao === 'meus_registros' && renderMeusRegistros()}
            {abaGestao === 'devolutivas' && renderMinhasDevolutivas()}
            {abaGestao === 'tutorados' && renderMeusTutorados()}
            {abaGestao === 'config_admin' && renderPainelAdminConfig()}
          </>
        ) : (
          <>
            {abaProfessor === 'registrar' && renderFormularioRegistro()}
            {abaProfessor === 'meus_registros' && renderMeusRegistros()}
            {abaProfessor === 'devolutivas' && renderMinhasDevolutivas()}
            {abaProfessor === 'tutorados' && renderMeusTutorados()}
          </>
        )}
      </div>

      {/* MODAL 1: ALERTA DE REINCIDÊNCIA NO MESMO DIA */}
      {alertaOcorrencia && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-amber-500 animate-in zoom-in-95">
            <div className="bg-amber-50 px-5 py-3.5 flex justify-between items-center border-b border-amber-200">
              <h3 className="text-amber-900 font-bold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Alerta de Reincidência no Mesmo Dia</span>
              </h3>
              <button
                type="button"
                onClick={() => setAlertaOcorrencia(null)}
                className="text-amber-700 hover:text-amber-900 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3">
              <p className="text-xs text-slate-700 font-medium">
                Encontramos registros anteriores para o dia{' '}
                <strong>{alertaOcorrencia.dataFmt}</strong>:
              </p>
              {alertaOcorrencia.alunos.map(alertaAluno => (
                <div key={alertaAluno.nome} className="mb-3">
                  <p className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1.5 text-xs">
                    {alertaAluno.nome}
                  </p>
                  <div className="space-y-1.5">
                    {alertaAluno.lista.map(o => (
                      <div
                        key={o.id}
                        className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-xs"
                      >
                        <div className="flex justify-between items-start mb-0.5 font-bold text-amber-950">
                          <span>{o.aula}</span>
                          <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                            {o.status}
                          </span>
                        </div>
                        <p className="text-amber-900 font-medium text-xs">{o.ocorrencia}</p>
                        <p className="text-amber-800 text-[10px] mt-0.5">
                          Por: <strong>{o.professor}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAlertaOcorrencia(null)}
                className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer text-xs"
              >
                Estou ciente, continuar registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MEDIAR OCORRÊNCIA */}
      {modalMediacao && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Mediar Ocorrência Disciplinar</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalMediacao(null)}
                className="font-bold text-lg cursor-pointer hover:text-indigo-200"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <p className="font-bold text-slate-900">{modalMediacao.estudante}</p>
                <p className="text-slate-600 mt-0.5">{modalMediacao.ocorrencia}</p>
              </div>
              <form onSubmit={handleSalvarMediacao} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">
                      Responsável pela Mediação (Gestão Escolar)
                    </label>
                    <button
                      type="button"
                      onClick={() => setModoMediadorAvulso(!modoMediadorAvulso)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 underline font-medium cursor-pointer"
                    >
                      {modoMediadorAvulso ? 'Selecionar da lista' : 'Ou digitar outro nome (sistema antigo)'}
                    </button>
                  </div>

                  {modoMediadorAvulso ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={formMediacao.mediador}
                        onChange={e => setFormMediacao({ ...formMediacao, mediador: e.target.value })}
                        required
                        placeholder="Nome do(a) mediador(a) / membro da gestão..."
                        className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                      />
                      <p className="text-[11px] text-slate-500">
                        Permite atribuir a mediação a outra pessoa da gestão ou registrar atendimentos do sistema antigo.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={formMediacao.mediador}
                      onChange={e => {
                        if (e.target.value === '__DIGITAR_NOVO__') {
                          setModoMediadorAvulso(true);
                        } else {
                          setFormMediacao({ ...formMediacao, mediador: e.target.value });
                        }
                      }}
                      required
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                    >
                      {formMediacao.mediador && !listaMembrosGestaoDisponiveis.includes(formMediacao.mediador) && (
                        <option value={formMediacao.mediador}>{formMediacao.mediador} (Atual)</option>
                      )}
                      {listaMembrosGestaoDisponiveis.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="__DIGITAR_NOVO__">✍️ Digitar outro membro da gestão (Sistema Antigo)...</option>
                    </select>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1">
                    Selecione ou digite o nome de quem conduziu a mediação/atendimento.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Status após este atendimento
                  </label>
                  <select
                    required
                    value={formMediacao.status}
                    onChange={e => setFormMediacao({ ...formMediacao, status: e.target.value })}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  >
                    <option value="Concluído">✅ Concluído (Encerrar caso e mover para Concluídos)</option>
                    <option value="Em Andamento">⏳ Em Andamento (Em acompanhamento / Mover para Em Andamento)</option>
                    <option value="Pendente">🚨 Pendente (Reabrir como Novo / Sem conclusão)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {formMediacao.status === 'Em Andamento'
                      ? '📌 A ocorrência ficará alocada na aba "⏳ Em Andamento" até a resolução definitiva.'
                      : formMediacao.status === 'Concluído'
                      ? '📌 O caso será finalizado e arquivado na aba "✅ Concluídos".'
                      : '📌 A ocorrência continuará aguardando atendimento na aba de pendências.'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Novo Parecer / Ação da Gestão
                  </label>
                  <textarea
                    required
                    value={formMediacao.mediacao}
                    onChange={e => setFormMediacao({ ...formMediacao, mediacao: e.target.value })}
                    rows={4}
                    placeholder="Descreva a orientação dada ao aluno/professor, providências com a família..."
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden text-slate-800 font-medium"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMediacao(null)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={enviando}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
                  >
                    {enviando ? 'Salvando...' : 'Gravar Parecer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2.5: EDITAR OCORRÊNCIA REGISTRADA */}
      {modalEdicaoOcorrencia && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-slate-200 animate-in zoom-in-95 flex flex-col">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                  <Edit2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Editar Ocorrência Registrada</h3>
                  <p className="text-[11px] text-indigo-100 font-mono">
                    Protocolo: {modalEdicaoOcorrencia.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalEdicaoOcorrencia(null)}
                disabled={salvandoEdicaoOcorrencia}
                className="font-bold text-lg cursor-pointer hover:text-indigo-200 p-1 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarEdicaoOcorrencia} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Data e Horário */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Data da Ocorrência *
                  </label>
                  <input
                    type="date"
                    required
                    value={formEdicaoOcorrencia.data}
                    onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, data: e.target.value })}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Horário / Aula *
                  </label>
                  <select
                    required
                    value={formEdicaoOcorrencia.aula}
                    onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, aula: e.target.value })}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  >
                    <option value="">Selecione o horário/aula...</option>
                    {bancoDeDados.aulas.map(a => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Turma e Estudante */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Turma *
                  </label>
                  <select
                    required
                    value={formEdicaoOcorrencia.turma}
                    onChange={e => {
                      const novaTurma = e.target.value;
                      setFormEdicaoOcorrencia({
                        ...formEdicaoOcorrencia,
                        turma: novaTurma,
                      });
                    }}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  >
                    <option value="">Selecione a turma...</option>
                    {turmasUnicas.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Estudante Envolvido *
                  </label>
                  {alunosDaTurmaEdicao.length > 0 ? (
                    <select
                      required
                      value={formEdicaoOcorrencia.estudante}
                      onChange={e => {
                        const alunoNome = e.target.value;
                        const alunoObj = alunosDaTurmaEdicao.find(a => a.nome === alunoNome);
                        setFormEdicaoOcorrencia({
                          ...formEdicaoOcorrencia,
                          estudante: alunoNome,
                          tutor: alunoObj?.tutor || formEdicaoOcorrencia.tutor,
                        });
                      }}
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                    >
                      <option value="">Selecione o estudante...</option>
                      {formEdicaoOcorrencia.estudante && !alunosDaTurmaEdicao.some(a => a.nome === formEdicaoOcorrencia.estudante) && (
                        <option value={formEdicaoOcorrencia.estudante}>{formEdicaoOcorrencia.estudante} (Atual)</option>
                      )}
                      {alunosDaTurmaEdicao.map(a => (
                        <option key={a.nome} value={a.nome}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={formEdicaoOcorrencia.estudante}
                      onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, estudante: e.target.value })}
                      placeholder="Nome do estudante..."
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                    />
                  )}
                </div>
              </div>

              {/* Professor e Auxílio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Professor Relator *
                  </label>
                  <select
                    required
                    value={formEdicaoOcorrencia.professor}
                    onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, professor: e.target.value })}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  >
                    <option value="">Selecione o professor...</option>
                    {formEdicaoOcorrencia.professor && !listaProfessoresDisponiveis.includes(formEdicaoOcorrencia.professor) && (
                      <option value={formEdicaoOcorrencia.professor}>{formEdicaoOcorrencia.professor} (Atual)</option>
                    )}
                    {listaProfessoresDisponiveis.map(p => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Necessita Auxílio da Gestão?
                  </label>
                  <select
                    required
                    value={formEdicaoOcorrencia.auxilio}
                    onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, auxilio: e.target.value })}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  >
                    {bancoDeDados.auxilio.map(a => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ocorrência Principal e Medida */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ocorrência Principal *
                  </label>
                  <select
                    required
                    value={formEdicaoOcorrencia.ocorrencia}
                    onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, ocorrencia: e.target.value })}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  >
                    <option value="">Selecione a infração...</option>
                    {formEdicaoOcorrencia.ocorrencia && !bancoDeDados.ocorrencias.includes(formEdicaoOcorrencia.ocorrencia) && (
                      <option value={formEdicaoOcorrencia.ocorrencia}>{formEdicaoOcorrencia.ocorrencia}</option>
                    )}
                    {bancoDeDados.ocorrencias.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Medida Tomada no Momento *
                  </label>
                  <select
                    required
                    value={formEdicaoOcorrencia.medida}
                    onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, medida: e.target.value })}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
                  >
                    <option value="">Selecione a ação pedagógica...</option>
                    {formEdicaoOcorrencia.medida && !bancoDeDados.medidas.includes(formEdicaoOcorrencia.medida) && (
                      <option value={formEdicaoOcorrencia.medida}>{formEdicaoOcorrencia.medida}</option>
                    )}
                    {bancoDeDados.medidas.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Descrição e IA */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Descrição / Relato Detalhado *
                  </label>
                  <button
                    type="button"
                    onClick={handleFormatarEdicaoDescricaoIA}
                    disabled={formatandoEdicaoIA}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    title="Ajusta o texto com IA do Gemini para uma linguagem formal, correta e respeitosa"
                  >
                    {formatandoEdicaoIA ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Formatando com IA...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>✨ Formatar com IA (Gemini)</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  required
                  rows={3}
                  value={formEdicaoOcorrencia.descricao}
                  onChange={e => setFormEdicaoOcorrencia({ ...formEdicaoOcorrencia, descricao: e.target.value })}
                  placeholder="Relato detalhado dos acontecimentos..."
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-medium text-slate-800 bg-white"
                />
              </div>

              {/* Status da Ocorrência (Somente Leitura - Gerenciado Exclusivamente pela Gestão) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 uppercase">Status:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    modalEdicaoOcorrencia.status === 'Resolvido'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : modalEdicaoOcorrencia.status === 'Em Andamento'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : modalEdicaoOcorrencia.status === 'Concluído'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {modalEdicaoOcorrencia.status || 'Pendente'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  🔒 O Status da ocorrência é atribuído e atualizado exclusivamente pela equipe gestora escolar.
                </span>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalEdicaoOcorrencia(null)}
                  disabled={salvandoEdicaoOcorrencia}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicaoOcorrencia}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{salvandoEdicaoOcorrencia ? 'Salvando Alterações...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REUNIÃO COM A FAMÍLIA (TRATATIVA) */}
      {modalFamilia && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-amber-500 animate-in zoom-in-95">
            <div className="bg-amber-50 px-6 py-4 flex justify-between items-center border-b border-amber-200">
              <h3 className="text-amber-950 font-bold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-600" />
                <span>Reunião & Tratativa com a Família</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalFamilia(null)}
                className="text-amber-700 hover:text-amber-950 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 bg-amber-50/60 p-3 rounded-xl border border-amber-200 text-xs text-amber-900">
                <p className="font-bold text-sm">{modalFamilia.nome}</p>
                <p className="text-[11px] mt-0.5">
                  Registro de Termo de Ciência e Acordo Familiar oficializado na escola.
                </p>
              </div>
              <form onSubmit={handleSalvarFamilia} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Acordos firmados com Responsável / Estudante
                  </label>
                  <textarea
                    required
                    value={formFamilia.tratativa}
                    onChange={e => setFormFamilia({ tratativa: e.target.value })}
                    rows={5}
                    placeholder="Digite quem compareceu (mãe, pai, avô...), as orientações passadas e os compromissos de melhoria..."
                    className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden text-slate-800 font-medium"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalFamilia(null)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={enviando}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 cursor-pointer disabled:opacity-50"
                  >
                    {enviando ? 'Salvando...' : 'Salvar Tratativa Oficial'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DOSSIÊ E TERMO DE ACORDO FAMILIAR IMPRIMÍVEL */}
      {dossieAluno && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Top Toolbar */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">
                  Dossiê Oficial e Termo de Acompanhamento — {dossieAluno.nome}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDossieAluno(null)}
                  className="text-slate-400 hover:text-white p-1 text-lg font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document Body (Styled for Print and Preview) */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-slate-800 text-xs">
              <div className="text-center border-b border-indigo-200 pb-4">
                <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">
                  Dossiê e Termo de Acompanhamento Disciplinar
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Documento Oficial da Gestão Escolar e Mediação Familiar
                </p>
              </div>

              <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-indigo-950">{dossieAluno.nome}</h3>
                  <p className="text-slate-600 text-xs mt-0.5">
                    Professor(a) Tutor(a): <strong>{dossieAluno.tutor || 'Não informado'}</strong>
                  </p>
                  {dossieAluno.estudanteObj?.guardianName && (
                    <p className="text-slate-600 text-xs mt-0.5">
                      Responsável: <strong>{dossieAluno.estudanteObj.guardianName}</strong> ({dossieAluno.estudanteObj.guardianRelationship || 'Família'})
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold text-indigo-700 bg-white px-3 py-1 rounded-lg border border-indigo-200">
                    Turma: {dossieAluno.turma}
                  </span>
                  {dossieAluno.estudanteObj && (
                    <span className="text-[11px] font-medium text-slate-500">
                      RA: {dossieAluno.estudanteObj.id}
                    </span>
                  )}
                </div>
              </div>

              {/* Seção 1: Relatório de Frequência Escolar */}
              <div>
                <div className="flex justify-between items-center border-b border-slate-300 pb-1 mb-2">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>1. Relatório de Frequência Escolar & Assiduidade</span>
                  </h4>
                  {dossieAluno.estudanteObj && (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        dossieAluno.estudanteObj.attendanceRate >= 75
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        Frequência Geral: {dossieAluno.estudanteObj.attendanceRate.toFixed(1)}%
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        (Faltas: {dossieAluno.estudanteObj.consecutiveAbsences} consec. / {dossieAluno.estudanteObj.totalAbsences} total)
                      </span>
                    </div>
                  )}
                </div>

                {!dossieAluno.historicoFrequencia || dossieAluno.historicoFrequencia.length === 0 ? (
                  <p className="text-slate-500 italic p-3 bg-slate-50 rounded-xl border border-slate-200">
                    Nenhum registro detalhado de frequência localizado no banco escolar até o momento.
                  </p>
                ) : (
                  <div className="border border-slate-300 rounded-xl overflow-hidden">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          <th className="p-2 border-b border-r border-slate-300 text-left w-24">Data</th>
                          <th className="p-2 border-b border-r border-slate-300 text-center w-28">Status</th>
                          <th className="p-2 border-b border-r border-slate-300 text-left w-36">Lançado Por</th>
                          <th className="p-2 border-b border-slate-300 text-left">Justificativa / Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossieAluno.historicoFrequencia.slice(0, 10).map((att, i) => (
                          <tr key={att.id || i} className="border-b border-slate-200">
                            <td className="p-2 border-r border-slate-300 font-semibold">{formatarDataBR(att.date)}</td>
                            <td className="p-2 border-r border-slate-300 text-center">
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                                  att.status === 'presente'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : att.status === 'atestado_medico'
                                    ? 'bg-cyan-100 text-cyan-800'
                                    : att.status === 'falta_justificada'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {att.status === 'presente' ? 'Presente' : att.status === 'atestado_medico' ? 'Atestado' : att.status === 'falta_justificada' ? 'Justificada' : 'Ausente'}
                              </span>
                            </td>
                            <td className="p-2 border-r border-slate-300 text-slate-600">{att.recordedBy || 'Docente'}</td>
                            <td className="p-2 text-slate-700 italic">
                              {att.status === 'atestado_medico' ? (
                                <span className="font-semibold text-cyan-900 not-italic">
                                  {att.medicalCertificate || att.justification || 'Atestado médico homologado'}
                                </span>
                              ) : (
                                att.justification || '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Seção 2 */}
              <div>
                <h4 className="font-bold text-slate-900 border-b border-slate-300 pb-1 mb-2 text-xs uppercase tracking-wide">
                  2. Resumo de Ocorrências Registradas ({dossieAluno.ocorrencias.length})
                </h4>
                {dossieAluno.ocorrencias.length === 0 ? (
                  <p className="text-slate-500 italic p-3 bg-slate-50 rounded-xl border border-slate-200">
                    O estudante não possui ocorrências disciplinares na base de dados.
                  </p>
                ) : (
                  <table className="w-full border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-300 p-2 text-left w-20">Data / Aula</th>
                        <th className="border border-slate-300 p-2 text-left w-28">Professor</th>
                        <th className="border border-slate-300 p-2 text-left">
                          Infração, Medida e Relato
                        </th>
                        <th className="border border-slate-300 p-2 text-center w-20">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossieAluno.ocorrencias.map(o => (
                        <tr key={o.id} className="border-b border-slate-200">
                          <td className="border border-slate-300 p-2 align-top">
                            {formatarDataBR(o.data)}
                            <br />
                            <small className="text-slate-500">{o.aula}</small>
                          </td>
                          <td className="border border-slate-300 p-2 align-top font-semibold">
                            {o.professor}
                          </td>
                          <td className="border border-slate-300 p-2 align-top">
                            <strong>{o.ocorrencia}</strong>
                            <br />
                            <small className="text-slate-600">Medida: {o.medida}</small>
                            {o.descricao && (
                              <div className="mt-1 p-1.5 bg-slate-50 border-l-2 border-slate-400 italic text-[11px]">
                                Relato: {o.descricao}
                              </div>
                            )}
                            {o.mediacao && (
                              <div className="mt-1 p-1.5 bg-indigo-50 border-l-2 border-indigo-500 text-indigo-950 text-[11px]">
                                <strong>Parecer Gestão:</strong> {o.mediacao}
                              </div>
                            )}
                            {isGestao && (() => {
                              const info = obterInfoPreenchimento(o);
                              return (
                                <div className="mt-1 p-1 bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-700 flex items-center justify-between gap-1">
                                  <span>
                                    <strong>🕒 Preenchimento pelo Prof:</strong> {info.dataHoraFormatada}
                                  </span>
                                  <span className="font-semibold text-indigo-800 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                                    {info.tagBadge}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="border border-slate-300 p-2 align-top text-center font-bold text-[11px]">
                            {o.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Seção 3: Tratativas Realizadas em Reunião com a Família */}
              <div>
                <h4 className="font-bold text-slate-900 border-b border-slate-300 pb-1 mb-2 text-xs uppercase tracking-wide">
                  3. Tratativas e Acordos Firmados em Reunião com a Família ({dossieAluno.tratativas.length})
                </h4>
                {dossieAluno.tratativas.length === 0 ? (
                  <p className="text-slate-500 italic p-3 bg-slate-50 rounded-xl border border-slate-200">
                    Nenhuma reunião ou acordo oficializado no sistema até o momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dossieAluno.tratativas.map((t, i) => (
                      <div
                        key={i}
                        className="p-3 bg-slate-50 border-l-4 border-indigo-500 text-xs rounded-r-lg"
                      >
                        <strong>
                          {t.data} — Mediador(a): {t.mediador}:
                        </strong>
                        <p className="mt-1 whitespace-pre-line text-slate-700">{t.tratativa}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Termo de Ciência */}
              <div className="p-3 bg-amber-50 border border-dashed border-amber-300 rounded-xl text-[11px] text-justify leading-relaxed text-amber-950">
                <strong>TERMO DE CIÊNCIA E COMPROMISSO:</strong> Pelo presente termo, nós,
                responsáveis legais e o(a) estudante acima identificado, declaramos total ciência do
                histórico escolar de frequência e disciplina, bem como concordamos expressamente com
                as diretrizes e acordos firmados com a equipe gestora da escola em reunião. Assumimos
                o compromisso mútuo de cooperar ativamente para a melhoria contínua da assiduidade e convivência.
              </div>

              {/* Linhas de Assinatura */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs">
                <div>
                  <div className="border-b border-slate-600 mb-1 h-8" />
                  <p className="font-bold text-slate-800">Gestão Escolar / Mediação</p>
                  <span className="text-[10px] text-slate-500">Carimbo e Assinatura</span>
                </div>
                <div>
                  <div className="border-b border-slate-600 mb-1 h-8" />
                  <p className="font-bold text-slate-800">Responsável Legal</p>
                  <span className="text-[10px] text-slate-500">
                    Assinatura (Parentesco: __________)
                  </span>
                </div>
                <div className="col-span-2 max-w-xs mx-auto w-full pt-4">
                  <div className="border-b border-slate-600 mb-1 h-8" />
                  <p className="font-bold text-slate-800">Estudante</p>
                  <span className="text-[10px] text-slate-500">Assinatura do(a) Aluno(a)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ENVIO DE OCORRÊNCIA AOS RESPONSÁVEIS VIA WHATSAPP (EXCLUSIVO GESTÃO) */}
      {modalWhatsApp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-emerald-500 animate-in zoom-in-95">
            <div className="bg-emerald-700 px-6 py-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-emerald-200" />
                <h3 className="font-bold text-sm">
                  Enviar Ocorrência via WhatsApp aos Pais
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalWhatsApp(null)}
                className="font-bold text-lg cursor-pointer hover:text-emerald-200"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <p className="font-extrabold text-slate-900 text-sm">
                  {modalWhatsApp.ocorrencia.estudante}{' '}
                  <span className="text-indigo-600 text-xs font-semibold">
                    ({modalWhatsApp.ocorrencia.turma})
                  </span>
                </p>
                <p className="text-slate-600 mt-0.5">
                  <strong>Ocorrência:</strong> {modalWhatsApp.ocorrencia.ocorrencia} • Prof: {modalWhatsApp.ocorrencia.professor}
                </p>
              </div>

              {/* Informação do Responsável */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Contato dos Responsáveis
                </label>
                {modalWhatsApp.guardianPhones.length === 0 ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                    <p className="font-bold">Nenhum telefone de responsável cadastrado para este estudante.</p>
                    <p className="mt-1 text-[11px] text-rose-600">
                      Cadastre o número do responsável na ficha do estudante para permitir o envio direto via WhatsApp.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {modalWhatsApp.guardianPhones.map((phone, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{modalWhatsApp.estudanteObj?.guardianName || 'Responsável'} ({modalWhatsApp.estudanteObj?.guardianRelationship || 'Família'})</span>
                          </p>
                          <p className="text-xs text-emerald-800 font-mono mt-0.5">{phone.formatted}</p>
                        </div>
                        <a
                          href={phone.whatsAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir WhatsApp</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Prévia da Mensagem */}
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Mensagem Pronta para Envio
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleFormatarWhatsAppIA}
                      disabled={formatandoWhatsAppIA}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      title="Usa o Gemini para reescrever a mensagem aos pais em tom compreensível, acolhedor e formal"
                    >
                      {formatandoWhatsAppIA ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Otimizando com IA...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                          <span>✨ Reformular com IA (Gemini)</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(modalWhatsApp.mensagemPadrao);
                        setMensagem({ texto: '📋 Mensagem copiada com sucesso!', tipo: 'sucesso' });
                        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 3000);
                      }}
                      className="text-emerald-700 hover:text-emerald-800 text-[11px] font-bold cursor-pointer bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200"
                    >
                      Copiar Texto
                    </button>
                  </div>
                </div>
                <textarea
                  rows={7}
                  value={modalWhatsApp.mensagemPadrao}
                  onChange={e => {
                    const val = e.target.value;
                    setModalWhatsApp(prev => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        mensagemPadrao: val,
                        guardianPhones: prev.guardianPhones.map(p => ({
                          ...p,
                          whatsAppUrl: `https://wa.me/${p.digits}?text=${encodeURIComponent(val)}`,
                        })),
                      };
                    });
                  }}
                  placeholder="Mensagem para WhatsApp..."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 leading-relaxed resize-none focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>Você pode editar o texto livremente ou clicar em 'Reformular com IA' para uma abordagem acolhedora aos pais.</span>
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalWhatsApp(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CONFIRMAÇÃO DE EXCLUSÃO DE OCORRÊNCIA (EXCLUSIVO ADMINISTRADOR) */}
      {ocorrenciaParaExcluir && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-rose-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>Excluir Registro de Ocorrência</span>
              </h3>
              <button
                type="button"
                onClick={() => setOcorrenciaParaExcluir(null)}
                disabled={excluindoOcorrencia}
                className="font-bold text-lg cursor-pointer hover:text-rose-200 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900">
                <p className="font-bold mb-1">Atenção: Ação irreversível!</p>
                <p>
                  Esta ocorrência será removida da base oficial de registros e do Firebase.
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Protocolo:</span>
                  <strong className="font-mono text-slate-800">{ocorrenciaParaExcluir.id}</strong>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Estudante:</span>
                  <strong className="text-slate-800">{ocorrenciaParaExcluir.estudante} ({ocorrenciaParaExcluir.turma})</strong>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Data / Aula:</span>
                  <span className="text-slate-700">{formatarDataBR(ocorrenciaParaExcluir.data)} • {ocorrenciaParaExcluir.aula}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Docente Relator:</span>
                  <span className="text-slate-700">{ocorrenciaParaExcluir.professor}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 text-slate-800">
                  <span className="text-slate-500 block text-[11px]">Infração Relatada:</span>
                  <span className="font-semibold">{ocorrenciaParaExcluir.ocorrencia}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOcorrenciaParaExcluir(null)}
                  disabled={excluindoOcorrencia}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarExclusaoOcorrencia}
                  disabled={excluindoOcorrencia}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{excluindoOcorrencia ? 'Excluindo...' : 'Sim, Excluir'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: EDIÇÃO DE ITEM DE CONFIGURAÇÃO (OCORRÊNCIAS, MEDIDAS) */}
      {itemEditando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4" />
                <span>
                  Editar{' '}
                  {itemEditando.tipo === 'ocorrencia'
                    ? 'Tipo de Ocorrência'
                    : 'Medida Pedagógica'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setItemEditando(null)}
                disabled={salvandoConfig}
                className="font-bold text-lg cursor-pointer hover:text-indigo-200 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Texto / Descrição da Opção
                </label>
                <textarea
                  rows={3}
                  value={itemEditando.valorNovo}
                  onChange={e =>
                    setItemEditando({ ...itemEditando, valorNovo: e.target.value })
                  }
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-medium text-slate-800"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setItemEditando(null)}
                  disabled={salvandoConfig}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSalvarEdicaoConfig}
                  disabled={salvandoConfig || !itemEditando.valorNovo.trim()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{salvandoConfig ? 'Salvando...' : 'Salvar Alteração'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: EXCLUSÃO DE ITEM DE CONFIGURAÇÃO (OCORRÊNCIAS, MEDIDAS) */}
      {itemParaExcluirConfig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-rose-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>
                  Excluir{' '}
                  {itemParaExcluirConfig.tipo === 'ocorrencia'
                    ? 'Tipo de Ocorrência'
                    : 'Medida Pedagógica'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setItemParaExcluirConfig(null)}
                disabled={salvandoConfig}
                className="font-bold text-lg cursor-pointer hover:text-rose-200 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700">
                Tem certeza que deseja remover este item das opções de cadastro de ocorrências?
              </p>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800">
                "{itemParaExcluirConfig.valor}"
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setItemParaExcluirConfig(null)}
                  disabled={salvandoConfig}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarExclusaoConfig}
                  disabled={salvandoConfig}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{salvandoConfig ? 'Excluindo...' : 'Sim, Excluir'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9: CONFIGURAÇÃO RÁPIDA DA CHAVE GEMINI (ATIVADA CASO CLIQUE NO BOTÃO SEM CHAVE) */}
      {modalConfigurarChave && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Ativar Inteligência Artificial (Google Gemini)</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalConfigurarChave(false)}
                className="font-bold text-lg cursor-pointer hover:text-purple-200"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 text-xs text-purple-900 leading-relaxed">
                <p className="font-bold mb-1">🔑 Chave de API Gratuita do Gemini necessária:</p>
                <p>
                  No ambiente de produção da <strong>Vercel</strong>, para que a IA reformule os relatos dos professores com correção gramatical e tom respeitoso, informe a sua chave gratuita do <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="underline font-bold text-purple-700 hover:text-purple-900">Google AI Studio</a>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Cole sua Chave de API do Gemini:
                </label>
                <div className="relative">
                  <input
                    type={mostrarChave ? 'text' : 'password'}
                    value={chaveGeminiInput}
                    onChange={e => setChaveGeminiInput(e.target.value)}
                    placeholder="Cole aqui (Ex: AIzaSy...)"
                    className="w-full p-2.5 pr-10 text-xs border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden font-mono text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarChave(!mostrarChave)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {mostrarChave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {resultadoTesteGemini && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    resultadoTesteGemini.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {resultadoTesteGemini.success ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                    <span>{resultadoTesteGemini.message}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  disabled={testandoGemini || !chaveGeminiInput.trim()}
                  onClick={handleTestarChaveGemini}
                  className="py-2.5 px-4 rounded-xl border border-purple-300 text-purple-700 font-bold text-xs hover:bg-purple-50 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {testandoGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Testar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalConfigurarChave(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  disabled={!chaveGeminiInput.trim()}
                  onClick={() => handleSalvarChaveGemini(chaveGeminiInput)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar Chave e Ativar IA</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
