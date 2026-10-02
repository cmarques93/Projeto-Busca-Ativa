import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings,
  Users,
  School,
  Clock,
  Sparkles,
  Tablet,
  KeyRound,
  Database,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  Save,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  BookOpen,
  Smartphone,
  Calendar,
  Ban,
  Coffee,
  MessageCircle,
  UserPlus,
  Building2,
  Check,
  Loader2,
  ExternalLink,
  Shield,
  Search,
  Filter,
  Layers,
  ChevronRight,
  Info,
  Phone,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { SchoolClass, Student, UserAccount, UserRole, UserSession } from '../types';
import { storageService, getRoleLabel } from '../data/storageService';
import { firestoreService } from '../lib/firestoreService';
import {
  carregarOcorrenciasSeguro,
  salvarConfigOcorrenciasSeguro,
  carregarTabletsSeguro,
  salvarReservaTabletsSeguro
} from '../lib/sheetsSyncService';
import {
  GRADE_HORARIOS_PADRAO,
  HorarioAula,
  OcorrenciasDatabase
} from './OcorrenciasManager';
import {
  getStoredGeminiKey,
  saveStoredGeminiKey,
  testarChaveGemini
} from '../lib/geminiClient';
import ocorrenciasBaseline from '../data/ocorrenciasBaseline.json';
import tabletsBaseline from '../data/tabletsBaseline.json';

export type SystemConfigSubTab =
  | 'busca_ativa'
  | 'ocorrencias'
  | 'tablets'
  | 'usuarios'
  | 'integracoes';

interface SystemConfigManagerProps {
  currentUser: UserSession;
  classes: SchoolClass[];
  students: Student[];
  onRefresh: () => void;
  onOpenStudentRegistration: () => void;
  onOpenWhatsAppIntegration: () => void;
  onOpenGoogleSheets: () => void;
  onOpenResetAllModal?: () => void;
  onOpenFirebaseStatus?: () => void;
}

