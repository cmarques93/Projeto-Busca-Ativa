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
  Calendar
} from 'lucide-react';
import { SchoolClass } from '../types';
import { carregarTabletsSeguro, salvarReservaTabletsSeguro } from '../lib/sheetsSyncService';

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

  // Base de Dados
  const [baseDeDados, setBaseDeDados] = useState<TabletsDatabase>({
    agendamentos: [],
    horarios: [
      '1ª Aula (07:30 - 08:20)',
      '2ª Aula (08:20 - 09:10)',
      'Intervalo Manhã (09:10 - 09:30)',
      '3ª Aula (09:30 - 10:20)',
      '4ª Aula (10:20 - 11:10)',
      '5ª Aula (11:10 - 12:00)',
      'Almoço / Intervalo (12:00 - 13:00)',
      '6ª Aula (13:00 - 13:50)',
      '7ª Aula (13:50 - 14:40)',
      '8ª Aula (14:40 - 15:30)',
    ],
    professores: [],
    turmas: [],
    feriados: [],
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
  const [formAgendar, setFormAgendar] = useState({
    professor: currentUser?.name || '',
    turma: '',
    tablets: 17,
    senha: currentUser?.pin || '',
  });

  const [reservaSelecionadaParaCancelar, setReservaSelecionadaParaCancelar] = useState<string>('');
  const [senhaCancelar, setSenhaCancelar] = useState<string>(currentUser?.pin || '');
  const [enviandoOperacao, setEnviandoOperacao] = useState(false);

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
            texto: `✅ Grade de tablets sincronizada com sucesso! (${agendamentosLimpos.length} reservas únicas carregadas da planilha)`,
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

  // Lista de Professores Unificada
  const listaProfessores = useMemo(() => {
    const doSheets = baseDeDados.professores.map(p =>
      typeof p === 'object' && p !== null ? (p as any).nome : String(p)
    );
    if (currentUser?.name && !doSheets.includes(currentUser.name)) {
      doSheets.push(currentUser.name);
    }
    return Array.from(new Set(doSheets)).filter(Boolean).sort();
  }, [baseDeDados.professores, currentUser]);

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

    if (disponiveis > 0) {
      setOperacao('agendar');
      const maxPermitido = disponiveis;
      setFormAgendar(prev => ({
        ...prev,
        tablets: maxPermitido > 17 ? 17 : maxPermitido,
        professor: currentUser?.name || prev.professor,
        senha: currentUser?.pin || prev.senha,
      }));
    } else {
      setOperacao('cancelar');
    }

    if (agendadosAqui.length > 0) {
      setReservaSelecionadaParaCancelar(JSON.stringify(agendadosAqui[0]));
    } else {
      setReservaSelecionadaParaCancelar('');
    }

    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setModalContext(null);
  };

  // Submit: Agendar
  const handleAgendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalContext) return;

    if (!formAgendar.turma) {
      setMensagem({ texto: 'Por favor, selecione uma turma.', tipo: 'erro' });
      return;
    }

    setEnviandoOperacao(true);
    const payload = {
      action: 'agendar',
      data: modalContext.dataIso,
      aula: modalContext.aula,
      professor: formAgendar.professor,
      turma: formAgendar.turma,
      tablets: Number(formAgendar.tablets),
      senha: formAgendar.senha,
    };

    try {
      const res = await salvarReservaTabletsSeguro(payload);
      if (!res.ok) {
        setMensagem({ texto: 'Erro ao registrar reserva: ' + (res.msg || 'Verifique a senha informada.'), tipo: 'erro' });
      } else {
        setMensagem({
          texto: `✅ Agendamento de ${formAgendar.tablets} tablets confirmado com sucesso para ${formAgendar.turma}!`,
          tipo: 'sucesso',
        });
        fecharModal();

        // Atualização otimista na memória e cache local
        const novaReserva: AgendamentoTablet = {
          data: modalContext.dataIso,
          aula: modalContext.aula,
          professor: formAgendar.professor,
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
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
            <Tablet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Agendamento de Tablets Escolares
              </h1>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                TOTAL: {MAX_TABLETS} EQUIPAMENTOS
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Controle semanal de uso por aula e turma integrado à base do sistema escolar.
            </p>
          </div>
        </div>

        {/* Controles de Semana */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
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
            onClick={carregarDadosDoSheets}
            disabled={sincronizando}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
            <span>{sincronizando ? 'Sincronizando...' : 'Atualizar Grade'}</span>
          </button>
        </div>
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
                                  {agendadosAqui.map((ag, i) => (
                                    <div
                                      key={i}
                                      className="p-1 rounded bg-white/70 border border-rose-200 leading-tight"
                                    >
                                      <span className="font-bold text-slate-800">
                                        • {ag.professor.split(' ')[0]} ({ag.tablets} tab.)
                                      </span>
                                      <span className="text-[10px] text-rose-700 block font-medium">
                                        Turma: {ag.turma}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="py-1">
                                <div className="text-amber-700 font-black text-sm flex items-center justify-center gap-1 mb-1">
                                  <span>{disponiveis} livres</span>
                                  <Tablet className="w-3.5 h-3.5" />
                                </div>
                                <div className="space-y-1 text-left text-[11px]">
                                  {agendadosAqui.map((ag, i) => (
                                    <div
                                      key={i}
                                      className="p-1 rounded bg-white/80 border border-amber-200 leading-tight"
                                    >
                                      <span className="font-bold text-slate-800">
                                        • {ag.professor.split(' ')[0]} ({ag.tablets} tab.)
                                      </span>
                                      <span className="text-[10px] text-slate-600 block">
                                        Turma: {ag.turma}
                                      </span>
                                    </div>
                                  ))}
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
                <form onSubmit={handleAgendar} className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Professor(a) Solicitante
                    </label>
                    <select
                      value={formAgendar.professor}
                      onChange={e => setFormAgendar({ ...formAgendar, professor: e.target.value })}
                      required
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                    >
                      <option value="">Selecione seu nome...</option>
                      {listaProfessores.map(p => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Turma
                    </label>
                    <select
                      value={formAgendar.turma}
                      onChange={e => setFormAgendar({ ...formAgendar, turma: e.target.value })}
                      required
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                    >
                      <option value="">Selecione a turma...</option>
                      {listaTurmas.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">
                        Quantidade de Tablets
                      </label>
                      <span className="text-[11px] font-bold text-sky-600">
                        (Máx: {modalContext.disponiveis})
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

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Sua Senha / PIN de Autorização
                    </label>
                    <input
                      type="password"
                      value={formAgendar.senha}
                      onChange={e => setFormAgendar({ ...formAgendar, senha: e.target.value })}
                      required
                      placeholder="Digite seu PIN/senha cadastrado"
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-mono tracking-widest text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={enviandoOperacao}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl transition-all shadow-md text-xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{enviandoOperacao ? 'Gravando Reserva...' : 'Confirmar Agendamento'}</span>
                  </button>
                </form>
              )}

              {/* FORMULÁRIO 2: CANCELAR */}
              {operacao === 'cancelar' && (
                <form onSubmit={handleCancelar} className="space-y-3 pt-2 border-t border-slate-200">
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

                    return (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                            Agendamento a Cancelar
                          </label>
                          <select
                            value={reservaSelecionadaParaCancelar}
                            onChange={e => setReservaSelecionadaParaCancelar(e.target.value)}
                            required
                            className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-semibold text-slate-800"
                          >
                            <option value="">Selecione o agendamento...</option>
                            {agendadosAqui.map((ag, i) => (
                              <option key={i} value={JSON.stringify(ag)}>
                                {ag.professor} — Turma: {ag.turma} ({ag.tablets} tab.)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                            Sua Senha / PIN para Confirmar
                          </label>
                          <input
                            type="password"
                            value={senhaCancelar}
                            onChange={e => setSenhaCancelar(e.target.value)}
                            required
                            placeholder="Digite sua senha cadastrada"
                            className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono tracking-widest text-slate-800"
                          />
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
