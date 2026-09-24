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
  Trash2
} from 'lucide-react';
import { SchoolClass, Student, AttendanceRecord, UserAccount } from '../types';
import { getStudentPhones, cleanPhoneForWhatsApp } from '../utils/phoneUtils';
import { storageService } from '../data/storageService';
import { carregarOcorrenciasSeguro, salvarOcorrenciaSeguro, excluirOcorrenciaSeguro } from '../lib/sheetsSyncService';
import { firestoreService } from '../lib/firestoreService';
import ocorrenciasBaseline from '../data/ocorrenciasBaseline.json';

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
  ocorrencias: string[];
  medidas: string[];
  aulas: string[];
  auxilio: string[];
  registros: OcorrenciaRecord[];
  tratativasFamilia: TratativaFamilia[];
}

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

  // Base de Dados vinda do Firestore / Google Sheets + Fallback local e baseline oficial
  const [bancoDeDados, setBancoDeDados] = useState<OcorrenciasDatabase>(() => {
    try {
      const cached = localStorage.getItem('CACHE_OCORRENCIAS_APP');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.registros && parsed.registros.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return (ocorrenciasBaseline as unknown as OcorrenciasDatabase) || {
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
    'pendentes' | 'sala' | 'consulta' | 'estatisticas' | 'registrar' | 'devolutivas' | 'tutorados'
  >(isGestao ? 'pendentes' : 'registrar');

  const [abaProfessor, setAbaProfessor] = useState<'registrar' | 'devolutivas' | 'tutorados'>(
    'registrar'
  );

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
          ocorrencias:
            data.ocorrencias && data.ocorrencias.length > 0
              ? data.ocorrencias
              : bancoDeDados.ocorrencias,
          medidas:
            data.medidas && data.medidas.length > 0 ? data.medidas : bancoDeDados.medidas,
          aulas: data.aulas && data.aulas.length > 0 ? data.aulas : bancoDeDados.aulas,
          auxilio:
            data.auxilio && data.auxilio.length > 0 ? data.auxilio : bancoDeDados.auxilio,
          registros: registrosLimpos,
          tratativasFamilia: data.tratativasFamilia || [],
        };

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

  // Turmas e Estudantes disponíveis
  const turmasUnicas = useMemo(() => {
    const doSheets = bancoDeDados.estudantes.map(e => e.turma);
    const daPlataforma = classes.map(c => c.name);
    const combinadas = Array.from(new Set([...doSheets, ...daPlataforma])).filter(Boolean);
    return combinadas.sort();
  }, [bancoDeDados.estudantes, classes]);

  const alunosDaTurma = useMemo(() => {
    if (!form.turma) return [];
    const deSheets = bancoDeDados.estudantes.filter(e => e.turma === form.turma);
    if (deSheets.length > 0) {
      return [...deSheets].sort((a, b) => a.nome.localeCompare(b.nome));
    }
    // Fallback: alunos da plataforma nessa turma
    const turmaPlat = classes.find(c => c.name === form.turma);
    if (turmaPlat) {
      return students
        .filter(s => s.classId === turmaPlat.id)
        .map(s => ({ nome: s.name, turma: turmaPlat.name, tutor: 'Equipe Pedagógica' }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    }
    return [];
  }, [form.turma, bancoDeDados.estudantes, classes, students]);

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

    setEnviando(true);
    setMensagem({ texto: 'Salvando registros na planilha, aguarde...', tipo: 'sucesso' });

    let sucessoCount = 0;
    let erroCount = 0;

    const novosRegistrosParaCache: OcorrenciaRecord[] = [];

    for (const est of form.estudantes) {
      const payload = {
        ...form,
        estudante: est.nome,
        tutor: est.tutor,
      };

      const salvo = await salvarOcorrenciaSeguro(payload);
      if (salvo) {
        sucessoCount++;
      } else {
        erroCount++;
      }

      // Adiciona localmente para garantir persistência mesmo em offline
      novosRegistrosParaCache.push({
        id: `REG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
      });
    }

    // Atualiza base local imediatamente
    setBancoDeDados(prev => {
      const atualizados = [...novosRegistrosParaCache, ...prev.registros];
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
    setFormMediacao({
      status: r.status || 'Resolvido',
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
    const payload = {
      action: 'mediacao',
      acao: 'mediar',
      id: modalMediacao.id,
      status: formMediacao.status,
      mediacao: formMediacao.mediacao,
      mediador: mediadorFinal,
    };

    await salvarOcorrenciaSeguro(payload);

    // Atualiza base local
    setBancoDeDados(prev => {
      const registrosAtualizados = prev.registros.map(r =>
        r.id === modalMediacao.id
          ? {
              ...r,
              status: formMediacao.status,
              mediacao: formMediacao.mediacao,
              mediador: mediadorFinal,
            }
          : r
      );
      const novoDb = { ...prev, registros: registrosAtualizados };
      localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(novoDb));
      return novoDb;
    });

    setEnviando(false);
    setMensagem({ texto: '✅ Parecer de mediação registrado com sucesso!', tipo: 'sucesso' });
    setModalMediacao(null);
    setFormMediacao({ status: 'Resolvido', mediacao: '', mediador: userName });
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

  // Card de Ocorrência Reutilizável
  const OcorrenciaCard: React.FC<{
    reg: OcorrenciaRecord;
    resolvidoEmSala: boolean;
    onMediar?: (r: OcorrenciaRecord) => void;
  }> = ({
    reg,
    resolvidoEmSala,
    onMediar,
  }) => (
    <div
      className={`bg-white p-5 rounded-2xl shadow-xs border-l-4 transition-all duration-150 ${
        resolvidoEmSala ? 'border-emerald-500' : 'border-amber-500'
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
            className={`font-bold ${resolvidoEmSala ? 'text-emerald-700' : 'text-rose-600'}`}
          >
            🤝 {reg.auxilio}
          </span>
          {reg.status && (
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                reg.status === 'Resolvido'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {reg.status}
            </span>
          )}
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
          !resolvidoEmSala && (
            <div className="mt-2.5 text-xs text-amber-700 italic flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Aguardando apontamento da equipe gestora...</span>
            </div>
          )
        )}
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

        {onMediar && (
          <button
            type="button"
            onClick={() => onMediar(reg)}
            className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>{reg.mediacao ? 'Atualizar Mediação' : 'Mediar Ocorrência'}</span>
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-700 uppercase">
              Professor(a) Relator(a) da Ocorrência
            </label>
            <button
              type="button"
              onClick={() => setModoProfessorAvulso(!modoProfessorAvulso)}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 underline font-medium cursor-pointer"
            >
              {modoProfessorAvulso ? 'Selecionar da lista' : 'Ou digitar outro nome (sistema antigo)'}
            </button>
          </div>

          {modoProfessorAvulso ? (
            <div className="space-y-1">
              <input
                type="text"
                name="professor"
                value={form.professor}
                onChange={handleChange}
                required
                placeholder="Digite o nome do(a) professor(a)..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
              />
              <p className="text-[11px] text-slate-500">
                Permite registrar ocorrência no nome de qualquer professor ou importar do sistema antigo.
              </p>
            </div>
          ) : (
            <select
              name="professor"
              value={form.professor}
              onChange={e => {
                if (e.target.value === '__DIGITAR_NOVO__') {
                  setModoProfessorAvulso(true);
                } else {
                  handleChange(e);
                }
              }}
              required
              className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800 bg-white"
            >
              {form.professor && !listaProfessoresDisponiveis.includes(form.professor) && (
                <option value={form.professor}>{form.professor} (Atual)</option>
              )}
              {listaProfessoresDisponiveis.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="__DIGITAR_NOVO__">✍️ Digitar outro nome de professor (Sistema Antigo)...</option>
            </select>
          )}
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
        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
          Descrição / Relato Detalhado (Opcional)
        </label>
        <textarea
          name="descricao"
          value={form.descricao}
          onChange={handleChange}
          rows={3}
          placeholder="Descreva detalhes específicos da ocorrência para histórico..."
          className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden text-slate-800 font-medium"
        />
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
      alunoItem.tratativas = (bancoDeDados.tratativasFamilia || [])
        .filter(t => t.estudante === alunoItem.nome)
        .reverse();
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
                      Histórico de Infrações ({aluno.ocorrencias.length})
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

  // Minhas Devolutivas
  const renderMinhasDevolutivas = () => {
    const minhas = bancoDeDados.registros
      .filter(r => r.professor.toLowerCase() === userName.toLowerCase())
      .reverse();

    return (
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          Ocorrências Lançadas por Mim ({minhas.length})
        </h2>
        {minhas.length === 0 ? (
          <div className="bg-white p-8 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500 text-xs">
            Você ainda não registrou nenhuma ocorrência no seu nome.
          </div>
        ) : (
          <div className="grid gap-3">
            {minhas.map(reg => (
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
  };

  // Meus Tutorados
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
            const ocorrenciasDoAluno = bancoDeDados.registros
              .filter(r => r.estudante === aluno.nome)
              .reverse();
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

  const pendentes = bancoDeDados.registros.filter(r => r.status !== 'Resolvido').reverse();
  const resolvidosEmSala = bancoDeDados.registros
    .filter(r => r.status === 'Resolvido' && verificarResolvidoEmSala(r.auxilio))
    .reverse();

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
                {isGestao ? 'Painel de Gestão' : 'Portal do Professor'}
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
            <button
              type="button"
              onClick={() => setAbaGestao('pendentes')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'pendentes'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🚨 Pendentes ({pendentes.length})
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('sala')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'sala'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📂 Resolvidos em Sala
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('consulta')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'registrar'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📝 Novo Registro
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('devolutivas')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaGestao === 'devolutivas'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📬 Minhas Devolutivas
            </button>
            <button
              type="button"
              onClick={() => setAbaGestao('tutorados')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
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
              onClick={() => setAbaProfessor('devolutivas')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                abaProfessor === 'devolutivas'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📬 Minhas Devolutivas
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
            {abaGestao === 'pendentes' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-base font-bold text-slate-900">
                    Aguardando Mediação da Gestão ({pendentes.length})
                  </h2>
                </div>
                {pendentes.length === 0 ? (
                  <div className="bg-white p-12 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                    <p className="font-bold text-sm text-slate-800">
                      Nenhuma ocorrência pendente no momento!
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Todos os casos foram mediados.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {pendentes.map(reg => (
                      <OcorrenciaCard
                        key={reg.id}
                        reg={reg}
                        resolvidoEmSala={false}
                        onMediar={abrirMediacao}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {abaGestao === 'sala' && (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Resolvidos em Sala de Aula ({resolvidosEmSala.length})
                </h2>
                {resolvidosEmSala.length === 0 ? (
                  <div className="bg-white p-8 text-center rounded-2xl shadow-xs border border-slate-200 text-slate-500 text-xs">
                    Nenhum registro resolvido em sala localizado.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {resolvidosEmSala.map(reg => (
                      <OcorrenciaCard
                        key={reg.id}
                        reg={reg}
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
            {abaGestao === 'devolutivas' && renderMinhasDevolutivas()}
            {abaGestao === 'tutorados' && renderMeusTutorados()}
          </>
        ) : (
          <>
            {abaProfessor === 'registrar' && renderFormularioRegistro()}
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
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-semibold text-slate-800"
                  >
                    <option value="Resolvido">Resolvido (Encerrar Caso)</option>
                    <option value="Pendente">Em acompanhamento (Manter Pendente)</option>
                  </select>
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
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
                  <span>Mensagem Pronta para Envio</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(modalWhatsApp.mensagemPadrao);
                      setMensagem({ texto: '📋 Mensagem copiada com sucesso!', tipo: 'sucesso' });
                      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 3000);
                    }}
                    className="text-emerald-700 hover:text-emerald-800 text-[11px] font-bold cursor-pointer"
                  >
                    Copiar Texto
                  </button>
                </label>
                <textarea
                  readOnly
                  rows={6}
                  value={modalWhatsApp.mensagemPadrao}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 leading-relaxed resize-none"
                />
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

      {/* MODAL 5: CONFIRMAÇÃO DE EXCLUSÃO DE OCORRÊNCIA (EXCLUSIVO ADMINISTRADOR) */}
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
    </div>
  );
};
