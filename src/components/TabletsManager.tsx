import React, { useState, useEffect, useMemo } from 'react';
import {
  Tablet,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  Lock,
  Ban,
  Coffee,
  Utensils,
  User,
  Users,
  ShieldCheck,
  Shield,
  Calendar,
  Wrench,
  AlertTriangle,
  Trash2,
  Edit2,
  Search,
  Laptop,
  Save,
  X
} from 'lucide-react';
import {
  EquipmentCondition,
  EquipmentItem,
  SchoolClass,
  TeacherScheduleSlot
} from '../types';
import { storageService } from '../data/storageService';
import { firestoreService } from '../lib/firestoreService';
import { carregarTabletsSeguro, salvarReservaTabletsSeguro } from '../lib/sheetsSyncService';
import {
  findPlatformLockForBooking,
  findPlatformSlotsForDateAndPeriod
} from '../utils/scheduleUtils';
import tabletsBaseline from '../data/tabletsBaseline.json';

export interface AgendamentoTablet {
  id?: string;
  data: string;
  aula: string;
  professor: string;
  turma: string;
  tablets: number;
  quantity?: number;
  equipmentType?: string;
  senha?: string;
}

export interface FeriadoBloqueio {
  data: string;
  motivo: string;
}

export interface TabletsDatabase {
  agendamentos: AgendamentoTablet[];
  horarios: string[];
  professores: Array<string | { nome: string }>;
  turmas: string[];
  feriados: FeriadoBloqueio[];
  equipamentos?: EquipmentItem[];
  maxTablets?: number;
}

interface TabletsManagerProps {
  currentUser?: { id: string; name: string; role: string; pin?: string; roleLabel?: string } | null;
  classes: SchoolClass[];
}

const DEFAULT_TABLETS_COUNT = 23;

const SUGGESTED_EQUIPMENT_TYPES = [
  'Tablet',
  'Computador',
  'Chromebook',
  'Notebook',
  'Projetor / Data Show',
  'Caixa de Som',
  'Kit Robótica',
];

/**
 * Aulas com plataformas digitais utilizam computadores/notebooks/chromebooks — NÃO tablets.
 * Portanto, a trava de plataforma aplica-se exclusivamente a equipamentos da categoria computador.
 */
function isComputerEquipmentType(equipmentType?: string): boolean {
  const norm = (equipmentType || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!norm || norm.includes('tablet')) return false;
  return (
    norm.includes('computador') ||
    norm.includes('notebook') ||
    norm.includes('chromebook') ||
    norm.includes('desktop') ||
    norm.includes('laptop') ||
    /\bpc\b/.test(norm)
  );
}

const CONDITION_META: Record<
  EquipmentCondition,
  { numberLabel: string; label: string; shortLabel: string; badgeClass: string }
> = {
  em_uso: {
    numberLabel: '1. Em Uso',
    label: '1. Em Uso (Disponível para agendamento)',
    shortLabel: '1. Em Uso',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  quebrado: {
    numberLabel: '2. Quebrado',
    label: '2. Quebrado (Indisponível)',
    shortLabel: '2. Quebrado',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  em_manutencao: {
    numberLabel: '3. Em manutenção',
    label: '3. Em manutenção (Assistência)',
    shortLabel: '3. Em manutenção',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
};

function createDefaultEquipmentList(count: number = DEFAULT_TABLETS_COUNT): EquipmentItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `eq-tablet-${String(idx + 1).padStart(2, '0')}`,
    nome: `Tablet ${String(idx + 1).padStart(2, '0')}`,
    tipo: 'Tablet',
    patrimonio: '',
    condicao: 'em_uso',
  }));
}

