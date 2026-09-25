import React, { useState, useEffect, useMemo } from 'react';
import {
  Tablet,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Lock,
  Ban,
  Coffee,
  Utensils,
  Clock,
  User,
  Users,
  KeyRound,
  ShieldCheck,
  Shield,
  Calendar,
  UserPlus
} from 'lucide-react';
import { SchoolClass } from '../types';
import { storageService } from '../data/storageService';
import { carregarTabletsSeguro, salvarReservaTabletsSeguro } from '../lib/sheetsSyncService';
import tabletsBaseline from '../data/tabletsBaseline.json';

export interface AgendamentoTablet {
  data: string;
  aula: string;
  professor: string;
  turma: string;
  tablets: number;
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
}

interface TabletsManagerProps {
  currentUser?: { id: string; name: string; role: string; pin?: string } | null;
  classes: SchoolClass[];
}

const MAX_TABLETS = 23;

export const TabletsManager: React.FC<TabletsManagerProps> = ({ currentUser, classes }) => {
  const [dataReferencia, setDataReferencia] = useState<Date>(new Date());
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' | '' }>({
    texto: '',
    tipo: '',
  });

  // Base de Dados (Inicializa imediatamente com baseline oficial ou cache)
  const [baseDeDados, setBaseDeDados] = useState<TabletsDatabase>(() => {
    try {
      const cached = localStorage.getItem('CACHE_TABLET_APP');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.agendamentos && parsed.agendamentos.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return (tabletsBaseline as unknown as TabletsDatabase) || {
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
  });

  // Modal de Gerenciamento
  const [modalAberto, setModalAberto] = useState(false);
  const [modalContext, setModalContext] = useState<{
    dataIso: string;
    dataBr: string;
    aula: string;
    disponiveis: number;
  } | null>(null);

  const [operacao, setOperacao] = useState<'agendar' | 'cancelar'>('agendar');
  const [modoAdminOutroUsuario, setModoAdminOutroUsuario] = useState(false);
  const [professorCustomizado, setProfessorCustomizado] = useState('');
  const [formAgendar, setFormAgendar] = useState({
    professor: currentUser?.name || '',
    turma: '',
    tablets: 17,
    senha: currentUser?.pin || '',
  });

  const [reservaSelecionadaParaCancelar, setReservaSelecionadaParaCancelar] = useState<string>('');
  const [senhaCancelar, setSenhaCancelar] = useState<string>(currentUser?.pin || '');
  const [enviandoOperacao, setEnviandoOperacao] = useState(false);

  // Identificação Unificada do Usuário Logado (Igual a Ocorrências)
  const userName = currentUser?.name || 'Professor / Docente';
  const userRole = (currentUser?.role || 'professor').toLowerCase();
  const userRoleLabel = (currentUser as any)?.roleLabel
    ? String((currentUser as any).roleLabel)
    : (userRole === 'admin' ? 'Direção Escolar (Administrador)' : 'Professor(a) / Docente');

  const isAdmin =
    userRole === 'admin' ||
    userRole === 'administrador' ||
    userRoleLabel.toLowerCase().includes('administrador') ||
    (userRole.includes('admin') && !userRole.includes('gest'));

  // Sincroniza o usuário logado com o formulário de agendamento
  useEffect(() => {
    if (userName && !modoAdminOutroUsuario) {
      setFormAgendar(prev => ({
        ...prev,
        professor: userName,
        senha: currentUser?.pin || '1234',
      }));
    }
  }, [userName, currentUser?.pin, modoAdminOutroUsuario]);

  // Formata nome para exibir estritamente Primeiro e Último nome no painel visual
  const formatarPrimeiroEUltimoNome = (nome: string): string => {
    if (!nome || !nome.trim()) return '';
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '';
    if (partes.length === 1) return partes[0];

    // Se começar com título/prefixo (Prof., Profª., Profa., etc.), pega o primeiro nome real e o último
    const prefixos = ['prof.', 'profª.', 'profa.', 'professor', 'professora', 'dr.', 'dra.'];
    if (prefixos.includes(partes[0].toLowerCase())) {
      if (partes.length === 2) return partes[1];
      return `${partes[1]} ${partes[partes.length - 1]}`;
    }

    return `${partes[0]} ${partes[partes.length - 1]}`;
  };

  // Verifica se a reserva pertence ao usuário conectado
  const isMinhaReserva = (ag: AgendamentoTablet | { professor?: string }): boolean => {
    if (!currentUser?.name) return false;
    const nomeUser = currentUser.name.trim().toLowerCase();
    const nomeProf = (ag.professor || '').trim().toLowerCase();
    if (nomeUser === nomeProf) return true;

    // Comparação tolerante para nomes completos vs primeiro e último nome
    const p1 = formatarPrimeiroEUltimoNome(nomeUser).toLowerCase();
    const p2 = formatarPrimeiroEUltimoNome(nomeProf).toLowerCase();
    return p1 === p2;
  };

  // Normalização de Datas
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

  // Cálculo da Semana (Segunda a Sexta)
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

  // Carregar Dados via Backend Proxy (sem erros de CORS)
  const carregarDadosDoSheets = async () => {
    setSincronizando(true);

    try {
      const resultado = await carregarTabletsSeguro(classes);
      const data = resultado.data;

      if (data) {
        // Preenche turmas caso venham vazias do Sheets
        let turmasFinais = data.turmas || [];
        if (turmasFinais.length === 0 && classes.length > 0) {
          turmasFinais = classes.map(c => c.name);
        }

        // Desduplicação estrita de agendamentos
        const agendamentosUnicosMap = new Map<string, any>();
        for (const ag of (data.agendamentos || [])) {
          const key = [
            (ag.data || '').trim(),
            (ag.aula || '').trim(),
            (ag.professor || '').trim(),
            (ag.turma || '').trim(),
            ag.tablets || 0,
          ].join('::');
          if (!agendamentosUnicosMap.has(key)) {
            agendamentosUnicosMap.set(key, ag);
          }
        }
        const agendamentosLimpos = Array.from(agendamentosUnicosMap.values());

        const novoDb: TabletsDatabase = {
          agendamentos: agendamentosLimpos,
          horarios:
            data.horarios && data.horarios.length > 0 ? data.horarios : baseDeDados.horarios,
          professores: data.professores || [],
          turmas: turmasFinais,
          feriados: data.feriados || [],
        };

        setBaseDeDados(novoDb);

        if (resultado.source === 'api' || resultado.source === 'direct') {
          setMensagem({
            texto: `✅ Grade de tablets sincronizada com sucesso! (${agendamentosLimpos.length} reservas carregadas do Firebase)`,
            tipo: 'sucesso',
          });
        } else {
          setMensagem({
            texto: `ℹ️ Modo local ativado: ${agendamentosLimpos.length} reservas disponíveis (${resultado.message || 'offline'})`,
            tipo: 'info',
          });
        }
        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 5000);
      } else {
        setMensagem({
          texto: 'Usando dados salvos localmente na escola.',
          tipo: 'info',
        });
      }
    } catch (err: any) {
      console.warn('Erro ao sincronizar tablets:', err.message);
      setMensagem({
        texto: 'Modo de contingência ativado com dados locais salvos no navegador.',
        tipo: 'info',
      });
    } finally {
      setSincronizando(false);
    }
  };

  useEffect(() => {
    carregarDadosDoSheets();
  }, []);

  // Lista de Professores e Usuários Unificada
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

    const unicos = Array.from(new Set([...doSheets, ...dosUsuarios, ...dasTurmas]))
      .map(s => (s || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return unicos;
  }, [baseDeDados.professores, classes, currentUser]);

  // Lista de Turmas Unificada
  const listaTurmas = useMemo(() => {
    const doSheets = baseDeDados.turmas || [];
    const daPlataforma = classes.map(c => c.name);
    return Array.from(new Set([...doSheets, ...daPlataforma])).filter(Boolean).sort();
  }, [baseDeDados.turmas, classes]);

  // Abre Modal de Agendamento/Cancelamento
  const abrirModal = (dataIso: string, dataBr: string, aula: string, disponiveis: number) => {
    setModalContext({ dataIso, dataBr, aula, disponiveis });

    const agendadosAqui = baseDeDados.agendamentos.filter(
      a => normalizarDataStr(a.data) === dataIso && String(a.aula).trim() === aula
    );

    const permitidasParaCancelar = isAdmin
      ? agendadosAqui
      : agendadosAqui.filter(isMinhaReserva);

    if (disponiveis > 0) {
      setOperacao('agendar');
      const maxPermitido = disponiveis;
      setModoAdminOutroUsuario(false);
      setProfessorCustomizado('');
      setFormAgendar({
        tablets: maxPermitido > 17 ? 17 : maxPermitido,
        professor: currentUser?.name || '',
        senha: currentUser?.pin || '',
        turma: '',
      });
    } else {
      setOperacao('cancelar');
    }

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

  // Submit: Agendar
  const handleAgendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalContext) return;

    const professorFinal = modoAdminOutroUsuario && formAgendar.professor === '__OUTRO__'
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

    setEnviandoOperacao(true);
    const payload = {
      action: 'agendar',
      data: modalContext.dataIso,
      aula: modalContext.aula,
      professor: professorFinal,
      turma: formAgendar.turma,
      tablets: Number(formAgendar.tablets),
      senha: formAgendar.senha || currentUser?.pin || '1234',
    };

    try {
      const res = await salvarReservaTabletsSeguro(payload);
      if (!res.ok) {
        setMensagem({ texto: 'Erro ao registrar reserva: ' + (res.msg || 'Verifique a senha informada.'), tipo: 'erro' });
      } else {
        const msgSucesso = isAdmin && modoAdminOutroUsuario
          ? `✅ Agendamento de ${formAgendar.tablets} tablets realizado com sucesso pela Administração em nome de ${professorFinal} (${formAgendar.turma})!`
          : `✅ Agendamento de ${formAgendar.tablets} tablets confirmado com sucesso para ${formAgendar.turma}!`;

        setMensagem({
          texto: msgSucesso,
          tipo: 'sucesso',
        });
        fecharModal();

        // Atualização otimista na memória e cache local
        const novaReserva: AgendamentoTablet = {
          data: modalContext.dataIso,
          aula: modalContext.aula,
          professor: professorFinal,
          turma: formAgendar.turma,
          tablets: Number(formAgendar.tablets),
        };
        setBaseDeDados(prev => {
          const atualizados = [...prev.agendamentos, novaReserva];
          const novoDb = { ...prev, agendamentos: atualizados };
          localStorage.setItem('CACHE_TABLET_APP', JSON.stringify(novoDb));
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

  // Submit: Cancelar
  const handleCancelar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservaSelecionadaParaCancelar) {
      setMensagem({ texto: 'Selecione o agendamento a cancelar.', tipo: 'erro' });
      return;
    }

    setEnviandoOperacao(true);
    try {
      const reservaObj: AgendamentoTablet = JSON.parse(reservaSelecionadaParaCancelar);

      // Validação estrita: apenas o Administrador pode excluir ou cancelar agendamentos de outros professores
      if (!isAdmin && !isMinhaReserva(reservaObj)) {
        setMensagem({
          texto: '❌ Permissão restrita: apenas o perfil de Administrador pode cancelar reservas de outros professores.',
          tipo: 'erro',
        });
        return;
      }

      const payload = {
        action: 'cancelar',
        data: reservaObj.data,
        aula: reservaObj.aula,
        professor: reservaObj.professor,
        turma: reservaObj.turma,
        senha: senhaCancelar,
      };

      const res = await salvarReservaTabletsSeguro(payload);
      if (!res.ok) {
        setMensagem({
          texto: 'Erro ao cancelar: ' + (res.msg || 'Verifique a senha informada.'),
          tipo: 'erro',
        });
      } else {
        setMensagem({
          texto: `✅ Agendamento de ${reservaObj.professor} (${reservaObj.turma}) cancelado com sucesso!`,
          tipo: 'sucesso',
        });
        fecharModal();

        // Remove localmente
        setBaseDeDados(prev => {
          const filtrados = prev.agendamentos.filter(
            a =>
              !(
                normalizarDataStr(a.data) === normalizarDataStr(reservaObj.data) &&
                a.aula === reservaObj.aula &&
                a.professor === reservaObj.professor &&
                a.turma === reservaObj.turma
              )
          );
          const novoDb = { ...prev, agendamentos: filtrados };
          localStorage.setItem('CACHE_TABLET_APP', JSON.stringify(novoDb));
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

  // Nomes dos Dias
  const nomesDias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

  return (
    <div className="space-y-6">
      {/* Top Institutional & Unified Active Operator Card (Idêntico ao módulo de Ocorrências) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Tablet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                Agendamento de Tablets Escolares
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                CAPACIDADE: {MAX_TABLETS} TABLETS
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Grade semanal de agendamento por aula e turma • Integrada ao sistema unificado da escola.
            </p>
          </div>
        </div>

        {/* Informação do Usuário Autenticado */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 sm:px-3 rounded-xl self-start md:self-auto">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-900 leading-none">{userName}</span>
              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${
                isAdmin
                  ? 'bg-purple-100 text-purple-800 border-purple-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                {userRoleLabel}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
              {isAdmin ? '🛡️ Privilégio de Direção / Admin' : '👤 Usuário Ativo'}
            </span>
          </div>
        </div>
      </div>

      {/* Controles de Semana e Navegação */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs w-fit">
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
          className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200/60 transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span>Semana Atual (Hoje)</span>
        </button>
      </div>

      {/* Mensagem Toast */}
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
              <AlertCircle className="w-4 h-4 text-rose-600" />
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

      {/* Legenda Informativa */}
      <div className="flex flex-wrap items-center gap-4 text-xs bg-white p-3.5 rounded-2xl border border-slate-200">
        <span className="font-bold text-slate-600 text-[11px] uppercase tracking-wider">
          Legenda de Disponibilidade:
        </span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="font-medium text-slate-700">Totalmente Livre (23 tablets)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="font-medium text-slate-700">Parcialmente Ocupado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-500" />
          <span className="font-medium text-slate-700">Esgotado (0 disponíveis)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-400" />
          <span className="font-medium text-slate-700">Horário Bloqueado / Intervalo</span>
        </div>
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

                        const agendadosAqui = baseDeDados.agendamentos.filter(
                          a =>
                            normalizarDataStr(a.data) === strData &&
                            String(a.aula).trim() === aulaStr
                        );
                        const totalUso = agendadosAqui.reduce(
                          (acc, curr) => acc + (curr.tablets || 0),
                          0
                        );
                        const disponiveis = Math.max(0, MAX_TABLETS - totalUso);

                        const isTotalmenteLivre = disponiveis === MAX_TABLETS;
                        const isEsgotado = disponiveis === 0;

                        return (
                          <td
                            key={strData}
                            onClick={() =>
                              abrirModal(strData, formatarDataBR(dia), aulaStr, disponiveis)
                            }
                            className={`p-2.5 border-r border-slate-200 text-center align-top relative group transition-colors cursor-pointer ${
                              isTotalmenteLivre
                                ? 'hover:bg-sky-50'
                                : isEsgotado
                                ? 'bg-rose-50/80 hover:bg-rose-100'
                                : 'bg-amber-50/70 hover:bg-amber-100'
                            }`}
                          >
                            {isTotalmenteLivre ? (
                              <div className="py-2">
                                <div className="text-emerald-600 font-black text-base flex items-center justify-center gap-1">
                                  <span>{disponiveis}</span>
                                  <Tablet className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">
                                  Livres
                                </div>
                              </div>
                            ) : isEsgotado ? (
                              <div className="py-1">
                                <div className="text-rose-600 font-black text-xs flex items-center justify-center gap-1 mb-1">
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Esgotado</span>
                                </div>
                                <div className="space-y-1 text-left text-[11px]">
                                  {agendadosAqui.map((ag, i) => {
                                    const ehMinha = isMinhaReserva(ag);
                                    return (
                                      <div
                                        key={i}
                                        className={`p-1.5 rounded-lg border leading-tight ${
                                          ehMinha
                                            ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                                            : 'bg-white/80 border-rose-200'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className={`font-bold ${ehMinha ? 'text-emerald-900' : 'text-slate-800'}`}>
                                            • {formatarPrimeiroEUltimoNome(ag.professor)} ({ag.tablets} tab.)
                                          </span>
                                          {ehMinha && (
                                            <span className="text-[9px] font-black px-1.5 py-0.2 bg-emerald-600 text-white rounded">
                                              Você
                                            </span>
                                          )}
                                        </div>
                                        <span className={`text-[10px] block font-medium ${ehMinha ? 'text-emerald-700' : 'text-rose-700'}`}>
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
                                    return (
                                      <div
                                        key={i}
                                        className={`p-1.5 rounded-lg border leading-tight ${
                                          ehMinha
                                            ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                                            : 'bg-white/90 border-amber-200'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className={`font-bold ${ehMinha ? 'text-emerald-900' : 'text-slate-800'}`}>
                                            • {formatarPrimeiroEUltimoNome(ag.professor)} ({ag.tablets} tab.)
                                          </span>
                                          {ehMinha && (
                                            <span className="text-[9px] font-black px-1.5 py-0.2 bg-emerald-600 text-white rounded">
                                              Você
                                            </span>
                                          )}
                                        </div>
                                        <span className={`text-[10px] block ${ehMinha ? 'text-emerald-700 font-medium' : 'text-slate-600'}`}>
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

      {/* MODAL DE RESERVA / CANCELAMENTO */}
      {modalAberto && modalContext && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95">
            <div className="bg-sky-600 text-white px-5 py-4 flex justify-between items-center">
              <h2 className="font-black text-sm flex items-center gap-2">
                <Tablet className="w-4 h-4" />
                <span>Gerenciar Horário de Tablets</span>
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
                  Disponíveis neste momento: {modalContext.disponiveis} de {MAX_TABLETS} tablets
                </p>
              </div>

              {/* Seletor de Operação */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  O que você deseja fazer?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={modalContext.disponiveis === 0}
                    onClick={() => setOperacao('agendar')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      operacao === 'agendar'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    ➕ Agendar Tablets
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
                  {/* Identificação do Solicitante */}
                  {isAdmin ? (
                    <div className="bg-purple-50/90 border border-purple-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-extrabold text-purple-900 uppercase flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                          <span>Opção de Agendamento (Administrador)</span>
                        </span>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-200/70 px-2 py-0.5 rounded-full">
                          Direção Escolar
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
                          <span>Em nome de outro usuário</span>
                        </button>
                      </div>

                      {modoAdminOutroUsuario && (
                        <p className="text-[10px] text-purple-800 font-medium mt-2 leading-relaxed bg-purple-100/60 p-2 rounded-lg border border-purple-200/60">
                          🛡️ <strong>Modo Administrador:</strong> Selecione abaixo o professor que utilizará os tablets nesta aula.
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Identificação Automática do Docente Logado (Sem dropdown manual) */
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                          {userName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">
                            Docente Solicitante
                          </span>
                          <span className="text-xs font-bold text-slate-900">{userName}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Identificado</span>
                      </span>
                    </div>
                  )}

                  {/* Seleção de Docente quando o Administrador agenda para terceiros */}
                  {isAdmin && modoAdminOutroUsuario && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Selecione o(a) Professor(a) / Usuário
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
                        <option value="__OUTRO__">
                          ➕ Outro Docente / Professor Eventual (Digitar nome)
                        </option>
                      </select>

                      {formAgendar.professor === '__OUTRO__' && (
                        <div className="animate-in fade-in pt-1">
                          <label className="block text-xs font-bold text-purple-900 uppercase mb-1">
                            Nome do Professor(a) Eventual
                          </label>
                          <input
                            type="text"
                            value={professorCustomizado}
                            onChange={e => setProfessorCustomizado(e.target.value)}
                            required
                            placeholder="Digite o nome completo do professor..."
                            className="w-full p-2.5 text-xs border border-purple-300 bg-white rounded-xl focus:ring-2 focus:ring-purple-500 font-bold text-slate-800"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Seleção de Turma */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Turma
                    </label>
                    <select
                      value={formAgendar.turma}
                      onChange={e => setFormAgendar({ ...formAgendar, turma: e.target.value })}
                      required
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800 bg-white"
                    >
                      <option value="">Selecione a turma...</option>
                      {listaTurmas.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantidade de Tablets */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">
                        Quantidade de Tablets
                      </label>
                      <span className="text-[11px] font-bold text-sky-600">
                        (Máx: {modalContext.disponiveis} disponíveis)
                      </span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={modalContext.disponiveis}
                      value={formAgendar.tablets}
                      onChange={e =>
                        setFormAgendar({ ...formAgendar, tablets: parseInt(e.target.value) || 1 })
                      }
                      required
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-bold text-slate-800"
                    />
                  </div>

                  {/* Botão de Confirmação Unificada */}
                  <button
                    type="submit"
                    disabled={enviandoOperacao}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl transition-all shadow-md text-xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-3"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {enviandoOperacao
                        ? 'Gravando Reserva...'
                        : (isAdmin && modoAdminOutroUsuario
                            ? 'Confirmar Agendamento p/ Docente'
                            : 'Confirmar Agendamento')}
                    </span>
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
                            <strong>{agendadosAqui.map(a => formatarPrimeiroEUltimoNome(a.professor)).join(', ')}</strong>.
                          </p>
                          <p className="text-slate-500 text-[11px] leading-relaxed">
                            Apenas o(a) próprio(a) professor(a) responsável pelo agendamento ou a <strong>Direção Escolar</strong> têm permissão para cancelar esta reserva.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <>
                        {isAdmin && (
                          <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-xs text-rose-800 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>
                              <strong>Permissão de Administrador:</strong> Você pode excluir qualquer reserva deste horário.
                            </span>
                          </div>
                        )}

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
                              <option key={i} value={JSON.stringify(ag)}>
                                {formatarPrimeiroEUltimoNome(ag.professor)} — Turma: {ag.turma} ({ag.tablets} tab.){isMinhaReserva(ag) ? ' (Sua reserva)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            Cancelamento validado automaticamente pela sessão de <strong>{userName}</strong>.
                          </span>
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