export const SystemConfigManager: React.FC<SystemConfigManagerProps> = ({
  currentUser,
  classes,
  students,
  onRefresh,
  onOpenStudentRegistration,
  onOpenWhatsAppIntegration,
  onOpenGoogleSheets,
  onOpenResetAllModal,
  onOpenFirebaseStatus,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SystemConfigSubTab>('busca_ativa');
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' | '' }>({
    texto: '',
    tipo: '',
  });

  const showToast = (texto: string, tipo: 'sucesso' | 'erro' = 'sucesso', duracao = 4500) => {
    setMensagem({ texto, tipo });
    setTimeout(() => setMensagem({ texto: '', tipo: '' }), duracao);
  };

  // ==========================================
  // ESTADOS: SUB-ABA 1 - BUSCA ATIVA & TURMAS
  // ==========================================
  const [abaBuscaAtivaSub, setAbaBuscaAtivaSub] = useState<'turmas' | 'estudantes' | 'parametros'>('turmas');
  const [buscaEstudanteTexto, setBuscaEstudanteTexto] = useState('');
  const [filtroTurmaEstudante, setFiltroTurmaEstudante] = useState('todas');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);

  // Modal de Nova Turma e Edição de Turma
  const [isNewClassModalOpen, setIsNewClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [classToDelete, setClassToDelete] = useState<SchoolClass | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  // Form de Turma
  const [classFormId, setClassFormId] = useState('');
  const [classFormName, setClassFormName] = useState('');
  const [classFormGrade, setClassFormGrade] = useState('9º Ano');
  const [classFormShift, setClassFormShift] = useState<'manha' | 'tarde' | 'integral'>('integral');
  const [classFormRoom, setClassFormRoom] = useState('Sala 01');

  // ==========================================
  // ESTADOS: SUB-ABA 2 - OCORRÊNCIAS ESCOLARES
  // ==========================================
  const [abaOcorrenciasSub, setAbaOcorrenciasSub] = useState<'motivos' | 'medidas' | 'horarios' | 'ia_gemini'>('motivos');
  const [ocorrenciasDb, setOcorrenciasDb] = useState<OcorrenciasDatabase>(() => {
    try {
      const cached = localStorage.getItem('CACHE_OCORRENCIAS_APP');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.ocorrencias && parsed.ocorrencias.length > 0) return parsed;
      }
    } catch {}
    return (ocorrenciasBaseline as unknown as OcorrenciasDatabase) || {
      ocorrencias: [],
      medidas: [],
      aulas: [],
      gradeHorarios: GRADE_HORARIOS_PADRAO,
      auxilio: [],
      registros: [],
    };
  });

  const [novoMotivoOcorrencia, setNovoMotivoOcorrencia] = useState('');
  const [novaMedidaPedagogica, setNovaMedidaPedagogica] = useState('');
  const [itemEditando, setItemEditando] = useState<{ tipo: 'ocorrencia' | 'medida'; index: number; valorAntigo: string; valorNovo: string } | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<{ tipo: 'ocorrencia' | 'medida'; index: number; valor: string } | null>(null);
  const [salvandoConfigOcorrencias, setSalvandoConfigOcorrencias] = useState(false);

  // Grade de Horários das Aulas e Intervalos
  const [gradeHorarios, setGradeHorarios] = useState<HorarioAula[]>(() => {
    if (ocorrenciasDb.gradeHorarios && ocorrenciasDb.gradeHorarios.length > 0) {
      return ocorrenciasDb.gradeHorarios;
    }
    return GRADE_HORARIOS_PADRAO;
  });
  const [novoHorarioNome, setNovoHorarioNome] = useState('');
  const [novoHorarioInicio, setNovoHorarioInicio] = useState('07:00');
  const [novoHorarioFim, setNovoHorarioFim] = useState('07:45');
  const [novoHorarioTipo, setNovoHorarioTipo] = useState<'aula' | 'intervalo'>('aula');
  const [salvandoHorarios, setSalvandoHorarios] = useState(false);

  // IA Google Gemini
  const [chaveGeminiInput, setChaveGeminiInput] = useState(() => getStoredGeminiKey());
  const [mostrarChave, setMostrarChave] = useState(false);
  const [testandoGemini, setTestandoGemini] = useState(false);
  const [resultadoTesteGemini, setResultadoTesteGemini] = useState<{ success: boolean; message: string; formattedSample?: string } | null>(null);

  // ==========================================
  // ESTADOS: SUB-ABA 3 - TABLETS
  // ==========================================
  const [tabletsDb, setTabletsDb] = useState<{
    agendamentos: any[];
    horarios: string[];
    feriados: Array<{ data: string; motivo: string }>;
    maxTablets?: number;
  }>(() => {
    try {
      const cached = localStorage.getItem('CACHE_TABLET_APP');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.horarios) return parsed;
      }
    } catch {}
    return (tabletsBaseline as any) || {
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
      feriados: [],
      maxTablets: 23,
    };
  });

  const [novoHorarioTablet, setNovoHorarioTablet] = useState('');
  const [novoFeriadoData, setNovoFeriadoData] = useState('');
  const [novoFeriadoMotivo, setNovoFeriadoMotivo] = useState('');
  const [salvandoTablets, setSalvandoTablets] = useState(false);

  // ==========================================
  // ESTADOS: SUB-ABA 4 - USUÁRIOS & PERFIS
  // ==========================================
  const [usuarios, setUsuarios] = useState<UserAccount[]>(() => {
    try {
      return storageService.getUsers();
    } catch {
      return [];
    }
  });
  const [buscaUsuarios, setBuscaUsuarios] = useState('');
  const [filtroRoleUsuario, setFiltroRoleUsuario] = useState('todos');
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // Modais de Usuário
  const [isNovoUsuarioModalOpen, setIsNovoUsuarioModalOpen] = useState(false);
  const [novoNomeUsuario, setNovoNomeUsuario] = useState('');
  const [novoCargoUsuario, setNovoCargoUsuario] = useState<UserRole>('professor');
  const [novoPinUsuario, setNovoPinUsuario] = useState('1234');
  const [novoNotasUsuario, setNovoNotasUsuario] = useState('');

  const [selectedUserForPin, setSelectedUserForPin] = useState<UserAccount | null>(null);
  const [novoPinEdit, setNovoPinEdit] = useState('');

  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserAccount | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Carrega dados compartilhados do Firestore
  useEffect(() => {
    // 1. Ocorrências
    carregarOcorrenciasSeguro().then(res => {
      if (res && res.data) {
        setOcorrenciasDb(prev => ({
          ...prev,
          ...res.data,
        }));
        if (res.data.gradeHorarios && res.data.gradeHorarios.length > 0) {
          setGradeHorarios(res.data.gradeHorarios);
        }
      }
    }).catch(() => {});

    // 2. Tablets
    carregarTabletsSeguro().then(res => {
      if (res && res.data) {
        setTabletsDb(prev => ({
          ...prev,
          ...res.data,
        }));
      }
    }).catch(() => {});

    // 3. Usuários
    firestoreService.getUsers().then(users => {
      if (users && users.length > 0) {
        setUsuarios(users);
        storageService.setUsers(users);
      }
    }).catch(() => {});
  }, []);

  // ==========================================
  // HANDLERS: BUSCA ATIVA (TURMAS E ALUNOS)
  // ==========================================
  const handleOpenNewClassModal = () => {
    setClassFormId('');
    setClassFormName('');
    setClassFormGrade('9º Ano');
    setClassFormShift('integral');
    setClassFormRoom('Sala ' + (classes.length + 1));
    setEditingClass(null);
    setIsNewClassModalOpen(true);
  };

  const handleEditClass = (c: SchoolClass) => {
    setEditingClass(c);
    setClassFormId(c.id);
    setClassFormName(c.name);
    setClassFormGrade(c.grade || '9º Ano');
    setClassFormShift(c.shift || 'integral');
    setClassFormRoom(c.room || '');
    setIsNewClassModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classFormName.trim()) {
      showToast('⚠️ Informe o nome da turma.', 'erro');
      return;
    }

    const id = editingClass ? editingClass.id : (classFormId.trim() || `T-${Date.now()}`);
    const updatedClass: SchoolClass = {
      id,
      name: classFormName.trim(),
      grade: classFormGrade,
      shift: classFormShift,
      room: classFormRoom.trim(),
      totalStudents: editingClass ? editingClass.totalStudents : 0,
      attendanceRate: editingClass ? editingClass.attendanceRate : 100,
    };

    let updatedList: SchoolClass[] = [];
    if (editingClass) {
      updatedList = classes.map(c => (c.id === editingClass.id ? updatedClass : c));
    } else {
      updatedList = [...classes, updatedClass];
    }

    storageService.setClasses(updatedList);
    try {
      await firestoreService.saveClass(updatedClass);
    } catch (err) {
      console.warn('Erro ao salvar turma no Firestore:', err);
    }

    setIsNewClassModalOpen(false);
    showToast(editingClass ? '✅ Turma atualizada com sucesso!' : '✅ Nova turma cadastrada com sucesso!');
    onRefresh();
  };

  const handleConfirmDeleteClass = async () => {
    if (!classToDelete) return;
    setIsDeletingClass(true);
    try {
      const updatedList = classes.filter(c => c.id !== classToDelete.id);
      storageService.setClasses(updatedList);
      await firestoreService.deleteClass(classToDelete.id);
      showToast(`Turma ${classToDelete.name} excluída com sucesso!`);
      setClassToDelete(null);
      onRefresh();
    } catch (err: any) {
      showToast('Erro ao excluir turma: ' + err.message, 'erro');
    } finally {
      setIsDeletingClass(false);
    }
  };

  const estudantesFiltrados = useMemo(() => {
    return students.filter(st => {
      const matchTexto =
        !buscaEstudanteTexto.trim() ||
        st.name.toLowerCase().includes(buscaEstudanteTexto.toLowerCase()) ||
        st.ra.toLowerCase().includes(buscaEstudanteTexto.toLowerCase()) ||
        (st.tutor && st.tutor.toLowerCase().includes(buscaEstudanteTexto.toLowerCase()));
      const matchTurma = filtroTurmaEstudante === 'todas' || st.classId === filtroTurmaEstudante;
      return matchTexto && matchTurma;
    });
  }, [students, buscaEstudanteTexto, filtroTurmaEstudante]);

  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      storageService.updateStudent(editingStudent.id, editingStudent);
      await firestoreService.saveStudent(editingStudent);
      showToast('✅ Dados do estudante salvos com sucesso!');
      setEditingStudent(null);
      onRefresh();
    } catch (err: any) {
      showToast('Erro ao salvar estudante: ' + err.message, 'erro');
    }
  };

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    try {
      storageService.deleteStudent(studentToDelete.id);
      await firestoreService.deleteStudent(studentToDelete.id);
      showToast(`Estudante ${studentToDelete.name} excluído com sucesso!`);
      setStudentToDelete(null);
      onRefresh();
    } catch (err: any) {
      showToast('Erro ao excluir estudante: ' + err.message, 'erro');
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // ==========================================
  // HANDLERS: OCORRÊNCIAS (MOTIVOS, MEDIDAS, GRADE)
  // ==========================================
  const handleAdicionarItemOcorrencia = async (tipo: 'ocorrencia' | 'medida') => {
    const valor = tipo === 'ocorrencia' ? novoMotivoOcorrencia.trim() : novaMedidaPedagogica.trim();
    if (!valor) {
      showToast(`⚠️ Digite o texto para cadastrar.`, 'erro');
      return;
    }

    setSalvandoConfigOcorrencias(true);
    try {
      const novasOcorrencias = tipo === 'ocorrencia' ? [...ocorrenciasDb.ocorrencias, valor] : ocorrenciasDb.ocorrencias;
      const novasMedidas = tipo === 'medida' ? [...ocorrenciasDb.medidas, valor] : ocorrenciasDb.medidas;

      const novoDb: OcorrenciasDatabase = {
        ...ocorrenciasDb,
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      };

      setOcorrenciasDb(novoDb);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      }, novoDb);

      if (tipo === 'ocorrencia') setNovoMotivoOcorrencia('');
      else setNovaMedidaPedagogica('');

      showToast(`✅ ${tipo === 'ocorrencia' ? 'Motivo de ocorrência' : 'Medida pedagógica'} cadastrado com sucesso!`);
    } catch (err: any) {
      showToast('Erro ao cadastrar: ' + err.message, 'erro');
    } finally {
      setSalvandoConfigOcorrencias(false);
    }
  };

  const handleSalvarEdicaoItemOcorrencia = async () => {
    if (!itemEditando || !itemEditando.valorNovo.trim()) return;
    setSalvandoConfigOcorrencias(true);
    try {
      let novasOcorrencias = [...ocorrenciasDb.ocorrencias];
      let novasMedidas = [...ocorrenciasDb.medidas];

      if (itemEditando.tipo === 'ocorrencia') {
        novasOcorrencias[itemEditando.index] = itemEditando.valorNovo.trim();
      } else {
        novasMedidas[itemEditando.index] = itemEditando.valorNovo.trim();
      }

      const novoDb: OcorrenciasDatabase = {
        ...ocorrenciasDb,
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      };

      setOcorrenciasDb(novoDb);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      }, novoDb);

      setItemEditando(null);
      showToast('✅ Item atualizado com sucesso!');
    } catch (err: any) {
      showToast('Erro ao atualizar: ' + err.message, 'erro');
    } finally {
      setSalvandoConfigOcorrencias(false);
    }
  };

  const handleExcluirItemOcorrencia = async () => {
    if (!itemParaExcluir) return;
    setSalvandoConfigOcorrencias(true);
    try {
      let novasOcorrencias = [...ocorrenciasDb.ocorrencias];
      let novasMedidas = [...ocorrenciasDb.medidas];

      if (itemParaExcluir.tipo === 'ocorrencia') {
        novasOcorrencias = novasOcorrencias.filter((_, idx) => idx !== itemParaExcluir.index);
      } else {
        novasMedidas = novasMedidas.filter((_, idx) => idx !== itemParaExcluir.index);
      }

      const novoDb: OcorrenciasDatabase = {
        ...ocorrenciasDb,
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      };

      setOcorrenciasDb(novoDb);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        ocorrencias: novasOcorrencias,
        medidas: novasMedidas,
      }, novoDb);

      setItemParaExcluir(null);
      showToast('✅ Item excluído com sucesso!');
    } catch (err: any) {
      showToast('Erro ao excluir: ' + err.message, 'erro');
    } finally {
      setSalvandoConfigOcorrencias(false);
    }
  };

  // Grade de Horários
  const handleSalvarGradeHorarios = async (novaGrade: HorarioAula[]) => {
    setSalvandoHorarios(true);
    try {
      const aulasNomes = novaGrade.filter(g => g.tipo === 'aula').map(g => g.nome);
      const novoDb: OcorrenciasDatabase = {
        ...ocorrenciasDb,
        gradeHorarios: novaGrade,
        aulas: aulasNomes.length > 0 ? aulasNomes : ocorrenciasDb.aulas,
      };

      setOcorrenciasDb(novoDb);
      setGradeHorarios(novaGrade);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));

      await salvarConfigOcorrenciasSeguro({
        gradeHorarios: novaGrade,
        aulas: aulasNomes.length > 0 ? aulasNomes : ocorrenciasDb.aulas,
        ocorrencias: ocorrenciasDb.ocorrencias,
        medidas: ocorrenciasDb.medidas,
      }, novoDb);

      showToast('⏰ Grade de horários salva com sucesso! A auditoria de pontualidade foi sincronizada na nuvem.');
    } catch (err: any) {
      showToast('Erro ao salvar grade de horários: ' + err.message, 'erro');
    } finally {
      setSalvandoHorarios(false);
    }
  };

  const handleAdicionarHorario = () => {
    const nome = novoHorarioNome.trim();
    if (!nome) {
      showToast('⚠️ Digite o nome da aula ou intervalo para cadastrar.', 'erro');
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

  // Google Gemini Key
  const handleTestarChaveGemini = async () => {
    if (!chaveGeminiInput.trim()) {
      showToast('⚠️ Digite uma chave para testar.', 'erro');
      return;
    }
    setTestandoGemini(true);
    setResultadoTesteGemini(null);
    try {
      const res = await testarChaveGemini(chaveGeminiInput.trim());
      setResultadoTesteGemini(res);
      if (res.success) {
        showToast('✨ Chave do Google Gemini validada com sucesso!');
      } else {
        showToast('Falha na validação da chave: ' + res.message, 'erro');
      }
    } catch (err: any) {
      setResultadoTesteGemini({ success: false, message: err.message || 'Erro inesperado ao testar chave' });
      showToast('Erro ao testar chave: ' + err.message, 'erro');
    } finally {
      setTestandoGemini(false);
    }
  };

  const handleSalvarChaveGemini = async (chave: string) => {
    try {
      saveStoredGeminiKey(chave);
      const novoDb = { ...ocorrenciasDb, geminiApiKey: chave.trim() };
      setOcorrenciasDb(novoDb);
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));
      await salvarConfigOcorrenciasSeguro({ geminiApiKey: chave.trim() }, novoDb);
      showToast(chave.trim() ? '✨ Chave de API do Gemini salva com sucesso!' : 'Chave de API do Gemini removida.');
    } catch (err: any) {
      showToast('Erro ao salvar chave: ' + err.message, 'erro');
    }
  };

  // ==========================================
  // HANDLERS: TABLETS
  // ==========================================
  const handleAdicionarHorarioTablet = async () => {
    if (!novoHorarioTablet.trim()) return;
    setSalvandoTablets(true);
    try {
      const novosHorarios = [...(tabletsDb.horarios || []), novoHorarioTablet.trim()];
      const novoDb = { ...tabletsDb, horarios: novosHorarios };
      setTabletsDb(novoDb);
      localStorage.setItem('CACHE_TABLET_APP', JSON.stringify(novoDb));
      await salvarReservaTabletsSeguro({ action: 'salvar_config_tablets', horarios: novosHorarios }, novoDb);
      setNovoHorarioTablet('');
      showToast('✅ Horário de tablet adicionado com sucesso!');
    } catch (err: any) {
      showToast('Erro ao adicionar horário: ' + err.message, 'erro');
    } finally {
      setSalvandoTablets(false);
    }
  };

  const handleRemoverHorarioTablet = async (horario: string) => {
    setSalvandoTablets(true);
    try {
      const novosHorarios = (tabletsDb.horarios || []).filter(h => h !== horario);
      const novoDb = { ...tabletsDb, horarios: novosHorarios };
      setTabletsDb(novoDb);
      localStorage.setItem('CACHE_TABLET_APP', JSON.stringify(novoDb));
      await salvarReservaTabletsSeguro({ action: 'salvar_config_tablets', horarios: novosHorarios }, novoDb);
      showToast('✅ Horário de tablet removido com sucesso!');
    } catch (err: any) {
      showToast('Erro ao remover horário: ' + err.message, 'erro');
    } finally {
      setSalvandoTablets(false);
    }
  };

  const handleAdicionarFeriadoTablet = async () => {
    if (!novoFeriadoData || !novoFeriadoMotivo.trim()) {
      showToast('⚠️ Preencha a data e o motivo do feriado/bloqueio.', 'erro');
      return;
    }
    setSalvandoTablets(true);
    try {
      const novosFeriados = [...(tabletsDb.feriados || []), { data: novoFeriadoData, motivo: novoFeriadoMotivo.trim() }];
      const novoDb = { ...tabletsDb, feriados: novosFeriados };
      setTabletsDb(novoDb);
      localStorage.setItem('CACHE_TABLET_APP', JSON.stringify(novoDb));
      await salvarReservaTabletsSeguro({ action: 'salvar_config_tablets', feriados: novosFeriados }, novoDb);
      setNovoFeriadoData('');
      setNovoFeriadoMotivo('');
      showToast('✅ Feriado/Bloqueio adicionado com sucesso!');
    } catch (err: any) {
      showToast('Erro ao adicionar bloqueio: ' + err.message, 'erro');
    } finally {
      setSalvandoTablets(false);
    }
  };

  const handleRemoverFeriadoTablet = async (dataStr: string) => {
    setSalvandoTablets(true);
    try {
      const novosFeriados = (tabletsDb.feriados || []).filter(f => f.data !== dataStr);
      const novoDb = { ...tabletsDb, feriados: novosFeriados };
      setTabletsDb(novoDb);
      localStorage.setItem('CACHE_TABLET_APP', JSON.stringify(novoDb));
      await salvarReservaTabletsSeguro({ action: 'salvar_config_tablets', feriados: novosFeriados }, novoDb);
      showToast('✅ Bloqueio de data removido com sucesso!');
    } catch (err: any) {
      showToast('Erro ao remover bloqueio: ' + err.message, 'erro');
    } finally {
      setSalvandoTablets(false);
    }
  };

  // ==========================================
  // HANDLERS: USUÁRIOS & PERFIS
  // ==========================================
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter(u => {
      const matchQuery =
        !buscaUsuarios.trim() ||
        u.name.toLowerCase().includes(buscaUsuarios.toLowerCase()) ||
        (u.username && u.username.toLowerCase().includes(buscaUsuarios.toLowerCase())) ||
        (u.roleLabel && u.roleLabel.toLowerCase().includes(buscaUsuarios.toLowerCase()));
      const matchRole = filtroRoleUsuario === 'todos' || u.role === filtroRoleUsuario;
      return matchQuery && matchRole;
    });
  }, [usuarios, buscaUsuarios, filtroRoleUsuario]);

  const handleCriarNovoUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNomeUsuario.trim()) {
      showToast('⚠️ Digite o nome do usuário.', 'erro');
      return;
    }
    if (!novoPinUsuario || novoPinUsuario.length !== 4 || !/^\d{4}$/.test(novoPinUsuario)) {
      showToast('⚠️ A senha PIN deve ter exatamente 4 dígitos numéricos.', 'erro');
      return;
    }

    try {
      const username = novoNomeUsuario
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '.')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '');

      const novoUsuario: UserAccount = {
        id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: novoNomeUsuario.trim(),
        username: username || `user.${Date.now()}`,
        role: novoCargoUsuario,
        roleLabel: getRoleLabel(novoCargoUsuario),
        pin: novoPinUsuario,
        active: true,
        createdAt: new Date().toISOString(),
        notes: novoNotasUsuario.trim(),
      };

      const updated = [...usuarios, novoUsuario];
      setUsuarios(updated);
      storageService.setUsers(updated);
      await firestoreService.saveUser(novoUsuario);

      setIsNovoUsuarioModalOpen(false);
      setNovoNomeUsuario('');
      setNovoPinUsuario('1234');
      setNovoNotasUsuario('');
      showToast(`✅ Usuário ${novoUsuario.name} cadastrado com sucesso!`);
    } catch (err: any) {
      showToast('Erro ao criar usuário: ' + err.message, 'erro');
    }
  };

  const handleSalvarPinUsuario = async () => {
    if (!selectedUserForPin || !novoPinEdit || !/^\d{4}$/.test(novoPinEdit)) {
      showToast('⚠️ O PIN deve conter exatamente 4 dígitos numéricos.', 'erro');
      return;
    }

    try {
      const updatedUser = { ...selectedUserForPin, pin: novoPinEdit };
      const updatedList = usuarios.map(u => (u.id === selectedUserForPin.id ? updatedUser : u));
      setUsuarios(updatedList);
      storageService.setUsers(updatedList);
      await firestoreService.saveUser(updatedUser);

      setSelectedUserForPin(null);
      setNovoPinEdit('');
      showToast(`✅ Senha PIN de ${updatedUser.name} alterada para ${novoPinEdit}!`);
    } catch (err: any) {
      showToast('Erro ao atualizar PIN: ' + err.message, 'erro');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      const updatedList = usuarios.filter(u => u.id !== userToDelete.id);
      setUsuarios(updatedList);
      storageService.setUsers(updatedList);
      await firestoreService.deleteUser(userToDelete.id);

      setUserToDelete(null);
      showToast(`Usuário ${userToDelete.name} excluído com sucesso!`);
    } catch (err: any) {
      showToast('Erro ao excluir usuário: ' + err.message, 'erro');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const toggleRevealPin = (userId: string) => {
    setRevealedPins(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner do Gerenciador Master */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-purple-700 text-white flex items-center justify-center shadow-md shrink-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Gerenciador Central & Cadastros do Sistema
              </h1>
              <span className="bg-purple-100 text-purple-900 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-purple-200">
                🛡️ Exclusivo Administrador Master
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Configure turmas, estudantes, motivos de ocorrência, grade de horários, tablets, usuários e integrações em nuvem.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Recarregar todos os cadastros"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
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

      {/* Menu Superior de Sub-Abas do Gerenciador */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-2xs flex overflow-x-auto no-scrollbar gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('busca_ativa')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSubTab === 'busca_ativa'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <School className="w-4 h-4" />
          <span>📋 Busca Ativa & Alunos</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
            activeSubTab === 'busca_ativa' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {classes.length}T / {students.length}A
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('ocorrencias')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSubTab === 'ocorrencias'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>🚨 Ocorrências & Grade</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
            activeSubTab === 'ocorrencias' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {ocorrenciasDb.ocorrencias.length} Motivos
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('tablets')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSubTab === 'tablets'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Tablet className="w-4 h-4" />
          <span>📱 Agendamento de Tablets</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
            activeSubTab === 'tablets' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {tabletsDb.horarios.length} Aulas
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('usuarios')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSubTab === 'usuarios'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>👥 Usuários & Senhas PIN</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
            activeSubTab === 'usuarios' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {usuarios.length} Contas
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('integracoes')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSubTab === 'integracoes'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>☁️ Nuvem & Integrações</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* CONTEÚDO DA SUB-ABA 1: BUSCA ATIVA & TURMAS/ESTUDANTES                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'busca_ativa' && (
        <div className="space-y-6">
          {/* Sub-navegação interna */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAbaBuscaAtivaSub('turmas')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  abaBuscaAtivaSub === 'turmas'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                🏫 Cadastro de Turmas ({classes.length})
              </button>
              <button
                type="button"
                onClick={() => setAbaBuscaAtivaSub('estudantes')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  abaBuscaAtivaSub === 'estudantes'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                👨‍🎓 Cadastro de Estudantes ({students.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenStudentRegistration}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title="Abrir importador inteligente de planilhas SEDUC / CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                <span>Importar Planilha SEDUC / CSV</span>
              </button>
            </div>
          </div>

          {/* Sub-aba 1.1: TURMAS */}
          {abaBuscaAtivaSub === 'turmas' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    Turmas Ativas no Sistema ({classes.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Turmas sincronizadas universalmente com Busca Ativa, Ocorrências e Tablets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenNewClassModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova Turma</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {classes.map(c => {
                  const qtdAlunos = students.filter(s => s.classId === c.id).length;
                  return (
                    <div
                      key={c.id}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-indigo-500" />
                            <h4 className="text-base font-black text-slate-900">{c.name}</h4>
                          </div>
                          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md mt-1 inline-block">
                            {c.grade || 'Ensino Regular'} • {c.shift === 'integral' ? 'PEI Integral' : c.shift === 'manha' ? 'Manhã' : 'Tarde'}
                          </span>
                        </div>
                        <span className="bg-indigo-50 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-lg border border-indigo-100">
                          {c.room || 'Sala'}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                        <span>👥 <strong>{qtdAlunos}</strong> estudantes vinculados</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditClass(c)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Editar Turma"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setClassToDelete(c)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Excluir Turma"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-aba 1.2: ESTUDANTES */}
          {abaBuscaAtivaSub === 'estudantes' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="flex-1 w-full relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={buscaEstudanteTexto}
                    onChange={e => setBuscaEstudanteTexto(e.target.value)}
                    placeholder="Buscar estudante por nome, RA ou tutor..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-slate-50"
                  />
                </div>

                <div className="w-full sm:w-64">
                  <select
                    value={filtroTurmaEstudante}
                    onChange={e => setFiltroTurmaEstudante(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-300 rounded-xl font-bold bg-white text-slate-800"
                  >
                    <option value="todas">Todas as Turmas ({students.length})</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        Turma {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                    <tr>
                      <th className="p-3">Estudante / Nome Completo</th>
                      <th className="p-3">RA</th>
                      <th className="p-3">Turma</th>
                      <th className="p-3">Tutor(a)</th>
                      <th className="p-3">Responsável & Telefones</th>
                      <th className="p-3 text-center w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {estudantesFiltrados.slice(0, 50).map(st => (
                      <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-bold text-slate-900">
                          {st.name}
                        </td>
                        <td className="p-3 font-mono text-slate-600">
                          {st.ra || '—'}
                        </td>
                        <td className="p-3">
                          <span className="bg-indigo-50 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-100">
                            {st.className}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">
                          {st.tutor || 'Não atribuído'}
                        </td>
                        <td className="p-3 text-slate-600 text-[11px]">
                          <div><strong>{st.guardianName || 'Responsável'}</strong> ({st.guardianRelationship || 'Família'})</div>
                          <div className="text-slate-500 font-mono text-[10px]">{st.guardianPhone || 'Sem telefone'}</div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingStudent(st)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              title="Editar Estudante"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudentToDelete(st)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Excluir Estudante"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {estudantesFiltrados.length > 50 && (
                <p className="text-xs text-slate-500 text-center italic">
                  Exibindo os primeiros 50 estudantes de {estudantesFiltrados.length}. Use o campo de busca acima para localizar rapidamente.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DA SUB-ABA 2: OCORRÊNCIAS, MEDIDAS & GRADE DE HORÁRIOS           */}
      {/* ========================================================================= */}
      {activeSubTab === 'ocorrencias' && (
        <div className="space-y-6">
          {/* Sub-navegação interna */}
          <div className="flex flex-wrap gap-2 bg-white p-3.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setAbaOcorrenciasSub('motivos')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaOcorrenciasSub === 'motivos'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>⚠️ Motivos de Ocorrência ({ocorrenciasDb.ocorrencias.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaOcorrenciasSub('medidas')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaOcorrenciasSub === 'medidas'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>⚖️ Medidas Pedagógicas ({ocorrenciasDb.medidas.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaOcorrenciasSub('horarios')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaOcorrenciasSub === 'horarios'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>⏰ Grade de Horários (Aulas & Intervalos) ({gradeHorarios.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaOcorrenciasSub('ia_gemini')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                abaOcorrenciasSub === 'ia_gemini'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🤖 Inteligência Artificial (Google Gemini)</span>
            </button>
          </div>

          {/* MOTIVOS DE OCORRÊNCIA */}
          {abaOcorrenciasSub === 'motivos' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  Motivos de Ocorrência Principal Cadastrados
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Itens disponíveis no formulário de registro de ocorrência para seleção dos professores.
                </p>
              </div>

              {/* Form de Cadastro */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={novoMotivoOcorrencia}
                  onChange={e => setNovoMotivoOcorrencia(e.target.value)}
                  placeholder="Ex: Agressão verbal, Saída indevida da sala de aula..."
                  className="flex-1 p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-medium"
                />
                <button
                  type="button"
                  disabled={salvandoConfigOcorrencias || !novoMotivoOcorrencia.trim()}
                  onClick={() => handleAdicionarItemOcorrencia('ocorrencia')}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Motivo</span>
                </button>
              </div>

              {/* Lista */}
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {ocorrenciasDb.ocorrencias.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-semibold text-slate-800">{item}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setItemEditando({ tipo: 'ocorrencia', index: idx, valorAntigo: item, valorNovo: item })}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemParaExcluir({ tipo: 'ocorrencia', index: idx, valor: item })}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MEDIDAS PEDAGÓGICAS */}
          {abaOcorrenciasSub === 'medidas' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  Medidas Pedagógicas Tomadas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ações e medidas educativas disponíveis para seleção no ato do registro.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={novaMedidaPedagogica}
                  onChange={e => setNovaMedidaPedagogica(e.target.value)}
                  placeholder="Ex: Advertência verbal e diálogo pedagógico..."
                  className="flex-1 p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-medium"
                />
                <button
                  type="button"
                  disabled={salvandoConfigOcorrencias || !novaMedidaPedagogica.trim()}
                  onClick={() => handleAdicionarItemOcorrencia('medida')}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Medida</span>
                </button>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {ocorrenciasDb.medidas.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-semibold text-slate-800">{item}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setItemEditando({ tipo: 'medida', index: idx, valorAntigo: item, valorNovo: item })}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemParaExcluir({ tipo: 'medida', index: idx, valor: item })}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GRADE DE HORÁRIOS (AULAS & INTERVALOS) */}
          {abaOcorrenciasSub === 'horarios' && (
            <div className="space-y-6">
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Clock className="w-5 h-5 text-indigo-100" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                    <span>Grade de Horários das Aulas & Intervalos Escolares</span>
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      Auditoria de Pontualidade Ativa
                    </span>
                  </h3>
                  <p className="text-xs text-indigo-900/80 leading-relaxed">
                    Cadastre o horário exato de início e término de cada aula ou intervalo. O sistema cruza esses horários com o timestamp de envio do professor para indicar à gestão se o registro foi feito <strong>no ato da aula</strong>, <strong>minutos/horas após no mesmo dia</strong> ou <strong>dias depois</strong>.
                  </p>
                </div>
              </div>

              {/* Form para Adicionar Horário */}
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
                      className="w-full p-2 text-xs border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-800"
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
                      className="w-full p-2 text-xs border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-800"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="novoHorarioTipoMaster"
                        checked={novoHorarioTipo === 'aula'}
                        onChange={() => setNovoHorarioTipo('aula')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Aula Regular</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="novoHorarioTipoMaster"
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

              {/* Tabela de Horários */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Grade Atual ({gradeHorarios.length} períodos)
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
              </div>
            </div>
          )}

          {/* IA GOOGLE GEMINI */}
          {abaOcorrenciasSub === 'ia_gemini' && (
            <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-purple-950 flex items-center gap-2">
                    <span>Configuração da Chave do Google Gemini (IA)</span>
                    {ocorrenciasDb.geminiApiKey || getStoredGeminiKey() ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Conectada & Ativa
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Pendente
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-purple-900/80 leading-relaxed">
                    Habilita o recurso de <strong>"Formatar com IA"</strong> no registro de ocorrências para todos os professores, revisando a norma culta e garantindo tom acolhedor e pedagógico aos pais.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
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
                    <span>Salvar para a Escola</span>
                  </button>
                </div>

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
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>{resultadoTesteGemini.message}</span>
                    </div>
                    {resultadoTesteGemini.formattedSample && (
                      <div className="mt-2 p-2.5 bg-white rounded-lg border border-emerald-200 text-[11px] text-slate-800 font-medium">
                        <strong>Exemplo pedagógico formatado:</strong> "{resultadoTesteGemini.formattedSample}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DA SUB-ABA 3: AGENDAMENTO DE TABLETS                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'tablets' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Tablet className="w-5 h-5 text-sky-600" />
                <h2 className="text-base font-black text-slate-900">
                  Parâmetros de Reserva & Controle de Tablets
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure os horários de aulas disponíveis na grade semanal e cadastre feriados/bloqueios.
              </p>
            </div>
            <span className="bg-sky-50 text-sky-800 text-xs font-bold px-3 py-1 rounded-lg border border-sky-200">
              Estoque Total: 23 Tablets / Carrinho
            </span>
          </div>

          {/* Horários de Agendamento */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Horários / Aulas Disponíveis na Grade Semanal ({tabletsDb.horarios.length})
            </h3>

            <div className="flex gap-2">
              <input
                type="text"
                value={novoHorarioTablet}
                onChange={e => setNovoHorarioTablet(e.target.value)}
                placeholder="Ex: 10ª Aula - (16h às 16h50)..."
                className="flex-1 p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden font-medium"
              />
              <button
                type="button"
                disabled={salvandoTablets || !novoHorarioTablet.trim()}
                onClick={handleAdicionarHorarioTablet}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Horário</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tabletsDb.horarios.map((h, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between">
                  <span>{h}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoverHorarioTablet(h)}
                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                    title="Remover horário"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Feriados e Bloqueios */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Feriados, Recessos & Bloqueios de Calendário ({(tabletsDb.feriados || []).length})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <input
                  type="date"
                  value={novoFeriadoData}
                  onChange={e => setNovoFeriadoData(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-bold bg-white text-slate-800"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <input
                  type="text"
                  value={novoFeriadoMotivo}
                  onChange={e => setNovoFeriadoMotivo(e.target.value)}
                  placeholder="Motivo (ex: Recesso Escolar / Conselho de Classe)..."
                  className="flex-1 p-2.5 text-xs border border-slate-300 rounded-xl font-medium bg-white text-slate-800"
                />
                <button
                  type="button"
                  disabled={salvandoTablets || !novoFeriadoData || !novoFeriadoMotivo.trim()}
                  onClick={handleAdicionarFeriadoTablet}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Bloquear Data</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {(tabletsDb.feriados || []).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum feriado ou recesso bloqueado no momento.</p>
              ) : (
                (tabletsDb.feriados || []).map((f, idx) => (
                  <div key={idx} className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-xs flex items-center justify-between">
                    <div>
                      <strong className="text-rose-950">{f.data}</strong> — <span className="text-rose-900">{f.motivo}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoverFeriadoTablet(f.data)}
                      className="p-1 text-rose-700 hover:bg-rose-100 rounded-lg cursor-pointer"
                      title="Desbloquear data"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DA SUB-ABA 4: USUÁRIOS, PERFIS & SENHAS PIN                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'usuarios' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>Gestão de Contas, Perfis & Senhas PIN</span>
                <span className="bg-purple-100 text-purple-900 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                  {usuarios.length} cadastrados
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Altere senhas PIN numéricas (4 dígitos), cadastre novos professores e controle os níveis de acesso ao sistema.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsNovoUsuarioModalOpen(true)}
              className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </button>
          </div>

          {/* Filtros e Busca */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={buscaUsuarios}
                onChange={e => setBuscaUsuarios(e.target.value)}
                placeholder="Buscar usuário por nome, login ou cargo..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden bg-slate-50"
              />
            </div>

            <div className="w-full sm:w-60">
              <select
                value={filtroRoleUsuario}
                onChange={e => setFiltroRoleUsuario(e.target.value)}
                className="w-full p-2 text-xs border border-slate-300 rounded-xl font-bold bg-white text-slate-800"
              >
                <option value="todos">Todos os Perfis ({usuarios.length})</option>
                <option value="admin">Administrador (Master)</option>
                <option value="gestao_paac">Gestão / PAAC</option>
                <option value="aoe">AOE (Secretaria / Portaria)</option>
                <option value="professor">Professor(a)</option>
              </select>
            </div>
          </div>

          {/* Tabela de Usuários */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                <tr>
                  <th className="p-3">Nome do Usuário</th>
                  <th className="p-3">Perfil / Cargo</th>
                  <th className="p-3 text-center">Senha PIN (4 dígitos)</th>
                  <th className="p-3">Anotações / Cargo</th>
                  <th className="p-3 text-center w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuariosFiltrados.map(u => {
                  const isRevealed = !!revealedPins[u.id];
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">@{u.username}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-900 border-purple-300'
                              : u.role === 'gestao_paac'
                              ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                              : u.role === 'aoe'
                              ? 'bg-blue-100 text-blue-900 border-blue-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          {u.roleLabel}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                          <span className="font-mono font-bold text-slate-800 text-xs">
                            {isRevealed ? u.pin : '••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleRevealPin(u.id)}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            title={isRevealed ? 'Ocultar PIN' : 'Mostrar PIN'}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForPin(u);
                              setNovoPinEdit(u.pin || '1234');
                            }}
                            className="ml-1 text-[10px] text-purple-700 font-bold hover:underline cursor-pointer"
                            title="Alterar PIN"
                          >
                            Alterar
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 text-[11px]">
                        {u.notes || '—'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForPin(u);
                              setNovoPinEdit(u.pin || '1234');
                            }}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Redefinir PIN"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {u.role !== 'admin' && (
                            <button
                              type="button"
                              onClick={() => setUserToDelete(u)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Excluir Usuário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DA SUB-ABA 5: NUVEM, SINCRONIZAÇÃO & INTEGRAÇÕES                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'integracoes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Google Sheets */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Planilha Oficial do Google Drive</h3>
                <p className="text-xs text-slate-500">Conecte e sincronize turmas, ausências e ocorrências via Sheets.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenGoogleSheets}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Gerenciar Conexão com Google Sheets</span>
            </button>
          </div>

          {/* Card Firebase Firestore */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Banco de Dados Firebase Cloud</h3>
                <p className="text-xs text-slate-500">Acesso universal compartilhado em tempo real com alta disponibilidade.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenFirebaseStatus}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Database className="w-4 h-4" />
              <span>Ver Diagnóstico & Sincronização Firebase</span>
            </button>
          </div>

          {/* Card WhatsApp */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Modelos de Mensagens do WhatsApp</h3>
                <p className="text-xs text-slate-500">Configure avisos de faltas, convocações e alertas aos responsáveis.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenWhatsAppIntegration}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Configurar Mensagens WhatsApp</span>
            </button>
          </div>

          {/* Card Zona de Perigo / Reset */}
          <div className="bg-rose-50/60 p-6 rounded-2xl border border-rose-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950">Zona de Perigo & Reset Total</h3>
                <p className="text-xs text-rose-800/80">Limpeza completa para novos anos letivos ou dados de demonstração.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenResetAllModal}
              className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Reset Geral do Sistema</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAIS DO GERENCIADOR MASTER                                             */}
      {/* ========================================================================= */}

      {/* MODAL: CRIAR / EDITAR TURMA */}
      {isNewClassModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <School className="w-4 h-4 text-indigo-400" />
                <span>{editingClass ? 'Editar Turma' : 'Cadastrar Nova Turma'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNewClassModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveClass} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Nome da Turma</label>
                <input
                  type="text"
                  value={classFormName}
                  onChange={e => setClassFormName(e.target.value)}
                  placeholder="Ex: 9º Ano A, 1ª Série B..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Ano / Série</label>
                  <input
                    type="text"
                    value={classFormGrade}
                    onChange={e => setClassFormGrade(e.target.value)}
                    placeholder="Ex: 9º Ano"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Turno</label>
                  <select
                    value={classFormShift}
                    onChange={e => setClassFormShift(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-800"
                  >
                    <option value="integral">Integral (PEI)</option>
                    <option value="manha">Manhã</option>
                    <option value="tarde">Tarde</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Sala de Aula</label>
                <input
                  type="text"
                  value={classFormRoom}
                  onChange={e => setClassFormRoom(e.target.value)}
                  placeholder="Ex: Sala 01, Bloco A"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewClassModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Salvar Turma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUSÃO DE TURMA */}
      {classToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 border border-rose-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Excluir Turma {classToDelete.name}?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tem certeza que deseja excluir esta turma? Os estudantes vinculados a ela permanecerão cadastrados.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClassToDelete(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingClass}
                onClick={handleConfirmDeleteClass}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeletingClass ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR ESTUDANTE */}
      {editingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                <span>Editar Dados do Estudante</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveStudentEdit} className="p-5 space-y-3.5 text-xs max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={e => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">RA do Estudante</label>
                  <input
                    type="text"
                    value={editingStudent.ra}
                    onChange={e => setEditingStudent({ ...editingStudent, ra: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Turma</label>
                  <select
                    value={editingStudent.classId}
                    onChange={e => {
                      const sel = classes.find(c => c.id === e.target.value);
                      setEditingStudent({
                        ...editingStudent,
                        classId: e.target.value,
                        className: sel ? sel.name : editingStudent.className,
                      });
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-800"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Professor(a) Tutor(a)</label>
                <input
                  type="text"
                  value={editingStudent.tutor || ''}
                  onChange={e => setEditingStudent({ ...editingStudent, tutor: e.target.value })}
                  placeholder="Nome do tutor..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Nome do Responsável</label>
                  <input
                    type="text"
                    value={editingStudent.guardianName}
                    onChange={e => setEditingStudent({ ...editingStudent, guardianName: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Telefone Principal (WhatsApp)</label>
                  <input
                    type="text"
                    value={editingStudent.guardianPhone}
                    onChange={e => setEditingStudent({ ...editingStudent, guardianPhone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUSÃO DE ESTUDANTE */}
      {studentToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 border border-rose-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Excluir {studentToDelete.name}?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja remover este estudante do sistema? Esta ação apagará seus dados de chamada da base ativa.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingStudent}
                onClick={handleConfirmDeleteStudent}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeletingStudent ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR MOTIVO / MEDIDA DE OCORRÊNCIA */}
      {itemEditando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 animate-in zoom-in-95">
            <h3 className="font-bold text-sm text-slate-900">
              Editar {itemEditando.tipo === 'ocorrencia' ? 'Motivo de Ocorrência' : 'Medida Pedagógica'}
            </h3>
            <textarea
              rows={3}
              value={itemEditando.valorNovo}
              onChange={e => setItemEditando({ ...itemEditando, valorNovo: e.target.value })}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setItemEditando(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvandoConfigOcorrencias || !itemEditando.valorNovo.trim()}
                onClick={handleSalvarEdicaoItemOcorrencia}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR MOTIVO / MEDIDA DE OCORRÊNCIA */}
      {itemParaExcluir && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 border border-rose-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Excluir este item?</h3>
            <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              "{itemParaExcluir.valor}"
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemParaExcluir(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvandoConfigOcorrencias}
                onClick={handleExcluirItemOcorrencia}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO USUÁRIO */}
      {isNovoUsuarioModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-purple-900 text-white px-5 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-purple-300" />
                <span>Cadastrar Novo Usuário</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNovoUsuarioModalOpen(false)}
                className="text-purple-300 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCriarNovoUsuario} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={novoNomeUsuario}
                  onChange={e => setNovoNomeUsuario(e.target.value)}
                  placeholder="Ex: Carlos Eduardo de Oliveira"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Perfil / Cargo</label>
                  <select
                    value={novoCargoUsuario}
                    onChange={e => setNovoCargoUsuario(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-800"
                  >
                    <option value="professor">Professor(a)</option>
                    <option value="gestao_paac">Gestão / PAAC</option>
                    <option value="aoe">AOE (Secretaria / Portaria)</option>
                    <option value="admin">Administrador (Master)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">PIN (4 dígitos)</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={novoPinUsuario}
                    onChange={e => setNovoPinUsuario(e.target.value.replace(/\D/g, ''))}
                    placeholder="1234"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-center text-slate-800 tracking-widest text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Anotações / Função</label>
                <input
                  type="text"
                  value={novoNotasUsuario}
                  onChange={e => setNovoNotasUsuario(e.target.value)}
                  placeholder="Ex: Professor de Matemática / Coordenador Pedagógico"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNovoUsuarioModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Criar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ALTERAR PIN DO USUÁRIO */}
      {selectedUserForPin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 border border-purple-200">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Alterar PIN de {selectedUserForPin.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Digite a nova senha de 4 dígitos numéricos:</p>
            </div>
            <div>
              <input
                type="password"
                maxLength={4}
                value={novoPinEdit}
                onChange={e => setNovoPinEdit(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="w-36 mx-auto p-2.5 border border-purple-300 rounded-xl font-mono font-bold text-center text-slate-900 tracking-widest text-lg bg-purple-50/50"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForPin(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={novoPinEdit.length !== 4}
                onClick={handleSalvarPinUsuario}
                className="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                Salvar PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR USUÁRIO */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 border border-rose-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Excluir {userToDelete.name}?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tem certeza que deseja remover esta conta de usuário do sistema?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={handleConfirmDeleteUser}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeletingUser ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