export const TabletsManager: React.FC<TabletsManagerProps> = ({ currentUser, classes }) => {
  const [activeTab, setActiveTab] = useState<'grade' | 'equipamentos'>('grade');
  const [dataReferencia, setDataReferencia] = useState<Date>(new Date());
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' | 'info' | '' }>({
    texto: '',
    tipo: '',
  });

  // Grade Horária da Escola para Trava de Aulas com Plataforma Digital
  const [teacherSchedules, setTeacherSchedules] = useState<TeacherScheduleSlot[]>(() =>
    storageService.getTeacherSchedules()
  );

  useEffect(() => {
    const sId = storageService.getActiveSchoolId();
    setTeacherSchedules(storageService.getTeacherSchedules(sId));
    firestoreService
      .getTeacherSchedules(sId)
      .then(cloud => {
        if (Array.isArray(cloud)) {
          storageService.setTeacherSchedules(cloud, sId);
          setTeacherSchedules(cloud);
        }
      })
      .catch(() => {});
  }, []);

  // Base de Dados (Inicializa com baseline ou cache local, garantindo lista de equipamentos)
  const [baseDeDados, setBaseDeDados] = useState<TabletsDatabase>(() => {
    try {
      const sId = storageService.getActiveSchoolId();
      const cacheKey = sId === 'ee-arlindo-silvestre' ? 'CACHE_TABLET_APP' : `CACHE_TABLET_APP_${sId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.agendamentos || parsed.horarios)) {
          const equips =
            Array.isArray(parsed.equipamentos) && parsed.equipamentos.length > 0
              ? parsed.equipamentos
              : createDefaultEquipmentList(parsed.maxTablets || DEFAULT_TABLETS_COUNT);
          return { ...parsed, equipamentos: equips };
        }
      }
    } catch {}
    const base = (tabletsBaseline as unknown as TabletsDatabase) || {
      agendamentos: [],
      horarios: [
        '1ª Aula - (07h as 7h50)',
        '2ª Aula - (07h50 as 8h40)',
        '3ª Aula - (08h40 as 9h30)',
        'Intervalo - 09h30 as 9h45',
        '4ª Aula - (09h45 as 10h35)',
        '5ª Aula - (10h35 as 11h25)',
        '6ª Aula - (11h25 as 12h15)',
        'Almoço - 12h15 as 13h15',
        '7ª Aula - (13h15 as 14h05)',
        '8ª Aula - (14h05 as 14h55)',
        'Intervalo - 14h55 as 15h10',
        '9ª Aula - (15h10 as 16h)',
      ],
      professores: [],
      turmas: [],
      feriados: [],
    };
    return {
      ...base,
      equipamentos:
        Array.isArray(base.equipamentos) && base.equipamentos.length > 0
          ? base.equipamentos
          : createDefaultEquipmentList(base.maxTablets || DEFAULT_TABLETS_COUNT),
    };
  });

  // Tipo de Equipamento selecionado na Grade Semanal
  const [selectedEquipmentType, setSelectedEquipmentType] = useState<string>('Tablet');

  // Estados do Cadastro de Equipamentos
  const [eqFilterType, setEqFilterType] = useState<string>('todos');
  const [eqFilterCondition, setEqFilterCondition] = useState<string>('todas');
  const [eqSearch, setEqSearch] = useState<string>('');
  const [newEqType, setNewEqType] = useState<string>('Tablet');
  const [newEqCustomType, setNewEqCustomType] = useState<string>('');
  const [newEqNamePrefix, setNewEqNamePrefix] = useState<string>('Tablet');
  const [newEqPatrimonio, setNewEqPatrimonio] = useState<string>('');
  const [newEqQty, setNewEqQty] = useState<number>(1);
  const [newEqCondition, setNewEqCondition] = useState<EquipmentCondition>('em_uso');
  const [newEqObs, setNewEqObs] = useState<string>('');
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [editingEqData, setEditingEqData] = useState<EquipmentItem | null>(null);
  const [salvandoEquipamentos, setSalvandoEquipamentos] = useState(false);

  // Modal de Agendamento / Cancelamento
  const [modalAberto, setModalAberto] = useState(false);
  const [modalContext, setModalContext] = useState<{
    dataIso: string;
    dataBr: string;
    aula: string;
  } | null>(null);

  const [operacao, setOperacao] = useState<'agendar' | 'cancelar'>('agendar');
  const [modoAdminOutroUsuario, setModoAdminOutroUsuario] = useState(false);
  const [professorCustomizado, setProfessorCustomizado] = useState('');
  const [formAgendar, setFormAgendar] = useState({
    equipmentType: 'Tablet',
    professor: currentUser?.name || '',
    turma: '',
    quantity: 17,
    senha: currentUser?.pin || '',
  });

  const [reservaSelecionadaParaCancelar, setReservaSelecionadaParaCancelar] = useState<string>('');
  const [senhaCancelar, setSenhaCancelar] = useState<string>(currentUser?.pin || '');
  const [enviandoOperacao, setEnviandoOperacao] = useState(false);

  // Identificação do Usuário Logado
  const userName = currentUser?.name || 'Professor / Docente';
  const userRole = (currentUser?.role || 'professor').toLowerCase();
  const userRoleLabel = currentUser?.roleLabel
    ? String(currentUser.roleLabel)
    : userRole === 'admin'
    ? 'Direção Escolar (Administrador)'
    : 'Professor(a) / Docente';

  const isAdmin =
    userRole === 'admin' ||
    userRole === 'admin_escola' ||
    userRole === 'super_admin' ||
    userRole === 'administrador' ||
    userRoleLabel.toLowerCase().includes('administrador') ||
    (userRole.includes('admin') && !userRole.includes('gest'));

  const isGestao = userRole === 'gestao_paac';
  const canManageEquipment = isAdmin || isGestao;

  useEffect(() => {
    if (userName && !modoAdminOutroUsuario) {
      setFormAgendar(prev => ({
        ...prev,
        professor: userName,
        senha: currentUser?.pin || '1234',
      }));
    }
  }, [userName, currentUser?.pin, modoAdminOutroUsuario]);

  const formatarPrimeiroEUltimoNome = (nome: string): string => {
    if (!nome || !nome.trim()) return '';
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '';
    if (partes.length === 1) return partes[0];
    const prefixos = ['prof.', 'profª.', 'profa.', 'professor', 'professora', 'dr.', 'dra.'];
    if (prefixos.includes(partes[0].toLowerCase())) {
      if (partes.length === 2) return partes[1];
      return `${partes[1]} ${partes[partes.length - 1]}`;
    }
    return `${partes[0]} ${partes[partes.length - 1]}`;
  };

  const isMinhaReserva = (ag: AgendamentoTablet | { professor?: string }): boolean => {
    if (!currentUser?.name) return false;
    const nomeUser = currentUser.name.trim().toLowerCase();
    const nomeProf = (ag.professor || '').trim().toLowerCase();
    if (nomeUser === nomeProf) return true;
    const p1 = formatarPrimeiroEUltimoNome(nomeUser).toLowerCase();
    const p2 = formatarPrimeiroEUltimoNome(nomeProf).toLowerCase();
    return p1 === p2;
  };

  const normalizarDataStr = (str: string): string => {
    if (!str) return '';
    str = String(str).trim();
    if (str.includes('T')) str = str.split('T')[0];
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const dia = parts[0].trim().padStart(2, '0');
        const mes = parts[1].trim().padStart(2, '0');
        let ano = parts[2].trim();
        if (ano.length === 2) ano = '20' + ano;
        return `${ano}-${mes}-${dia}`;
      }
    }
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        const p0 = parts[0].trim();
        const p1 = parts[1].trim().padStart(2, '0');
        const p2 = parts[2].trim().padStart(2, '0');
        if (p0.length === 4) return `${p0}-${p1}-${p2}`;
        if (p2.length === 4) return `${p2}-${p1}-${p0.padStart(2, '0')}`;
      }
    }
    return str;
  };

  const formatarDataIso = (d: Date) => {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  };

  const formatarDataBR = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const getSegundaFeira = (d: Date): Date => {
    const data = new Date(d);
    const day = data.getDay();
    const diff = data.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(data.setDate(diff));
  };

  const diasDaSemana = useMemo(() => {
    const segunda = getSegundaFeira(dataReferencia);
    const dias: Date[] = [];
    for (let i = 0; i < 5; i++) {
      const dia = new Date(segunda);
      dia.setDate(segunda.getDate() + i);
      dias.push(dia);
    }
    return dias;
  }, [dataReferencia]);

  const mudarSemana = (direcao: number) => {
    setDataReferencia(prev => {
      const nova = new Date(prev);
      nova.setDate(nova.getDate() + direcao * 7);
      return nova;
    });
  };

  const carregarDadosDoSheets = async () => {
    setSincronizando(true);
    try {
      const resultado = await carregarTabletsSeguro(classes);
      const data = resultado.data;

      if (data) {
        let turmasFinais = data.turmas || [];
        if (turmasFinais.length === 0 && classes.length > 0) {
          turmasFinais = classes.map(c => c.name);
        }

        const agendamentosUnicosMap = new Map<string, AgendamentoTablet>();
        for (const ag of (data.agendamentos || [])) {
          const tipo = (ag.equipmentType || 'Tablet').trim();
          const qty = Number(ag.quantity ?? ag.tablets ?? 0);
          const key = ag.id
            ? ag.id
            : [
                (ag.data || '').trim(),
                (ag.aula || '').trim(),
                (ag.professor || '').trim(),
                (ag.turma || '').trim(),
                tipo.toLowerCase(),
                qty,
              ].join('::');
          if (!agendamentosUnicosMap.has(key)) {
            agendamentosUnicosMap.set(key, {
              ...ag,
              equipmentType: tipo,
              quantity: qty,
              tablets: qty,
            });
          }
        }

        const agendamentosLimpos = Array.from(agendamentosUnicosMap.values());
        const equips: EquipmentItem[] =
          Array.isArray(data.equipamentos) && data.equipamentos.length > 0
            ? data.equipamentos
            : createDefaultEquipmentList(data.maxTablets || DEFAULT_TABLETS_COUNT);

        const novoDb: TabletsDatabase = {
          agendamentos: agendamentosLimpos,
          horarios:
            data.horarios && data.horarios.length > 0 ? data.horarios : baseDeDados.horarios,
          professores: data.professores || [],
          turmas: turmasFinais,
          feriados: data.feriados || [],
          equipamentos: equips,
          maxTablets: data.maxTablets,
        };

        setBaseDeDados(novoDb);
      }
    } catch (err: any) {
      console.warn('Erro ao sincronizar equipamentos:', err?.message);
    } finally {
      setSincronizando(false);
    }
  };

  useEffect(() => {
    carregarDadosDoSheets();
  }, []);

  // Lista de Equipamentos Consolidada
  const equipmentList = useMemo<EquipmentItem[]>(() => {
    if (Array.isArray(baseDeDados.equipamentos) && baseDeDados.equipamentos.length > 0) {
      return baseDeDados.equipamentos;
    }
    return createDefaultEquipmentList(baseDeDados.maxTablets || DEFAULT_TABLETS_COUNT);
  }, [baseDeDados.equipamentos, baseDeDados.maxTablets]);

  // Tipos de Equipamento Cadastrados na Escola
  const equipmentTypes = useMemo<string[]>(() => {
    const types = new Set<string>();
    equipmentList.forEach(eq => {
      if (eq.tipo && eq.tipo.trim()) types.add(eq.tipo.trim());
    });
    if (types.size === 0) types.add('Tablet');
    return Array.from(types).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [equipmentList]);

  useEffect(() => {
    if (!equipmentTypes.includes(selectedEquipmentType)) {
      setSelectedEquipmentType(equipmentTypes[0] || 'Tablet');
    }
  }, [equipmentTypes, selectedEquipmentType]);

  // Resumo por Tipo e por Condição (1. Em Uso, 2. Quebrado, 3. Em manutenção)
  const inventoryStats = useMemo(() => {
    const byCondition = { em_uso: 0, quebrado: 0, em_manutencao: 0 };
    const byType = new Map<
      string,
      { total: number; em_uso: number; quebrado: number; em_manutencao: number }
    >();

    for (const eq of equipmentList) {
      const cond: EquipmentCondition =
        eq.condicao === 'quebrado' || eq.condicao === 'em_manutencao' ? eq.condicao : 'em_uso';
      byCondition[cond] += 1;

      const t = (eq.tipo || 'Tablet').trim();
      const entry = byType.get(t) || { total: 0, em_uso: 0, quebrado: 0, em_manutencao: 0 };
      entry.total += 1;
      entry[cond] += 1;
      byType.set(t, entry);
    }

    return {
      total: equipmentList.length,
      byCondition,
      byType,
    };
  }, [equipmentList]);

  const getActiveCapacityForType = (tipo: string): number => {
    const norm = (tipo || 'Tablet').trim().toLowerCase();
    return equipmentList.filter(
      e => (e.tipo || 'Tablet').trim().toLowerCase() === norm && e.condicao === 'em_uso'
    ).length;
  };

  const activeCapacitySelectedType = getActiveCapacityForType(selectedEquipmentType);

  const getBookingsForSlotAndType = (dataIso: string, aula: string, tipo: string) => {
    const normType = (tipo || 'Tablet').trim().toLowerCase();
    return baseDeDados.agendamentos.filter(a => {
      if (normalizarDataStr(a.data) !== dataIso) return false;
      if (String(a.aula).trim() !== aula) return false;
      const agType = (a.equipmentType || 'Tablet').trim().toLowerCase();
      return agType === normType;
    });
  };

  const getAvailableForSlotAndType = (dataIso: string, aula: string, tipo: string): number => {
    const cap = getActiveCapacityForType(tipo);
    const bookings = getBookingsForSlotAndType(dataIso, aula, tipo);
    const used = bookings.reduce((acc, cur) => acc + (cur.quantity ?? cur.tablets ?? 0), 0);
    return Math.max(0, cap - used);
  };

  const listaProfessores = useMemo(() => {
    const doSheets = baseDeDados.professores.map(p =>
      typeof p === 'object' && p !== null ? (p as any).nome : String(p)
    );
    let dosUsuarios: string[] = [];
    try {
      const users = storageService.getUsers();
      dosUsuarios = users.map(u => u.name);
    } catch {}

    const dasTurmas: string[] = [];
    classes.forEach(c => {
      if ((c as any).tutor) dasTurmas.push((c as any).tutor);
    });

    if (currentUser?.name && !doSheets.includes(currentUser.name)) {
      doSheets.push(currentUser.name);
    }

    return Array.from(new Set([...doSheets, ...dosUsuarios, ...dasTurmas]))
      .map(s => (s || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [baseDeDados.professores, classes, currentUser]);

  const listaTurmas = useMemo(() => {
    const doSheets = baseDeDados.turmas || [];
    const daPlataforma = classes.map(c => c.name);
    return Array.from(new Set([...doSheets, ...daPlataforma])).filter(Boolean).sort();
  }, [baseDeDados.turmas, classes]);

  // A trava de plataforma aplica-se apenas a computadores/notebooks/chromebooks (Tablets ficam livres)
  const selectedTypeUsesPlatformLock = useMemo(
    () => isComputerEquipmentType(selectedEquipmentType),
    [selectedEquipmentType]
  );

  const formTypeUsesPlatformLock = useMemo(
    () => isComputerEquipmentType(formAgendar.equipmentType),
    [formAgendar.equipmentType]
  );

  // Verifica trava de plataforma para o agendamento atual dentro do Modal (somente para computadores)
  const modalPlatformSlotsForPeriod = useMemo(() => {
    if (!modalContext || !formTypeUsesPlatformLock) return [];
    return findPlatformSlotsForDateAndPeriod({
      dateStr: modalContext.dataIso,
      aulaLabel: modalContext.aula,
      teacherSchedules,
    });
  }, [modalContext, formTypeUsesPlatformLock, teacherSchedules]);

  const activePlatformLock = useMemo(() => {
    if (!modalContext || !formTypeUsesPlatformLock) return null;
    const professorAtual =
      modoAdminOutroUsuario && formAgendar.professor === '__OUTRO__'
        ? professorCustomizado.trim()
        : formAgendar.professor.trim();
    return findPlatformLockForBooking({
      dateStr: modalContext.dataIso,
      aulaLabel: modalContext.aula,
      className: formAgendar.turma,
      teacherName: professorAtual,
      teacherSchedules,
    });
  }, [modalContext, formTypeUsesPlatformLock, formAgendar.turma, formAgendar.professor, modoAdminOutroUsuario, professorCustomizado, teacherSchedules]);

  const modalAvailableQty = useMemo(() => {
    if (!modalContext) return 0;
    return getAvailableForSlotAndType(
      modalContext.dataIso,
      modalContext.aula,
      formAgendar.equipmentType
    );
  }, [modalContext, formAgendar.equipmentType, baseDeDados.agendamentos, equipmentList]);

  // Abre Modal de Agendamento/Cancelamento
  const abrirModal = (dataIso: string, dataBr: string, aula: string) => {
    setModalContext({ dataIso, dataBr, aula });

    const disponiveis = getAvailableForSlotAndType(dataIso, aula, selectedEquipmentType);
    const agendadosTodosTipos = baseDeDados.agendamentos.filter(
      a => normalizarDataStr(a.data) === dataIso && String(a.aula).trim() === aula
    );

    const permitidasParaCancelar = isAdmin
      ? agendadosTodosTipos
      : agendadosTodosTipos.filter(isMinhaReserva);

    if (disponiveis > 0) {
      setOperacao('agendar');
    } else if (permitidasParaCancelar.length > 0) {
      setOperacao('cancelar');
    } else {
      setOperacao('agendar');
    }

    setModoAdminOutroUsuario(false);
    setProfessorCustomizado('');
    setFormAgendar({
      equipmentType: selectedEquipmentType,
      quantity: disponiveis > 0 ? Math.min(17, disponiveis) : 1,
      professor: currentUser?.name || '',
      senha: currentUser?.pin || '',
      turma: '',
    });

    if (permitidasParaCancelar.length > 0) {
      setReservaSelecionadaParaCancelar(JSON.stringify(permitidasParaCancelar[0]));
    } else {
      setReservaSelecionadaParaCancelar('');
    }

    setSenhaCancelar(currentUser?.pin || '');
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setModalContext(null);
    setModoAdminOutroUsuario(false);
    setProfessorCustomizado('');
  };

  // Submit: Agendar Equipamento
  const handleAgendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalContext) return;

    const professorFinal =
      modoAdminOutroUsuario && formAgendar.professor === '__OUTRO__'
        ? professorCustomizado.trim()
        : formAgendar.professor.trim();

    if (!professorFinal) {
      setMensagem({ texto: 'Por favor, selecione ou informe o nome do(a) professor(a).', tipo: 'erro' });
      return;
    }

    if (!formAgendar.turma) {
      setMensagem({ texto: 'Por favor, selecione uma turma.', tipo: 'erro' });
      return;
    }

    // Trava de segurança para aulas com plataformas na Grade Horária (aplicada apenas a computadores; Tablets liberados)
    const platformLock = isComputerEquipmentType(formAgendar.equipmentType)
      ? findPlatformLockForBooking({
          dateStr: modalContext.dataIso,
          aulaLabel: modalContext.aula,
          className: formAgendar.turma,
          teacherName: professorFinal,
          teacherSchedules,
        })
      : null;

    if (platformLock) {
      setMensagem({
        texto: `🔒 Agendamento de ${formAgendar.equipmentType} bloqueado: a turma ${formAgendar.turma} possui aula com plataforma digital (${platformLock.platformName || 'Plataforma'}) cadastrada na Grade Horária para este horário.`,
        tipo: 'erro',
      });
      return;
    }

    const disponiveisTipo = getAvailableForSlotAndType(
      modalContext.dataIso,
      modalContext.aula,
      formAgendar.equipmentType
    );

    if (disponiveisTipo <= 0) {
      setMensagem({
        texto: `Não há unidades de "${formAgendar.equipmentType}" na condição "1. Em Uso" disponíveis neste horário.`,
        tipo: 'erro',
      });
      return;
    }

    const qtySolicitada = Math.max(1, Math.min(Number(formAgendar.quantity) || 1, disponiveisTipo));
    const bookingId = `ag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setEnviandoOperacao(true);
    const payload = {
      action: 'agendar',
      id: bookingId,
      data: modalContext.dataIso,
      aula: modalContext.aula,
      professor: professorFinal,
      turma: formAgendar.turma,
      equipmentType: formAgendar.equipmentType,
      quantity: qtySolicitada,
      tablets: qtySolicitada,
      senha: formAgendar.senha || currentUser?.pin || '1234',
    };

    try {
      const res = await salvarReservaTabletsSeguro(payload);
      if (!res.ok) {
        setMensagem({ texto: 'Erro ao registrar reserva: ' + (res.msg || 'Verifique os dados.'), tipo: 'erro' });
      } else {
        setSelectedEquipmentType(formAgendar.equipmentType);
        setMensagem({
          texto: `✅ Agendamento de ${qtySolicitada}x ${formAgendar.equipmentType} confirmado para ${formAgendar.turma}!`,
          tipo: 'sucesso',
        });
        fecharModal();

        const novaReserva: AgendamentoTablet = {
          id: bookingId,
          data: modalContext.dataIso,
          aula: modalContext.aula,
          professor: professorFinal,
          turma: formAgendar.turma,
          equipmentType: formAgendar.equipmentType,
          quantity: qtySolicitada,
          tablets: qtySolicitada,
        };
        setBaseDeDados(prev => {
          const atualizados = [novaReserva, ...prev.agendamentos];
          const novoDb = { ...prev, agendamentos: atualizados };
          try {
            const sId = storageService.getActiveSchoolId();
            const cacheKey = sId === 'ee-arlindo-silvestre' ? 'CACHE_TABLET_APP' : `CACHE_TABLET_APP_${sId}`;
            localStorage.setItem(cacheKey, JSON.stringify(novoDb));
          } catch {}
          return novoDb;
        });

        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
        carregarDadosDoSheets();
      }
    } catch (err: any) {
      setMensagem({ texto: 'Erro de comunicação ao salvar a reserva: ' + err.message, tipo: 'erro' });
    } finally {
      setEnviandoOperacao(false);
    }
  };

  // Submit: Cancelar Agendamento
  const handleCancelar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservaSelecionadaParaCancelar) {
      setMensagem({ texto: 'Selecione o agendamento a cancelar.', tipo: 'erro' });
      return;
    }

    setEnviandoOperacao(true);
    try {
      const reservaObj: AgendamentoTablet = JSON.parse(reservaSelecionadaParaCancelar);

      if (!isAdmin && !isMinhaReserva(reservaObj)) {
        setMensagem({
          texto: '❌ Permissão restrita: apenas o Administrador pode cancelar reservas de outros professores.',
          tipo: 'erro',
        });
        return;
      }

      const payload = {
        action: 'cancelar',
        id: reservaObj.id,
        data: reservaObj.data,
        aula: reservaObj.aula,
        professor: reservaObj.professor,
        turma: reservaObj.turma,
        equipmentType: reservaObj.equipmentType || 'Tablet',
        senha: senhaCancelar,
      };

      const res = await salvarReservaTabletsSeguro(payload);
      if (!res.ok) {
        setMensagem({ texto: 'Erro ao cancelar: ' + (res.msg || 'Verifique a senha.'), tipo: 'erro' });
      } else {
        setMensagem({
          texto: `✅ Agendamento de ${reservaObj.professor} (${reservaObj.turma}) cancelado com sucesso!`,
          tipo: 'sucesso',
        });
        fecharModal();

        setBaseDeDados(prev => {
          const filtrados = prev.agendamentos.filter(a => {
            if (reservaObj.id && a.id) return a.id !== reservaObj.id;
            return !(
              normalizarDataStr(a.data) === normalizarDataStr(reservaObj.data) &&
              a.aula === reservaObj.aula &&
              a.professor === reservaObj.professor &&
              a.turma === reservaObj.turma &&
              (a.equipmentType || 'Tablet').toLowerCase() ===
                (reservaObj.equipmentType || 'Tablet').toLowerCase()
            );
          });
          const novoDb = { ...prev, agendamentos: filtrados };
          try {
            const sId = storageService.getActiveSchoolId();
            const cacheKey = sId === 'ee-arlindo-silvestre' ? 'CACHE_TABLET_APP' : `CACHE_TABLET_APP_${sId}`;
            localStorage.setItem(cacheKey, JSON.stringify(novoDb));
          } catch {}
          return novoDb;
        });

        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
        carregarDadosDoSheets();
      }
    } catch (err: any) {
      setMensagem({ texto: 'Erro ao cancelar reserva: ' + err.message, tipo: 'erro' });
    } finally {
      setEnviandoOperacao(false);
    }
  };

  // Salvar Inventário de Equipamentos
  const persistEquipamentos = async (nextEquipamentos: EquipmentItem[], feedbackMsg: string) => {
    setSalvandoEquipamentos(true);
    try {
      const tabletsEmUso = nextEquipamentos.filter(
        e => e.tipo.toLowerCase() === 'tablet' && e.condicao === 'em_uso'
      ).length;
      const updatedDb: TabletsDatabase = {
        ...baseDeDados,
        equipamentos: nextEquipamentos,
        maxTablets: tabletsEmUso || baseDeDados.maxTablets || DEFAULT_TABLETS_COUNT,
      };
      setBaseDeDados(updatedDb);
      await salvarReservaTabletsSeguro(
        {
          action: 'salvar_config_tablets',
          equipamentos: nextEquipamentos,
          maxTablets: updatedDb.maxTablets,
        },
        updatedDb
      );
      setMensagem({ texto: feedbackMsg, tipo: 'sucesso' });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4500);
    } catch (err: any) {
      setMensagem({
        texto: 'Erro ao salvar cadastro de equipamentos: ' + (err?.message || 'Erro desconhecido'),
        tipo: 'erro',
      });
    } finally {
      setSalvandoEquipamentos(false);
    }
  };

  const handleAddEquipamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageEquipment) return;

    const tipoFinal = newEqType === '__OUTRO__' ? newEqCustomType.trim() : newEqType.trim();
    if (!tipoFinal) {
      setMensagem({ texto: 'Informe o tipo do equipamento.', tipo: 'erro' });
      return;
    }

    const prefixo = newEqNamePrefix.trim() || tipoFinal;
    const qty = Math.max(1, Math.min(50, Number(newEqQty) || 1));
    const nowIso = new Date().toISOString();

    const existingSameType = equipmentList.filter(
      eq => eq.tipo.trim().toLowerCase() === tipoFinal.toLowerCase()
    ).length;

    const novos: EquipmentItem[] = Array.from({ length: qty }, (_, idx) => {
      const seqNum = existingSameType + idx + 1;
      const nomeItem = qty === 1 && newEqNamePrefix.trim()
        ? (/\d/.test(prefixo) ? prefixo : `${prefixo} ${String(seqNum).padStart(2, '0')}`)
        : `${prefixo} ${String(seqNum).padStart(2, '0')}`;
      return {
        id: `eq-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        nome: nomeItem,
        tipo: tipoFinal,
        patrimonio: qty === 1 ? newEqPatrimonio.trim() : '',
        condicao: newEqCondition,
        observacao: newEqObs.trim() || undefined,
        atualizadoEm: nowIso,
        atualizadoPor: userName,
      };
    });

    const nextList = [...equipmentList, ...novos];
    await persistEquipamentos(
      nextList,
      `✅ ${qty} equipamento(s) do tipo "${tipoFinal}" cadastrado(s) com condição "${CONDITION_META[newEqCondition].numberLabel}".`
    );

    setNewEqPatrimonio('');
    setNewEqObs('');
    setNewEqQty(1);
    if (newEqType === '__OUTRO__') {
      setNewEqType(tipoFinal);
      setNewEqCustomType('');
    }
  };

  const handleUpdateCondition = async (itemId: string, novaCondicao: EquipmentCondition) => {
    if (!canManageEquipment) return;
    const nowIso = new Date().toISOString();
    const nextList = equipmentList.map(eq =>
      eq.id === itemId
        ? { ...eq, condicao: novaCondicao, atualizadoEm: nowIso, atualizadoPor: userName }
        : eq
    );
    const target = equipmentList.find(eq => eq.id === itemId);
    await persistEquipamentos(
      nextList,
      `Condição de "${target?.nome || 'Equipamento'}" alterada para ${CONDITION_META[novaCondicao].numberLabel}.`
    );
  };

  const handleSaveEditedEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageEquipment || !editingEqData) return;
    const nowIso = new Date().toISOString();
    const nextList = equipmentList.map(eq =>
      eq.id === editingEqData.id
        ? { ...editingEqData, atualizadoEm: nowIso, atualizadoPor: userName }
        : eq
    );
    setEditingEqId(null);
    setEditingEqData(null);
    await persistEquipamentos(nextList, `Equipamento "${editingEqData.nome}" atualizado com sucesso.`);
  };

  const handleDeleteEquipment = async (itemId: string) => {
    if (!canManageEquipment) return;
    const target = equipmentList.find(eq => eq.id === itemId);
    const nextList = equipmentList.filter(eq => eq.id !== itemId);
    await persistEquipamentos(nextList, `Equipamento "${target?.nome || 'Item'}" removido do inventário.`);
  };

  const filteredEquipments = useMemo(() => {
    const q = eqSearch.trim().toLowerCase();
    return equipmentList.filter(eq => {
      if (eqFilterType !== 'todos' && eq.tipo.trim() !== eqFilterType) return false;
      if (eqFilterCondition !== 'todas' && eq.condicao !== eqFilterCondition) return false;
      if (q) {
        const match =
          eq.nome.toLowerCase().includes(q) ||
          eq.tipo.toLowerCase().includes(q) ||
          (eq.patrimonio || '').toLowerCase().includes(q) ||
          (eq.observacao || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [equipmentList, eqFilterType, eqFilterCondition, eqSearch]);

  const nomesDias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

  return (
    <div className="space-y-6">
      {/* Top Institutional Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Laptop className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                Agendamento de Equipamentos Escolares
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                {selectedEquipmentType.toUpperCase()}: {activeCapacitySelectedType} EM USO
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Reserva por tipo de equipamento, controle de condição (1. Em Uso / 2. Quebrado / 3. Em manutenção) e trava automática de plataformas para computadores (Tablets liberados).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 sm:px-3 rounded-xl self-start md:self-auto">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-900 leading-none">{userName}</span>
              <span
                className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${
                  isAdmin
                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                {userRoleLabel}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
              {isAdmin ? '🛡️ Privilégio de Direção / Admin' : isGestao ? '📋 Gestão / Inventário' : '👤 Usuário Ativo'}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-abas: Grade de Agendamento vs Cadastro de Equipamentos */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white rounded-t-2xl px-2">
        <button
          type="button"
          onClick={() => setActiveTab('grade')}
          className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'grade'
              ? 'border-sky-600 text-sky-700 bg-sky-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Grade Semanal de Agendamento</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('equipamentos')}
          className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'equipamentos'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Cadastro & Condição de Equipamentos ({equipmentList.length})</span>
        </button>
      </div>

      {/* Mensagem Toast */}
      {mensagem.texto && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in ${
            mensagem.tipo === 'sucesso'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : mensagem.tipo === 'info'
              ? 'bg-sky-50 border-sky-200 text-sky-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {mensagem.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
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

      {/* ========================================================================= */}
      {/* ABA 1: GRADE SEMANAL DE AGENDAMENTO                                       */}
      {/* ========================================================================= */}
      {activeTab === 'grade' && (
        <div className="space-y-4">
          {/* Seletor de Tipo de Equipamento + Navegação de Semana */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Tipo de Equipamento:
                </label>
                <select
                  value={selectedEquipmentType}
                  onChange={e => setSelectedEquipmentType(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-sky-300 bg-sky-50 text-sky-950 rounded-xl focus:ring-2 focus:ring-sky-500"
                >
                  {equipmentTypes.map(tipo => {
                    const stats = inventoryStats.byType.get(tipo);
                    return (
                      <option key={tipo} value={tipo}>
                        {tipo} ({stats?.em_uso || 0} em uso de {stats?.total || 0})
                      </option>
                    );
                  })}
                </select>
              </div>

              {(() => {
                const st = inventoryStats.byType.get(selectedEquipmentType);
                if (!st) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      1. Em Uso: {st.em_uso}
                    </span>
                    {st.quebrado > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        2. Quebrado: {st.quebrado}
                      </span>
                    )}
                    {st.em_manutencao > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        3. Em manutenção: {st.em_manutencao}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => mudarSemana(-1)}
                  className="p-1 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer"
                  title="Semana anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-800 px-2 select-none">
                  Semana: {formatarDataBR(diasDaSemana[0])} a {formatarDataBR(diasDaSemana[4])}
                </span>
                <button
                  type="button"
                  onClick={() => mudarSemana(1)}
                  className="p-1 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer"
                  title="Próxima semana"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setDataReferencia(new Date())}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200/60 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Semana Atual</span>
              </button>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-4 text-xs bg-white p-3.5 rounded-2xl border border-slate-200">
            <span className="font-bold text-slate-600 text-[11px] uppercase tracking-wider">
              Legenda ({selectedEquipmentType}):
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="font-medium text-slate-700">
                Totalmente Livre ({activeCapacitySelectedType} em uso)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="font-medium text-slate-700">Parcialmente Ocupado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="font-medium text-slate-700">Esgotado / Indisponível</span>
            </div>
            {selectedTypeUsesPlatformLock && (
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span className="font-medium text-slate-700">
                  Trava de Plataforma (Bloqueado para computadores em aula c/ plataforma na Grade Horária)
                </span>
              </div>
            )}
          </div>

          {/* Grade Semanal */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-xs border-b border-slate-200">
                    <th className="p-3 w-36 border-r border-slate-200 text-center font-black">
                      Horário / Aula
                    </th>
                    {diasDaSemana.map((dia, idx) => {
                      const strData = formatarDataIso(dia);
                      const isHoje = strData === formatarDataIso(new Date());
                      const bloqueioDia = baseDeDados.feriados.find(
                        f => normalizarDataStr(f.data) === strData
                      );

                      return (
                        <th
                          key={strData}
                          className={`p-3 text-center border-r border-slate-200 ${
                            isHoje
                              ? 'bg-sky-100/70 text-sky-950 font-black'
                              : bloqueioDia
                              ? 'bg-rose-100 text-rose-950'
                              : 'bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="font-bold text-xs uppercase tracking-wider">
                            {nomesDias[idx]}
                          </div>
                          <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                            {formatarDataBR(dia)}
                          </div>
                          {bloqueioDia && (
                            <div className="text-[10px] font-bold text-rose-600 uppercase mt-0.5 flex items-center justify-center gap-1">
                              <Lock className="w-3 h-3" />
                              <span>Bloqueado</span>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {baseDeDados.horarios.map(aula => {
                    const aulaStr = String(aula || '').trim();
                    const aulaLower = aulaStr.toLowerCase();
                    const isPausa =
                      aulaLower.includes('intervalo') ||
                      aulaLower.includes('almoço') ||
                      aulaLower.includes('almoco') ||
                      aulaLower.includes('recreio') ||
                      aulaLower.includes('pausa') ||
                      aulaLower.includes('café') ||
                      aulaLower.includes('cafe');

                    return (
                      <tr key={aulaStr} className="border-b border-slate-200">
                        <td className="p-3 border-r border-slate-200 text-center font-bold text-slate-700 bg-slate-50/80">
                          {aulaStr}
                        </td>

                        {isPausa ? (
                          <td
                            colSpan={5}
                            className="p-3 text-center bg-slate-100 text-slate-500 font-semibold select-none border-r border-slate-200"
                          >
                            <div className="flex items-center justify-center gap-2 text-xs">
                              {aulaLower.includes('almoço') || aulaLower.includes('almoco') ? (
                                <Utensils className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <Coffee className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              <span>{aulaStr} — Horário Bloqueado / Intervalo</span>
                            </div>
                          </td>
                        ) : (
                          diasDaSemana.map(dia => {
                            const strData = formatarDataIso(dia);
                            const bloqueioDia = baseDeDados.feriados.find(
                              f => normalizarDataStr(f.data) === strData
                            );

                            if (bloqueioDia) {
                              return (
                                <td
                                  key={strData}
                                  className="p-2.5 border-r border-slate-200 text-center bg-rose-50/60 text-rose-700 cursor-not-allowed align-middle"
                                >
                                  <div className="text-rose-600 font-bold text-xs flex items-center justify-center gap-1">
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Bloqueado</span>
                                  </div>
                                  <div className="text-[11px] text-rose-500 mt-1 leading-tight">
                                    {bloqueioDia.motivo}
                                  </div>
                                </td>
                              );
                            }

                            const agendadosAqui = getBookingsForSlotAndType(
                              strData,
                              aulaStr,
                              selectedEquipmentType
                            );
                            const totalUso = agendadosAqui.reduce(
                              (acc, curr) => acc + (curr.quantity ?? curr.tablets ?? 0),
                              0
                            );
                            const disponiveis = Math.max(0, activeCapacitySelectedType - totalUso);
                            const isTotalmenteLivre =
                              activeCapacitySelectedType > 0 && disponiveis === activeCapacitySelectedType;
                            const isEsgotado = disponiveis === 0;

                            const platformSlotsHere = selectedTypeUsesPlatformLock
                              ? findPlatformSlotsForDateAndPeriod({
                                  dateStr: strData,
                                  aulaLabel: aulaStr,
                                  teacherSchedules,
                                })
                              : [];

                            return (
                              <td
                                key={strData}
                                onClick={() => abrirModal(strData, formatarDataBR(dia), aulaStr)}
                                className={`p-2.5 border-r border-slate-200 text-center align-top relative group transition-colors cursor-pointer ${
                                  isTotalmenteLivre
                                    ? 'hover:bg-sky-50'
                                    : isEsgotado
                                    ? 'bg-rose-50/80 hover:bg-rose-100'
                                    : 'bg-amber-50/70 hover:bg-amber-100'
                                }`}
                              >
                                {platformSlotsHere.length > 0 && (
                                  <div
                                    className="mb-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold"
                                    title={`Trava de plataforma ativa para: ${platformSlotsHere
                                      .map(s => `${s.className || s.classId} (${s.platformName || 'Plataforma'})`)
                                      .join(', ')}`}
                                  >
                                    <Lock className="w-2.5 h-2.5 text-amber-700" />
                                    <span>
                                      {platformSlotsHere.length} turma(s) c/ Plataforma
                                    </span>
                                  </div>
                                )}

                                {isTotalmenteLivre ? (
                                  <div className="py-1.5">
                                    <div className="text-emerald-600 font-black text-base flex items-center justify-center gap-1">
                                      <span>{disponiveis}</span>
                                      <Tablet className="w-4 h-4" />
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">
                                      Livres ({selectedEquipmentType})
                                    </div>
                                  </div>
                                ) : isEsgotado ? (
                                  <div className="py-1">
                                    <div className="text-rose-600 font-black text-xs flex items-center justify-center gap-1 mb-1">
                                      <Ban className="w-3.5 h-3.5" />
                                      <span>
                                        {activeCapacitySelectedType === 0 ? 'Sem unid. Em Uso' : 'Esgotado'}
                                      </span>
                                    </div>
                                    <div className="space-y-1 text-left text-[11px]">
                                      {agendadosAqui.map((ag, i) => {
                                        const ehMinha = isMinhaReserva(ag);
                                        const qty = ag.quantity ?? ag.tablets ?? 0;
                                        return (
                                          <div
                                            key={ag.id || i}
                                            className={`p-1.5 rounded-lg border leading-tight ${
                                              ehMinha
                                                ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                                                : 'bg-white/80 border-rose-200'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-1">
                                              <span
                                                className={`font-bold ${
                                                  ehMinha ? 'text-emerald-900' : 'text-slate-800'
                                                }`}
                                              >
                                                • {formatarPrimeiroEUltimoNome(ag.professor)} ({qty} un.)
                                              </span>
                                              {ehMinha && (
                                                <span className="text-[9px] font-black px-1.5 py-0.2 bg-emerald-600 text-white rounded">
                                                  Você
                                                </span>
                                              )}
                                            </div>
                                            <span
                                              className={`text-[10px] block font-medium ${
                                                ehMinha ? 'text-emerald-700' : 'text-rose-700'
                                              }`}
                                            >
                                              Turma: {ag.turma}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="py-1">
                                    <div className="text-amber-700 font-black text-sm flex items-center justify-center gap-1 mb-1">
                                      <span>{disponiveis} livres</span>
                                      <Tablet className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="space-y-1 text-left text-[11px]">
                                      {agendadosAqui.map((ag, i) => {
                                        const ehMinha = isMinhaReserva(ag);
                                        const qty = ag.quantity ?? ag.tablets ?? 0;
                                        return (
                                          <div
                                            key={ag.id || i}
                                            className={`p-1.5 rounded-lg border leading-tight ${
                                              ehMinha
                                                ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                                                : 'bg-white/90 border-amber-200'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-1">
                                              <span
                                                className={`font-bold ${
                                                  ehMinha ? 'text-emerald-900' : 'text-slate-800'
                                                }`}
                                              >
                                                • {formatarPrimeiroEUltimoNome(ag.professor)} ({qty} un.)
                                              </span>
                                              {ehMinha && (
                                                <span className="text-[9px] font-black px-1.5 py-0.2 bg-emerald-600 text-white rounded">
                                                  Você
                                                </span>
                                              )}
                                            </div>
                                            <span
                                              className={`text-[10px] block ${
                                                ehMinha ? 'text-emerald-700 font-medium' : 'text-slate-600'
                                              }`}
                                            >
                                              Turma: {ag.turma}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: CADASTRO DE EQUIPAMENTOS & CONTROLE DE CONDIÇÃO                    */}
      {/* ========================================================================= */}
      {activeTab === 'equipamentos' && (
        <div className="space-y-5">
          {/* KPIs de Condição */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total Cadastrado</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{inventoryStats.total}</div>
              <span className="text-[11px] text-slate-500">{equipmentTypes.length} tipo(s) de equipamento</span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-emerald-800 uppercase">1. Em Uso</span>
              <div className="text-2xl font-black text-emerald-900 mt-1">{inventoryStats.byCondition.em_uso}</div>
              <span className="text-[11px] text-emerald-700">Liberados para agendamento</span>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-rose-800 uppercase">2. Quebrado</span>
              <div className="text-2xl font-black text-rose-900 mt-1">{inventoryStats.byCondition.quebrado}</div>
              <span className="text-[11px] text-rose-700">Indisponíveis / Avariados</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-amber-800 uppercase">3. Em manutenção</span>
              <div className="text-2xl font-black text-amber-900 mt-1">{inventoryStats.byCondition.em_manutencao}</div>
              <span className="text-[11px] text-amber-700">Em reparo ou assistência</span>
            </div>
          </div>

          {/* Resumo por Tipo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
              Resumo por Tipo de Equipamento
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {equipmentTypes.map(tipo => {
                const st = inventoryStats.byType.get(tipo) || {
                  total: 0,
                  em_uso: 0,
                  quebrado: 0,
                  em_manutencao: 0,
                };
                return (
                  <div
                    key={tipo}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">{tipo}</div>
                      <div className="text-[11px] text-slate-500">Total: {st.total} unidade(s)</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 text-[10px] font-bold">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Em Uso: {st.em_uso}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        Quebrado: {st.quebrado}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Manutenção: {st.em_manutencao}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Formulário de Novo Equipamento (Gestão/PAAC & Admin) */}
          {canManageEquipment ? (
            <form
              onSubmit={handleAddEquipamento}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-indigo-600" />
                    <span>Cadastrar Novo Equipamento na Escola</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Adicione unidades individuais ou em lote informando o tipo e a condição atual.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Tipo de Equipamento *</label>
                  <select
                    value={newEqType}
                    onChange={e => {
                      setNewEqType(e.target.value);
                      if (e.target.value !== '__OUTRO__') {
                        setNewEqNamePrefix(e.target.value);
                      }
                    }}
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
                  >
                    {Array.from(new Set([...SUGGESTED_EQUIPMENT_TYPES, ...equipmentTypes])).map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="__OUTRO__">+ Outro Tipo (Digitar)</option>
                  </select>
                </div>

                {newEqType === '__OUTRO__' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Nome do Novo Tipo *</label>
                    <input
                      type="text"
                      required
                      value={newEqCustomType}
                      onChange={e => {
                        setNewEqCustomType(e.target.value);
                        setNewEqNamePrefix(e.target.value);
                      }}
                      placeholder="Ex: Lousa Digital"
                      className="w-full text-xs px-2.5 py-2 border border-indigo-300 rounded-lg bg-white font-semibold"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Identificação / Prefixo *</label>
                  <input
                    type="text"
                    required
                    value={newEqNamePrefix}
                    onChange={e => setNewEqNamePrefix(e.target.value)}
                    placeholder="Ex: Chromebook Sala 1"
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Condição *</label>
                  <select
                    value={newEqCondition}
                    onChange={e => setNewEqCondition(e.target.value as EquipmentCondition)}
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-bold text-slate-800"
                  >
                    <option value="em_uso">1. Em Uso</option>
                    <option value="quebrado">2. Quebrado</option>
                    <option value="em_manutencao">3. Em manutenção</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newEqQty}
                    onChange={e => setNewEqQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Patrimônio (Opcional)</label>
                  <input
                    type="text"
                    value={newEqPatrimonio}
                    onChange={e => setNewEqPatrimonio(e.target.value)}
                    disabled={newEqQty > 1}
                    placeholder={newEqQty > 1 ? 'Individual apenas' : 'Ex: PAT-0042'}
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  value={newEqObs}
                  onChange={e => setNewEqObs(e.target.value)}
                  placeholder="Observação sobre o equipamento ou estado físico (opcional)..."
                  className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
                <button
                  type="submit"
                  disabled={salvandoEquipamentos}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{salvandoEquipamentos ? 'Salvando...' : 'Cadastrar Equipamento(s)'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Modo visualização: apenas <strong>Gestão/PAAC</strong> e <strong>Administrador</strong> podem cadastrar equipamentos ou alterar a condição.
              </span>
            </div>
          )}

          {/* Lista de Equipamentos com Controle de Condição */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={eqSearch}
                    onChange={e => setEqSearch(e.target.value)}
                    placeholder="Buscar nome, patrimônio ou obs..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white w-56"
                  />
                </div>

                <select
                  value={eqFilterType}
                  onChange={e => setEqFilterType(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700"
                >
                  <option value="todos">Todos os Tipos</option>
                  {equipmentTypes.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  value={eqFilterCondition}
                  onChange={e => setEqFilterCondition(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700"
                >
                  <option value="todas">Todas as Condições</option>
                  <option value="em_uso">1. Em Uso</option>
                  <option value="quebrado">2. Quebrado</option>
                  <option value="em_manutencao">3. Em manutenção</option>
                </select>
              </div>

              <span className="text-[11px] font-bold text-slate-500">
                Exibindo {filteredEquipments.length} de {equipmentList.length} equipamentos
              </span>
            </div>

            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Equipamento</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-3">Patrimônio</th>
                    <th className="py-3 px-3">Condição</th>
                    <th className="py-3 px-3">Observação</th>
                    {canManageEquipment && <th className="py-3 px-4 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEquipments.map(eq => {
                    const isEditing = editingEqId === eq.id && editingEqData;
                    const condMeta = CONDITION_META[eq.condicao] || CONDITION_META.em_uso;

                    return (
                      <tr key={eq.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingEqData.nome}
                              onChange={e =>
                                setEditingEqData({ ...editingEqData, nome: e.target.value })
                              }
                              className="px-2 py-1 text-xs border border-indigo-300 rounded bg-white w-40"
                            />
                          ) : (
                            eq.nome
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[11px]">
                            {eq.tipo}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingEqData.patrimonio || ''}
                              onChange={e =>
                                setEditingEqData({ ...editingEqData, patrimonio: e.target.value })
                              }
                              className="px-2 py-1 text-xs border border-indigo-300 rounded bg-white w-28"
                            />
                          ) : (
                            eq.patrimonio || '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {canManageEquipment ? (
                            <select
                              value={eq.condicao}
                              disabled={salvandoEquipamentos}
                              onChange={e =>
                                handleUpdateCondition(eq.id, e.target.value as EquipmentCondition)
                              }
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer ${condMeta.badgeClass}`}
                            >
                              <option value="em_uso">1. Em Uso</option>
                              <option value="quebrado">2. Quebrado</option>
                              <option value="em_manutencao">3. Em manutenção</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${condMeta.badgeClass}`}
                            >
                              {condMeta.numberLabel}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingEqData.observacao || ''}
                              onChange={e =>
                                setEditingEqData({ ...editingEqData, observacao: e.target.value })
                              }
                              placeholder="Observação..."
                              className="px-2 py-1 text-xs border border-indigo-300 rounded bg-white w-full"
                            />
                          ) : (
                            eq.observacao || '—'
                          )}
                        </td>
                        {canManageEquipment && (
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={handleSaveEditedEquipment}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold cursor-pointer"
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingEqId(null);
                                    setEditingEqData(null);
                                  }}
                                  className="p-1 text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingEqId(eq.id);
                                    setEditingEqData({ ...eq });
                                  }}
                                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                                  title="Editar equipamento"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEquipment(eq.id)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  title="Excluir equipamento"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE RESERVA / CANCELAMENTO                                           */}
      {/* ========================================================================= */}
      {modalAberto && modalContext && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="bg-sky-600 text-white px-5 py-4 flex justify-between items-center sticky top-0 z-10">
              <h2 className="font-black text-sm flex items-center gap-2">
                <Laptop className="w-4 h-4" />
                <span>Gerenciar Agendamento de Equipamentos</span>
              </h2>
              <button
                type="button"
                onClick={fecharModal}
                className="font-bold text-lg hover:text-sky-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <p className="text-slate-800 font-bold">
                  Data: <span className="font-normal">{modalContext.dataBr}</span>
                </p>
                <p className="text-slate-800 font-bold mt-0.5">
                  Horário: <span className="font-normal">{modalContext.aula}</span>
                </p>
                <p className="text-sky-700 font-bold mt-1">
                  Disponíveis ({formAgendar.equipmentType}): {modalAvailableQty} de{' '}
                  {getActiveCapacityForType(formAgendar.equipmentType)} em uso
                </p>
              </div>

              {/* Alerta informativo se existem turmas com plataforma neste dia/horário */}
              {modalPlatformSlotsForPeriod.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-950 space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5 text-amber-900">
                    <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Aulas com Plataforma Digital nesta aula (Grade Horária):</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {modalPlatformSlotsForPeriod.map(s => (
                      <span
                        key={s.id}
                        className="px-2 py-0.5 rounded bg-white border border-amber-300 font-semibold text-[10px]"
                      >
                        {s.className || s.classId}: {s.platformName || 'Plataforma'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Seletor de Operação */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  O que você deseja fazer?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOperacao('agendar')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      operacao === 'agendar'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    ➕ Agendar Equipamento
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperacao('cancelar')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      operacao === 'cancelar'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    ❌ Cancelar Reserva
                  </button>
                </div>
              </div>

              {/* FORMULÁRIO 1: AGENDAR */}
              {operacao === 'agendar' && (
                <form onSubmit={handleAgendar} className="space-y-3.5 pt-2 border-t border-slate-200">
                  {/* Tipo de Equipamento */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Tipo de Equipamento *
                    </label>
                    <select
                      value={formAgendar.equipmentType}
                      onChange={e => {
                        const nextType = e.target.value;
                        const nextAvail = getAvailableForSlotAndType(
                          modalContext.dataIso,
                          modalContext.aula,
                          nextType
                        );
                        setFormAgendar(prev => ({
                          ...prev,
                          equipmentType: nextType,
                          quantity: nextAvail > 0 ? Math.min(prev.quantity, nextAvail) : 1,
                        }));
                      }}
                      className="w-full p-2.5 text-xs border border-sky-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-bold text-slate-800 bg-sky-50/40"
                    >
                      {equipmentTypes.map(tipo => {
                        const avail = getAvailableForSlotAndType(
                          modalContext.dataIso,
                          modalContext.aula,
                          tipo
                        );
                        const activeCap = getActiveCapacityForType(tipo);
                        return (
                          <option key={tipo} value={tipo}>
                            {tipo} — {avail} livre(s) de {activeCap} em uso
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Identificação do Solicitante */}
                  {isAdmin ? (
                    <div className="bg-purple-50/90 border border-purple-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-extrabold text-purple-900 uppercase flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                          <span>Solicitante (Administrador)</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModoAdminOutroUsuario(false);
                            setProfessorCustomizado('');
                            setFormAgendar(prev => ({
                              ...prev,
                              professor: userName,
                              senha: currentUser?.pin || '1234',
                            }));
                          }}
                          className={`py-2 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            !modoAdminOutroUsuario
                              ? 'bg-purple-700 text-white shadow-xs'
                              : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-100/60'
                          }`}
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>Em meu nome</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setModoAdminOutroUsuario(true);
                            setFormAgendar(prev => ({
                              ...prev,
                              professor: '',
                              senha: currentUser?.pin || '1234',
                            }));
                          }}
                          className={`py-2 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            modoAdminOutroUsuario
                              ? 'bg-purple-700 text-white shadow-xs'
                              : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-100/60'
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Para outro docente</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                          {userName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">
                            Docente Solicitante
                          </span>
                          <span className="text-xs font-bold text-slate-900">{userName}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                        Identificado
                      </span>
                    </div>
                  )}

                  {isAdmin && modoAdminOutroUsuario && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Selecione o(a) Professor(a)
                      </label>
                      <select
                        value={formAgendar.professor}
                        onChange={e => setFormAgendar({ ...formAgendar, professor: e.target.value })}
                        required
                        className="w-full p-2.5 text-xs border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-semibold text-slate-800 bg-purple-50/30"
                      >
                        <option value="">Selecione o professor na lista...</option>
                        {listaProfessores.map(p => (
                          <option key={p} value={p}>
                            {p} {p === currentUser?.name ? '(Você)' : ''}
                          </option>
                        ))}
                        <option value="__OUTRO__">➕ Outro Docente (Digitar nome)</option>
                      </select>

                      {formAgendar.professor === '__OUTRO__' && (
                        <input
                          type="text"
                          value={professorCustomizado}
                          onChange={e => setProfessorCustomizado(e.target.value)}
                          required
                          placeholder="Digite o nome completo do professor..."
                          className="w-full p-2.5 text-xs border border-purple-300 bg-white rounded-xl font-bold text-slate-800"
                        />
                      )}
                    </div>
                  )}

                  {/* Seleção de Turma */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Turma *
                    </label>
                    <select
                      value={formAgendar.turma}
                      onChange={e => setFormAgendar({ ...formAgendar, turma: e.target.value })}
                      required
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800 bg-white"
                    >
                      <option value="">Selecione a turma...</option>
                      {listaTurmas.map(t => {
                        const slotPlat = formTypeUsesPlatformLock
                          ? findPlatformLockForBooking({
                              dateStr: modalContext.dataIso,
                              aulaLabel: modalContext.aula,
                              className: t,
                              teacherSchedules,
                            })
                          : null;
                        return (
                          <option key={t} value={t}>
                            {t}
                            {slotPlat ? ` (🔒 Trava Plataforma: ${slotPlat.platformName || 'Plataforma'})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Aviso de Trava de Uso em Aula com Plataforma (apenas para computadores) */}
                  {activePlatformLock && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3.5 text-xs text-rose-950 space-y-1">
                      <div className="font-extrabold flex items-center gap-1.5 text-rose-800">
                        <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Trava de Uso Ativada — Aula com Plataforma (Computadores)</span>
                      </div>
                      <p className="leading-relaxed text-rose-900">
                        A Grade Horária indica que nesta aula a turma{' '}
                        <strong>{activePlatformLock.className || formAgendar.turma}</strong> utiliza a plataforma{' '}
                        <strong>{activePlatformLock.platformName || 'Plataforma Digital'}</strong>
                        {activePlatformLock.subject ? ` (${activePlatformLock.subject})` : ''} com{' '}
                        <strong>{activePlatformLock.teacherName}</strong>.
                      </p>
                      <p className="text-[11px] font-bold text-rose-700">
                        Não é possível agendar {formAgendar.equipmentType} neste horário para esta turma/aula. Para Tablets, o agendamento permanece liberado.
                      </p>
                    </div>
                  )}

                  {/* Quantidade */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">
                        Quantidade ({formAgendar.equipmentType})
                      </label>
                      <span className="text-[11px] font-bold text-sky-600">
                        (Máx: {modalAvailableQty} disponíveis em uso)
                      </span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, modalAvailableQty)}
                      disabled={modalAvailableQty <= 0 || Boolean(activePlatformLock)}
                      value={formAgendar.quantity}
                      onChange={e =>
                        setFormAgendar({ ...formAgendar, quantity: parseInt(e.target.value) || 1 })
                      }
                      required
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-bold text-slate-800 disabled:bg-slate-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={enviandoOperacao || modalAvailableQty <= 0 || Boolean(activePlatformLock)}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl transition-all shadow-md text-xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-3"
                  >
                    {activePlatformLock ? (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Bloqueado (Aula com Plataforma)</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          {enviandoOperacao
                            ? 'Gravando Reserva...'
                            : modalAvailableQty <= 0
                            ? 'Sem Unidades Disponíveis'
                            : 'Confirmar Agendamento'}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* FORMULÁRIO 2: CANCELAR */}
              {operacao === 'cancelar' && (
                <form onSubmit={handleCancelar} className="space-y-3.5 pt-2 border-t border-slate-200">
                  {(() => {
                    const agendadosAqui = baseDeDados.agendamentos.filter(
                      a =>
                        normalizarDataStr(a.data) === modalContext.dataIso &&
                        String(a.aula).trim() === modalContext.aula
                    );

                    if (agendadosAqui.length === 0) {
                      return (
                        <div className="p-4 bg-slate-50 text-slate-500 text-center rounded-xl text-xs">
                          Não há agendamentos cadastrados neste horário para cancelamento.
                        </div>
                      );
                    }

                    const permitidasParaCancelar = isAdmin
                      ? agendadosAqui
                      : agendadosAqui.filter(isMinhaReserva);

                    if (!isAdmin && permitidasParaCancelar.length === 0) {
                      return (
                        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1.5">
                          <p className="font-bold flex items-center gap-1.5 text-amber-800">
                            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Cancelamento Restrito</span>
                          </p>
                          <p className="text-slate-700">
                            Este horário possui reserva ativa em nome de:{' '}
                            <strong>
                              {agendadosAqui.map(a => formatarPrimeiroEUltimoNome(a.professor)).join(', ')}
                            </strong>
                            .
                          </p>
                          <p className="text-slate-500 text-[11px] leading-relaxed">
                            Apenas o(a) professor(a) responsável ou a <strong>Direção Escolar</strong> podem cancelar esta reserva.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                            Selecione o Agendamento para Cancelar
                          </label>
                          <select
                            value={reservaSelecionadaParaCancelar}
                            onChange={e => setReservaSelecionadaParaCancelar(e.target.value)}
                            required
                            className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-semibold text-slate-800 bg-white"
                          >
                            <option value="">Selecione o agendamento...</option>
                            {permitidasParaCancelar.map((ag, i) => (
                              <option key={ag.id || i} value={JSON.stringify(ag)}>
                                [{ag.equipmentType || 'Tablet'}] {formatarPrimeiroEUltimoNome(ag.professor)} — Turma:{' '}
                                {ag.turma} ({ag.quantity ?? ag.tablets} un.)
                                {isMinhaReserva(ag) ? ' (Sua reserva)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="submit"
                          disabled={enviandoOperacao}
                          className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl transition-all shadow-md text-xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                        >
                          <Ban className="w-4 h-4" />
                          <span>
                            {enviandoOperacao ? 'Cancelando...' : 'Confirmar Cancelamento'}
                          </span>
                        </button>
                      </>
                    );
                  })()}
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
