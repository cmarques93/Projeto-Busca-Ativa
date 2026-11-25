import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  BookOpen,
  Shield,
  Users,
  UserCheck,
  DoorOpen,
  ShieldAlert,
  AlertOctagon,
  Tablet,
  CalendarDays,
  FileSpreadsheet,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  Lock,
  ImagePlus,
  RotateCcw,
  Sparkles,
  Clock,
  HelpCircle,
  KeyRound,
  Settings,
  Search
} from 'lucide-react';
import { UserSession, School as SchoolType } from '../types';

export type ManualAudienceFilter =
  | 'completo'
  | 'professor'
  | 'aoe'
  | 'gestao_paac'
  | 'admin'
  | 'super_admin';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession;
  currentSchool?: SchoolType;
}

interface ScreenFigureProps {
  screenId: string;
  number: string;
  title: string;
  subtitle: string;
  callouts: { num: string; label: string; desc: string }[];
  customImage?: string;
  onUploadImage: (screenId: string, dataUrl: string) => void;
  onResetImage: (screenId: string) => void;
  children: React.ReactNode;
}

const ScreenFigure: React.FC<ScreenFigureProps> = ({
  screenId,
  number,
  title,
  subtitle,
  callouts,
  customImage,
  onUploadImage,
  onResetImage,
  children,
}) => {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUploadImage(screenId, reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="manual-avoid-break rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black tracking-wide uppercase">
            Tela {number}
          </span>
          <div>
            <h4 className="text-xs font-extrabold text-slate-900">{title}</h4>
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer transition-colors">
            <ImagePlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>{customImage ? 'Trocar print real' : 'Anexar print real'}</span>
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
          {customImage && (
            <button
              type="button"
              onClick={() => onResetImage(screenId)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 text-[11px] font-semibold text-slate-600 cursor-pointer"
              title="Voltar para a ilustração padrão"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Padrão</span>
            </button>
          )}
        </div>
      </div>

      {/* Área visual da tela (Print real anexado OU ilustração fiel da interface EduScope 360) */}
      <div className="p-4 bg-slate-100/80 border-b border-slate-200">
        {customImage ? (
          <div className="rounded-xl overflow-hidden border border-slate-300 bg-white shadow-xs">
            <img
              src={customImage}
              alt={`Print da tela: ${title}`}
              className="w-full h-auto max-h-[380px] object-contain mx-auto"
            />
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-slate-300 bg-white shadow-sm">
            {/* Barra simulada de navegador */}
            <div className="bg-slate-200/90 px-3 py-1.5 flex items-center justify-between border-b border-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="px-3 py-0.5 rounded-md bg-white/90 text-[10px] font-mono text-slate-600 border border-slate-300/70">
                {typeof window !== 'undefined' ? window.location.host : 'eduscope360.app'}
              </div>
              <div className="w-10" />
            </div>
            {children}
          </div>
        )}
      </div>

      {/* Legenda numerada dos elementos da tela */}
      <div className="p-3.5 bg-white grid grid-cols-1 sm:grid-cols-2 gap-2">
        {callouts.map((c) => (
          <div key={c.num} className="flex items-start gap-2 text-[11px] leading-snug">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
              {c.num}
            </span>
            <div>
              <strong className="text-slate-900">{c.label}:</strong>{' '}
              <span className="text-slate-600">{c.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PinBadge: React.FC<{ n: string; className?: string }> = ({ n, className = '' }) => (
  <span
    className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-black shadow-xs ring-2 ring-white shrink-0 ${className}`}
  >
    {n}
  </span>
);

export const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentSchool,
}) => {
  const defaultAudience: ManualAudienceFilter =
    currentUser.role === 'professor'
      ? 'professor'
      : currentUser.role === 'aoe'
      ? 'aoe'
      : 'completo';

  const [selectedAudience, setSelectedAudience] = useState<ManualAudienceFilter>(defaultAudience);
  const [customScreens, setCustomScreens] = useState<Record<string, string>>({});

  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove('printing-user-manual');
    };
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      cleanup();
    };
  }, []);

  if (!isOpen) return null;

  const schoolName = currentSchool?.name || currentUser.schoolName || 'Unidade Escolar';
  const currentHost = typeof window !== 'undefined' ? window.location.host : 'eduscope360.app';
  const todayFormatted = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handlePrintPdf = () => {
    document.body.classList.add('printing-user-manual');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-user-manual');
      }, 500);
    }, 100);
  };

  const handleUploadScreen = (screenId: string, dataUrl: string) => {
    setCustomScreens((prev) => ({ ...prev, [screenId]: dataUrl }));
  };

  const handleResetScreen = (screenId: string) => {
    setCustomScreens((prev) => {
      const next = { ...prev };
      delete next[screenId];
      return next;
    });
  };

  const showAll = selectedAudience === 'completo';
  const showProfessor = showAll || selectedAudience === 'professor';
  const showAOE = showAll || selectedAudience === 'aoe';
  const showGestao = showAll || selectedAudience === 'gestao_paac';
  const showAdmin = showAll || selectedAudience === 'admin';
  const showMaster = showAll || selectedAudience === 'super_admin';

  const audienceTitleMap: Record<ManualAudienceFilter, string> = {
    completo: 'Manual Completo do Usuário (Todos os Perfis)',
    professor: 'Guia do Usuário — Perfil Professor(a) Regente',
    aoe: 'Guia do Usuário — Perfil AOE / Secretaria & Portaria',
    gestao_paac: 'Guia do Usuário — Perfil Coordenação Pedagógica / Gestão / PAAC',
    admin: 'Guia do Usuário — Perfil Administrador da Unidade Escolar',
    super_admin: 'Guia do Usuário — Perfil Painel Master Global',
  };

  const permissionMatrix = [
    { feature: 'Diário do Professor (Faltas / Atestados)', prof: 'Sim', aoe: 'Consulta', gestao: 'Sim', admin: 'Sim', master: 'Auxílio' },
    { feature: 'Chamada por Turma & Frequência Geral', prof: 'Não', aoe: 'Consulta', gestao: 'Sim', admin: 'Sim', master: 'Auxílio' },
    { feature: 'Controle de Portaria (Atrasos & Saídas)', prof: 'Não', aoe: 'Sim', gestao: 'Sim', admin: 'Sim', master: 'Auxílio' },
    { feature: 'Busca Ativa (WhatsApp & Casos Críticos)', prof: 'Não', aoe: 'Não', gestao: 'Sim', admin: 'Sim', master: 'Auxílio' },
    { feature: 'Telefones dos Responsáveis (LGPD)', prof: 'Oculto', aoe: 'Portaria', gestao: 'Sim', admin: 'Sim', master: 'Auxílio' },
    { feature: 'Registrar Ocorrência & Ver Devolutivas', prof: 'Sim', aoe: 'Não', gestao: 'Sim', admin: 'Sim', master: 'Auxílio' },
    { feature: 'Triagem, Mediação & Tratativa com Família', prof: 'Não', aoe: 'Não', gestao: 'Sim', admin: 'Sim', master: 'Auxílio' },
    { feature: 'Agendamento de Equipamentos (Tablets)', prof: 'Reservar', aoe: 'Conferir', gestao: 'Gestão Total', admin: 'Gestão Total', master: 'Auxílio' },
    { feature: 'Grade Curricular & Calendário Letivo', prof: 'Consulta', aoe: 'Roteiro AOE', gestao: 'Editar/Gerar', admin: 'Editar/Gerar', master: 'Auxílio' },
    { feature: 'Meu Horário Multiplica (Auto-edição)', prof: 'Sim', aoe: 'Não', gestao: 'Sim', admin: 'Sim', master: 'Não' },
    { feature: 'Relatório de Acompanhamento & Pedagógicos', prof: 'Não', aoe: 'Não', gestao: 'Sim', admin: 'Sim', master: 'Não' },
    { feature: 'Cadastro/Exclusão de Turmas e Estudantes', prof: 'Não', aoe: 'Consulta', gestao: 'Sim', admin: 'Sim', master: 'Sim' },
    { feature: 'Gestão de Operadores & Senhas PIN', prof: 'Não', aoe: 'Não', gestao: 'Não', admin: 'Sim', master: 'Sim' },
    { feature: 'Backup Offline & Restaurar Backup JSON', prof: 'Não', aoe: 'Não', gestao: 'Sim', admin: 'Sim', master: 'Sim' },
    { feature: 'Criar Unidades Escolares & Módulos SaaS', prof: 'Não', aoe: 'Não', gestao: 'Não', admin: 'Não', master: 'Exclusivo' },
  ];

  const badgeCell = (val: string) => {
    if (val === 'Sim' || val === 'Gestão Total' || val === 'Editar/Gerar' || val === 'Exclusivo') {
      return <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">{val}</span>;
    }
    if (val === 'Não' || val === 'Oculto') {
      return <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 font-semibold text-[10px]">{val}</span>;
    }
    return <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 font-bold text-[10px]">{val}</span>;
  };

  return (
    <div
      id="sigaescola-user-manual-print-root"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:static print:inset-auto print:bg-white print:p-0 print:block"
    >
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:max-w-none print:max-h-none print:rounded-none print:shadow-none print:border-0">
        {/* Barra Superior de Controle do Manual (oculta na impressão PDF) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold leading-tight">
                Manual do Usuário Oficial — EduScope 360
              </h2>
              <p className="text-[11px] text-slate-300">
                Visualize por perfil, anexe prints reais (opcional) e exporte em PDF pronto para distribuição
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
              title="Abrir janela de impressão para salvar como PDF em formato A4"
            >
              <Printer className="w-4 h-4" />
              <span>Salvar / Imprimir em PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
              aria-label="Fechar manual"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Seletor de Edição / Perfil para Visualização e PDF (oculto na impressão) */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Edição do Manual / PDF:</span>
            {(
              [
                { id: 'completo', label: 'Manual Completo (Todos)' },
                { id: 'professor', label: 'Professor' },
                { id: 'aoe', label: 'AOE / Portaria' },
                { id: 'gestao_paac', label: 'Gestão / PAAC' },
                { id: 'admin', label: 'Administrador' },
                { id: 'super_admin', label: 'Master Global' },
              ] as { id: ManualAudienceFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedAudience(opt.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors border ${
                  selectedAudience === opt.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            Dica: na janela de impressão, escolha <strong>&quot;Salvar como PDF&quot;</strong> e marque <strong>&quot;Gráficos de plano de fundo&quot;</strong>.
          </p>
        </div>

        {/* CONTEÚDO IMPRIMÍVEL DO MANUAL */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-8 bg-white text-slate-800 print:overflow-visible print:p-0 print:space-y-6">
          {/* =============================================================== */}
          {/* CAPA INSTITUCIONAL                                              */}
          {/* =============================================================== */}
          <section className="manual-page-break rounded-3xl bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-8 sm:p-10 border border-slate-800 shadow-md print:rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-white/15">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-black text-lg shadow-md">
                  360
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-indigo-300">
                    Documentação Oficial da Plataforma
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    EduScope 360 • Manual do Usuário
                  </h1>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold">
                Versão 2026 • Nuvem Firebase
              </span>
            </div>

            <div className="mt-7 space-y-3">
              <p className="text-xs uppercase tracking-widest font-bold text-indigo-300">
                {audienceTitleMap[selectedAudience]}
              </p>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                {schoolName}
              </h2>
              <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
                Guia completo e ilustrado de operação do Portal Integrado de Gestão Escolar, Frequência, Busca Ativa (Resolução SEDUC 39/2023), Portaria, Ocorrências &amp; Mediação, Agendamento de Equipamentos, Grade Horária e Calendário Letivo.
              </p>
            </div>

            {/* Sumário rápido na capa */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-1.5">
                <p className="font-black text-indigo-200 uppercase tracking-wider text-[11px]">
                  O que você encontra neste manual
                </p>
                <ul className="space-y-1 text-slate-200 list-disc list-inside">
                  <li>Acesso com PIN, navegação por cards e sincronização automática</li>
                  <li>Matriz completa de permissões por perfil e regras LGPD</li>
                  <li>Passo a passo detalhado de cada função e botão da plataforma</li>
                  <li>Telas ilustradas com legendas numeradas (①, ②, ③...)</li>
                  <li>Backup de Segurança Offline, Restauração e Solução de Dúvidas</li>
                </ul>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4 flex flex-col justify-between space-y-2">
                <div>
                  <p className="font-black text-indigo-200 uppercase tracking-wider text-[11px]">
                    Perfis contemplados nesta edição
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {showProfessor && <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-100 font-bold text-[11px]">Professor(a)</span>}
                    {showAOE && <span className="px-2.5 py-0.5 rounded-full bg-sky-500/25 border border-sky-400/40 text-sky-100 font-bold text-[11px]">AOE / Portaria</span>}
                    {showGestao && <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-indigo-100 font-bold text-[11px]">Gestão / PAAC</span>}
                    {showAdmin && <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-400/40 text-purple-100 font-bold text-[11px]">Administrador</span>}
                    {showMaster && <span className="px-2.5 py-0.5 rounded-full bg-amber-500/30 border border-amber-400/40 text-amber-100 font-bold text-[11px]">Master Global</span>}
                  </div>
                </div>
                <div className="pt-2 border-t border-white/15 text-[11px] text-slate-300 flex flex-wrap justify-between gap-2">
                  <span>Emitido em: <strong className="text-white">{todayFormatted}</strong></span>
                  <span>Endereço oficial: <strong className="text-white">{currentHost}</strong></span>
                </div>
              </div>
            </div>
          </section>

          {/* =============================================================== */}
          {/* SEÇÃO 1: ACESSO, NAVEGAÇÃO E SINCRONIZAÇÃO                      */}
          {/* =============================================================== */}
          <section className="space-y-5">
            <div className="border-b-2 border-indigo-600 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Seção 1</span>
              <h2 className="text-xl font-black text-slate-900">
                Acesso ao Sistema, Barra Superior &amp; Sincronização Automática
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 font-extrabold text-slate-900 mb-1.5">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  <span>1. Login com PIN de 4 dígitos</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Acesse o link oficial no computador ou celular, confirme a unidade escolar, selecione seu nome na lista de operadores e digite sua senha PIN pessoal de 4 números.
                </p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 font-extrabold text-slate-900 mb-1.5">
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                  <span>2. Sincronização em Tempo Real</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Todos os lançamentos são salvos diretamente no Firebase Cloud. Ao abrir o sistema, fazer login ou voltar para a aba no celular, os dados atualizam automaticamente.
                </p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 font-extrabold text-slate-900 mb-1.5">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span>3. Privacidade &amp; LGPD Escolar</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Cada perfil visualiza apenas o que precisa. Professores não visualizam telefones de responsáveis; dados sensíveis de busca ativa ficam restritos à Gestão e Administração.
                </p>
              </div>
            </div>

            {/* TELA 1: LOGIN */}
            <ScreenFigure
              screenId="tela_login"
              number="1"
              title="Tela de Login e Identificação do Operador"
              subtitle="Primeiro acesso no computador ou celular"
              customImage={customScreens['tela_login']}
              onUploadImage={handleUploadScreen}
              onResetImage={handleResetScreen}
              callouts={[
                { num: '1', label: 'Unidade Escolar', desc: `Confirma a escola ativa (${schoolName}).` },
                { num: '2', label: 'Seleção de Perfil/Operador', desc: 'Escolha seu nome cadastrado (Professor, AOE, Gestão ou Admin).' },
                { num: '3', label: 'Senha PIN (4 dígitos)', desc: 'Digite seu código numérico pessoal fornecido pela Administração.' },
                { num: '4', label: 'Botão Entrar', desc: 'Carrega automaticamente os cards e permissões do seu perfil.' },
              ]}
            >
              <div className="p-5 bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
                <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center">360</div>
                      <div>
                        <p className="font-black text-indigo-700 text-sm">EduScope 360</p>
                        <p className="text-[10px] text-slate-500">{schoolName}</p>
                      </div>
                    </div>
                    <PinBadge n="1" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="text-slate-700 font-semibold">Operador: Profª. Maria Oliveira (Professor)</span>
                      <PinBadge n="2" />
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="text-slate-500 font-mono tracking-widest">PIN: • • • •</span>
                      <PinBadge n="3" />
                    </div>
                  </div>
                  <div className="bg-indigo-600 text-white font-extrabold text-center py-2 rounded-xl flex items-center justify-center gap-2">
                    <span>Entrar no Sistema</span>
                    <PinBadge n="4" />
                  </div>
                </div>
              </div>
            </ScreenFigure>

            {/* TELA 2: BARRA SUPERIOR & TELA INICIAL */}
            <ScreenFigure
              screenId="tela_inicio"
              number="2"
              title="Barra Principal Unificada e Tela Inicial"
              subtitle="Menu superior com todas as funcionalidades liberadas para a escola e acesso direto aos módulos"
              customImage={customScreens['tela_inicio']}
              onUploadImage={handleUploadScreen}
              onResetImage={handleResetScreen}
              callouts={[
                { num: '1', label: 'Barra Principal', desc: 'Identificação da escola, perfil ativo, alternância de usuário e encerramento de sessão.' },
                { num: '2', label: 'Menu Superior & Utilitários', desc: 'Acesso rápido a todas as funcionalidades liberadas para a escola, Relatório Oficial, Backup, Manual e Sincronizar.' },
                { num: '3', label: 'Módulos da Tela Inicial', desc: 'Clique em qualquer módulo para abrir diretamente suas funcionalidades.' },
              ]}
            >
              <div className="bg-slate-50">
                <div className="bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 text-white px-3 py-2 flex items-center justify-between text-[10px]">
                  <div>
                    <span className="font-bold text-white">EduScope 360 - Portal Integrado de Gestão Escolar</span>
                    <p className="text-[9px] text-slate-300">{schoolName}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-slate-800 px-2 py-0.5 rounded">Operador · Coordenação / PAAC</span>
                    <PinBadge n="1" />
                  </div>
                </div>
                <div className="bg-white border-b border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-700">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">Início</span>
                    <span>Diário &amp; Portaria</span>
                    <span>Busca Ativa</span>
                    <span>Ocorrências</span>
                    <span>Equipamentos</span>
                    <span>Relatórios</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-1 rounded-lg bg-amber-500 text-white font-bold">Relatório</span>
                    <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold">Backup</span>
                    <span className="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold">Sincronizar</span>
                    <PinBadge n="2" />
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                    <div className="bg-white border border-indigo-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1"><UserCheck className="w-4 h-4 text-indigo-600" /><PinBadge n="3" /></div>
                      <p className="font-extrabold text-slate-900">Diário &amp; Portaria</p>
                      <p className="text-slate-500 text-[9px]">Chamada, Portaria, Turmas</p>
                    </div>
                    <div className="bg-white border border-rose-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1"><ShieldAlert className="w-4 h-4 text-rose-600" /></div>
                      <p className="font-extrabold text-slate-900">Busca Ativa</p>
                      <p className="text-slate-500 text-[9px]">WhatsApp &amp; Casos Críticos</p>
                    </div>
                    <div className="bg-white border border-amber-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1"><AlertOctagon className="w-4 h-4 text-amber-600" /></div>
                      <p className="font-extrabold text-slate-900">Ocorrências</p>
                      <p className="text-slate-500 text-[9px]">Triagem e Devolutivas</p>
                    </div>
                    <div className="bg-white border border-sky-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1"><Tablet className="w-4 h-4 text-sky-600" /></div>
                      <p className="font-extrabold text-slate-900">Equipamentos</p>
                      <p className="text-slate-500 text-[9px]">Tablets &amp; Inventário</p>
                    </div>
                  </div>
                </div>
              </div>
            </ScreenFigure>
          </section>

          {/* =============================================================== */}
          {/* SEÇÃO 2: MATRIZ DE PERMISSÕES POR PERFIL                        */}
          {/* =============================================================== */}
          {showAll && (
            <section className="manual-page-break space-y-4">
              <div className="border-b-2 border-indigo-600 pb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Seção 2</span>
                <h2 className="text-xl font-black text-slate-900">
                  Matriz Comparativa de Permissões por Perfil
                </h2>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2.5 px-3 font-extrabold">Funcionalidade / Módulo</th>
                      <th className="py-2.5 px-2 text-center font-bold">Professor</th>
                      <th className="py-2.5 px-2 text-center font-bold">AOE / Portaria</th>
                      <th className="py-2.5 px-2 text-center font-bold">Gestão / PAAC</th>
                      <th className="py-2.5 px-2 text-center font-bold">Admin Escola</th>
                      <th className="py-2.5 px-2 text-center font-bold">Master Global</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {permissionMatrix.map((row, idx) => (
                      <tr key={row.feature} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                        <td className="py-2 px-3 font-semibold text-slate-800">{row.feature}</td>
                        <td className="py-2 px-2 text-center">{badgeCell(row.prof)}</td>
                        <td className="py-2 px-2 text-center">{badgeCell(row.aoe)}</td>
                        <td className="py-2 px-2 text-center">{badgeCell(row.gestao)}</td>
                        <td className="py-2 px-2 text-center">{badgeCell(row.admin)}</td>
                        <td className="py-2 px-2 text-center">{badgeCell(row.master)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* =============================================================== */}
          {/* SEÇÃO 3: GUIAS DETALHADOS POR PERFIL                            */}
          {/* =============================================================== */}
          <section className="space-y-6">
            <div className="border-b-2 border-indigo-600 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Seção 3</span>
              <h2 className="text-xl font-black text-slate-900">
                Manual Operacional Detalhado por Perfil
              </h2>
            </div>

            {/* 3.1 PROFESSOR */}
            {showProfessor && (
              <div className="manual-avoid-break rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-emerald-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Perfil 1</span>
                      <h3 className="text-base font-black text-slate-900">Professor(a) Regente</h3>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-emerald-100 text-emerald-900 px-3 py-1 rounded-full">
                    6 Cards na Tela Inicial • LGPD Protegida
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-indigo-800">1. Lançamento de Frequência &amp; Ausências</p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600">
                      <li>Clique no card <strong>Lançamento de Frequência &amp; Ausências</strong>.</li>
                      <li>Selecione a <strong>Turma</strong> e a <strong>Data</strong> da aula.</li>
                      <li>Marque o status de cada aluno: <em>Presente</em>, <em>Falta Injustificada</em>, <em>Falta Justificada</em> (informe duração em dias se houver), <em>Atestado Médico</em> (não contabiliza ausência) ou <em>Atraso</em>.</li>
                      <li>Clique em <strong>Salvar Chamada</strong>. O sistema aciona automaticamente os gatilhos de Busca Ativa para a Gestão.</li>
                    </ol>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-amber-800">2. Ocorrências Escolares</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li><strong>Nova Ocorrência:</strong> escolha data, aula, turma, estudante, tipo de ocorrência, medida tomada e se precisa de auxílio da gestão. Você pode usar o botão <strong>Formatar Relato com IA</strong> para melhorar a redação pedagógica.</li>
                      <li><strong>Meus Registros:</strong> edite ocorrências lançadas por você.</li>
                      <li><strong>Minhas Devolutivas:</strong> leia o retorno/mediação registrada pela Coordenação.</li>
                      <li><strong>Meus Alunos Tutorados:</strong> acompanhe ocorrências e assiduidade dos estudantes sob sua tutoria.</li>
                    </ul>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-sky-800">3. Agendamento de Equipamentos (Tablets / Notebooks)</p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600">
                      <li>Abra o card <strong>Agendamento de Equipamentos</strong> e navegue pela semana desejada.</li>
                      <li>Escolha o <strong>Tipo de Equipamento</strong> (ex.: Tablet, Notebook) e clique no horário/aula livre.</li>
                      <li>Informe a <strong>Turma</strong> e a <strong>Quantidade</strong> desejada.</li>
                      <li><strong>Trava de Plataforma Digital:</strong> horários vinculados a aulas com plataformas obrigatórias priorizam o professor/turma daquela grade.</li>
                      <li>Você pode cancelar suas próprias reservas clicando sobre o agendamento.</li>
                    </ol>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-violet-800">4. Grade Curricular, Calendário &amp; Meu Horário Multiplica</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li><strong>Grade Curricular &amp; Calendário:</strong> consulte seus horários por turma/dia, ATPCA, Momento de Estudo e feriados/bimestres.</li>
                      <li><strong>Meu Horário Multiplica:</strong> clique neste card para informar ou atualizar o dia da semana e horário (relógio) do seu Multiplica, sincronizando automaticamente na grade da gestão.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 3.2 AOE / PORTARIA */}
            {showAOE && (
              <div className="manual-avoid-break rounded-2xl border-2 border-blue-200 bg-blue-50/30 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-blue-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                      <DoorOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">Perfil 2</span>
                      <h3 className="text-base font-black text-slate-900">AOE — Agente de Organização Escolar (Secretaria &amp; Portaria)</h3>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-blue-100 text-blue-900 px-3 py-1 rounded-full">
                    5 Cards Operacionais • Controle de Fluxo Escolar
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-blue-800">1. Controle de Portaria (Entradas &amp; Saídas)</p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600">
                      <li>Clique em <strong>Controle de Portaria</strong>.</li>
                      <li>Selecione o tipo de registro: <strong>Entrada Tardia</strong> (aluno chegou atrasado) ou <strong>Saída Antecipada</strong>.</li>
                      <li>Busque o estudante, informe o horário, aula/intervalo, motivo e o nome/telefone do responsável autorizador.</li>
                      <li>Também permite lançamentos retroativos quando necessário. Tudo fica disponível instantaneamente para a Gestão nos relatórios.</li>
                    </ol>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-indigo-800">2. Consulta de Frequência &amp; Relação de Turmas</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li><strong>Consulta de Frequência:</strong> confira em tempo real quais alunos estão presentes ou ausentes no dia para averiguação no pátio.</li>
                      <li><strong>Relação de Turmas &amp; Salas:</strong> localize rapidamente em qual sala/turma cada estudante está matriculado para atendimento na secretaria.</li>
                    </ul>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-sky-800">3. Grade de Equipamentos (Apoio de Entrega)</p>
                    <p className="text-slate-600 leading-relaxed">
                      Consulte a grade do dia para saber qual professor reservou tablets/notebooks em cada aula, a quantidade solicitada e a condição dos equipamentos (<strong>1. Em Uso</strong>, <strong>2. Quebrado</strong>, <strong>3. Em Manutenção</strong>) antes da entrega e no recolhimento.
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-teal-800">4. Grade Curricular &amp; Roteiro AOE</p>
                    <p className="text-slate-600 leading-relaxed">
                      Acesse a <strong>Prancheta de Trocas de Sala</strong>, o <strong>Roteiro Dinâmico AOE</strong> (quem está em cada sala a cada aula), substituições do dia e o calendário escolar oficial.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3.3 GESTÃO / PAAC */}
            {showGestao && (
              <div className="manual-avoid-break rounded-2xl border-2 border-indigo-200 bg-indigo-50/30 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-indigo-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Perfil 3</span>
                      <h3 className="text-base font-black text-slate-900">Coordenação Pedagógica / Gestão Escolar / PAAC</h3>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-indigo-100 text-indigo-900 px-3 py-1 rounded-full">
                    Gestão Pedagógica Completa • Busca Ativa &amp; Mediação
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-rose-800">1. Busca Ativa Escolar (SEDUC 39/2023)</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li><strong>Alertas &amp; WhatsApp:</strong> visualize alunos com 1 falta, 2 ou 3 faltas consecutivas, frequência abaixo de 75% ou reincidência. Envie mensagens prontas via WhatsApp (individual ou em lote) com registro de envio.</li>
                      <li><strong>Gestão de Casos Críticos:</strong> abra casos de intervenção manual ou automaticamente, acompanhe estágios (contato, reunião, encaminhamento FICAI/Conselho Tutelar) e gere planos pedagógicos estruturados.</li>
                    </ul>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-amber-800">2. Ocorrências, Mediação &amp; Tratativas</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>Acompanhe o selo de <strong>Pendentes</strong> na tela inicial.</li>
                      <li>Abra cada ocorrência, registre o parecer/mediação da gestão (que aparece automaticamente como <em>Devolutiva</em> para o professor) e altere o status para <strong>Concluída</strong>.</li>
                      <li>Registre <strong>Tratativas com a Família</strong>, imprima termos/relatórios e consulte a auditoria de horário de preenchimento.</li>
                    </ul>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-teal-800">3. Grade Curricular, Gerador de Horários &amp; Calendário</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>Configure <strong>Matriz Curricular</strong>, <strong>Equipe Docente</strong> (incluindo Multiplica) e <strong>Critérios Anuais</strong>.</li>
                      <li>Use a distribuição automática (NOTE / EMA / Base), faça ajustes manuais com detecção de conflitos em tempo real e gerencie <strong>Substituições</strong> diárias.</li>
                      <li>Cadastre bimestres, feriados, recessos, conselhos de classe e sábados letivos no <strong>Calendário Letivo</strong>.</li>
                    </ul>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-emerald-800">4. Dossiê, Turmas, Relatórios &amp; Backup</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>Use a <strong>Busca Rápida</strong> no topo da Tela Inicial para abrir o dossiê completo de qualquer aluno.</li>
                      <li>Cadastre novas turmas/estudantes (individual ou em lote), registre transferências ou exclua cadastros.</li>
                      <li>Gere o <strong>Relatório de Acompanhamento</strong> (botão laranja no topo) e os <strong>Relatórios Pedagógicos Unificados</strong>.</li>
                      <li>Use <strong>Backup Offline</strong> (verde) para salvar cópia JSON semanal e <strong>Restaurar Backup</strong> (amarelo) quando necessário.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 3.4 ADMINISTRADOR DA ESCOLA */}
            {showAdmin && (
              <div className="manual-avoid-break rounded-2xl border-2 border-purple-200 bg-purple-50/30 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-purple-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-700">Perfil 4</span>
                      <h3 className="text-base font-black text-slate-900">Administrador da Unidade Escolar</h3>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-purple-100 text-purple-900 px-3 py-1 rounded-full">
                    Acesso Total à Unidade + Gerenciador Central
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-purple-800">1. Gerenciador Central do Sistema</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li><strong>Operadores &amp; Senhas PIN:</strong> crie contas para professores, AOEs e coordenação, defina ou redefina PINs de 4 dígitos e ative/desative acessos.</li>
                      <li><strong>Configurações de Ocorrências:</strong> personalize a lista de tipos de ocorrências, medidas pedagógicas, aulas e horários de início/término.</li>
                      <li><strong>Inventário de Equipamentos:</strong> cadastre novos tablets/notebooks, patrimônio e altere a condição operacional.</li>
                    </ul>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-1.5">
                    <p className="font-extrabold text-indigo-800">2. Governança, Nuvem Firebase &amp; Backups</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>Acesso completo a todos os módulos da Gestão (Diário, Portaria, Busca Ativa, Ocorrências, Equipamentos, Grade e Relatórios).</li>
                      <li><strong>Backup Offline (JSON):</strong> exporte semanalmente todo o estado da unidade escolar para arquivo local no computador.</li>
                      <li><strong>Restaurar Backup:</strong> importe arquivos JSON salvos para restaurar registros diretamente na nuvem Firebase com prévia de confirmação.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 3.5 MASTER GLOBAL */}
            {showMaster && (
              <div className="manual-avoid-break rounded-2xl border-2 border-amber-300 bg-amber-50/40 p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-amber-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">Perfil 5</span>
                      <h3 className="text-base font-black text-slate-900">Painel Master Global (Proprietário / Multi-Escolas)</h3>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                    Administração Multi-Unidades (SaaS)
                  </span>
                </div>
                <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-700 bg-white rounded-xl p-4 border border-amber-200">
                  <li><strong>Central Master:</strong> crie, edite ou desative Unidades Escolares com isolamento total de banco de dados (CIE/INEP, rede, município, direção).</li>
                  <li><strong>Controle Modular por Escola:</strong> habilite ou desabilite individualmente os módulos (Diário, Portaria, Busca Ativa, Ocorrências, Equipamentos, Grade/Calendário e Relatórios) para cada escola cadastrada.</li>
                  <li><strong>Modo Auxílio Master (&quot;Trocar Escola&quot;):</strong> alterne instantaneamente para qualquer unidade escolar pelo botão superior para prestar suporte técnico e administrativo sem misturar dados.</li>
                </ul>
              </div>
            )}
          </section>

          {/* =============================================================== */}
          {/* SEÇÃO 4: PRINTS ILUSTRADOS DOS MÓDULOS                          */}
          {/* =============================================================== */}
          <section className="manual-page-break space-y-5">
            <div className="border-b-2 border-indigo-600 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Seção 4</span>
              <h2 className="text-xl font-black text-slate-900">
                Guia Visual dos Módulos (Telas Ilustradas &amp; Passo a Passo)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 print:hidden">
                Cada tela já vem ilustrada fielmente ao sistema. Caso deseje, clique em &quot;Anexar print real&quot; em qualquer tela para incluir uma captura real do seu computador no PDF.
              </p>
            </div>

            {/* TELA 3: DIÁRIO & PORTARIA */}
            {(showProfessor || showAOE || showGestao || showAdmin) && (
              <ScreenFigure
                screenId="tela_diario_portaria"
                number="3"
                title="Diário & Portaria (Chamada por Turma, Diário do Professor e Entradas/Saídas)"
                subtitle="Controle diário de frequência, justificativas, atestados e movimentação de portaria"
                customImage={customScreens['tela_diario_portaria']}
                onUploadImage={handleUploadScreen}
                onResetImage={handleResetScreen}
                callouts={[
                  { num: '1', label: 'Seletor de Turma e Data', desc: 'Escolha a sala e o dia letivo antes de lançar presenças ou faltas.' },
                  { num: '2', label: 'Botões de Status do Aluno', desc: 'Presente (P), Falta (F), Justificada (FJ), Atestado (AM - não soma falta) e Atraso.' },
                  { num: '3', label: 'Registro de Portaria (AOE)', desc: 'Entrada Tardia ou Saída Antecipada com horário, motivo e responsável.' },
                  { num: '4', label: 'Salvar & Sincronizar', desc: 'Grava imediatamente no Firebase e atualiza o percentual de frequência.' },
                ]}
              >
                <div className="p-3.5 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-extrabold text-indigo-700">Chamada • 9º Ano A • Hoje</span>
                      <PinBadge n="1" />
                    </div>
                    {[
                      { name: 'Ana Clara Souza', st: 'Presente', cls: 'bg-emerald-100 text-emerald-800' },
                      { name: 'Bruno Henrique Lima', st: 'Falta Injust.', cls: 'bg-rose-100 text-rose-800' },
                      { name: 'Carla Eduarda Silva', st: 'Atestado (2d)', cls: 'bg-sky-100 text-sky-800' },
                    ].map((al, i) => (
                      <div key={al.name} className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="font-semibold text-slate-700">{al.name}</span>
                        <div className="flex items-center gap-1">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${al.cls}`}>{al.st}</span>
                          {i === 1 && <PinBadge n="2" />}
                        </div>
                      </div>
                    ))}
                    <div className="pt-1 flex justify-end items-center gap-1.5">
                      <span className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-bold">Salvar Chamada</span>
                      <PinBadge n="4" />
                    </div>
                  </div>
                  <div className="bg-white border border-blue-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-extrabold text-blue-700">Controle de Portaria (AOE)</span>
                      <PinBadge n="3" />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-center font-bold text-amber-900">
                        Entrada Tardia
                      </div>
                      <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-center font-bold text-blue-900">
                        Saída Antecipada
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 text-[9px] text-slate-600 space-y-0.5">
                      <p><strong>Estudante:</strong> Lucas Ferreira (8ºB) • 07:25 (1ª Aula)</p>
                      <p><strong>Motivo:</strong> Consulta odontológica • <strong>Resp.:</strong> Mãe (autorizado)</p>
                    </div>
                  </div>
                </div>
              </ScreenFigure>
            )}

            {/* TELA 4: BUSCA ATIVA */}
            {(showGestao || showAdmin) && (
              <ScreenFigure
                screenId="tela_busca_ativa"
                number="4"
                title="Busca Ativa Escolar (Alertas WhatsApp & Casos Críticos SEDUC 39/2023)"
                subtitle="Prevenção à evasão com alertas automáticos e gestão de intervenções"
                customImage={customScreens['tela_busca_ativa']}
                onUploadImage={handleUploadScreen}
                onResetImage={handleResetScreen}
                callouts={[
                  { num: '1', label: 'Gatilhos Automáticos', desc: 'Identifica alunos com faltas consecutivas ou frequência < 75%.' },
                  { num: '2', label: 'Envio via WhatsApp', desc: 'Disparo individual ou em lote com texto pronto para o responsável.' },
                  { num: '3', label: 'Abertura de Caso Crítico', desc: 'Cria plano de ação pedagógico e registra contatos/reuniões.' },
                  { num: '4', label: 'Encaminhamento FICAI', desc: 'Histórico documentado para Conselho Tutelar quando persistir infrequência.' },
                ]}
              >
                <div className="p-3.5 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                  <div className="bg-white border border-rose-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-rose-700">Ausências &amp; Alertas WhatsApp</span>
                      <PinBadge n="1" />
                    </div>
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">Pedro Augusto (7ºA) • 3 faltas seguidas</p>
                        <p className="text-[9px] text-rose-700">Gatilho: Resolução SEDUC 39/2023</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-1 rounded bg-emerald-600 text-white font-bold text-[9px]">WhatsApp</span>
                        <PinBadge n="2" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-indigo-800">Casos Críticos &amp; Intervenções</span>
                      <PinBadge n="3" />
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">Estágio: Pactuação / FICAI</span>
                        <PinBadge n="4" />
                      </div>
                      <p className="text-[9px] text-slate-600">Plano de ação ativo • Log de ligações e ata de reunião registrados.</p>
                    </div>
                  </div>
                </div>
              </ScreenFigure>
            )}

            {/* TELA 5: OCORRÊNCIAS & MEDIAÇÃO */}
            {(showProfessor || showGestao || showAdmin) && (
              <ScreenFigure
                screenId="tela_ocorrencias"
                number="5"
                title="Ocorrências & Mediação Escolar"
                subtitle="Fluxo completo: Registro do Professor → Triagem da Gestão → Devolutiva & Tratativa Familiar"
                customImage={customScreens['tela_ocorrencias']}
                onUploadImage={handleUploadScreen}
                onResetImage={handleResetScreen}
                callouts={[
                  { num: '1', label: 'Abas do Módulo', desc: 'Nova Ocorrência, Pendentes/Triagem, Concluídas, Devolutivas, Tutorados e Relatórios.' },
                  { num: '2', label: 'Formulário & IA', desc: 'Preencha turma, aluno, aula, ocorrência e use Formatar com IA se desejar.' },
                  { num: '3', label: 'Mediação da Gestão', desc: 'Coordenação registra parecer e devolutiva visível ao professor autor.' },
                  { num: '4', label: 'Tratativa com Família', desc: 'Registra contatos, reuniões e permite impressão oficial da ocorrência.' },
                ]}
              >
                <div className="p-3.5 bg-slate-50 space-y-2.5 text-[10px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold">+ Nova Ocorrência</span>
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-bold text-slate-700">Pendentes (Triagem)</span>
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-bold text-slate-700">Devolutivas</span>
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-bold text-slate-700">Tutorados</span>
                    <PinBadge n="1" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="bg-white border border-amber-200 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-slate-900">Registro Docente</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[9px]">
                          <Sparkles className="w-3 h-3" /> Formatar com IA <PinBadge n="2" />
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-600">Turma • Estudante • Aula • Ocorrência Principal • Medida • Descrição detalhada.</p>
                    </div>
                    <div className="bg-white border border-emerald-200 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-emerald-800">Parecer da Gestão &amp; Família</span>
                        <div className="flex items-center gap-1"><PinBadge n="3" /><PinBadge n="4" /></div>
                      </div>
                      <p className="text-[9px] text-slate-600">Mediação registrada pela Coordenação → Devolutiva automática ao professor e histórico familiar.</p>
                    </div>
                  </div>
                </div>
              </ScreenFigure>
            )}

            {/* TELA 6: AGENDAMENTO DE EQUIPAMENTOS */}
            {(showProfessor || showAOE || showGestao || showAdmin) && (
              <ScreenFigure
                screenId="tela_tablets"
                number="6"
                title="Agendamento de Equipamentos (Tablets, Notebooks & Inventário)"
                subtitle="Grade semanal inteligente com trava de plataformas digitais e controle de condição"
                customImage={customScreens['tela_tablets']}
                onUploadImage={handleUploadScreen}
                onResetImage={handleResetScreen}
                callouts={[
                  { num: '1', label: 'Abas Grade / Inventário', desc: 'Alterna entre a Grade Semanal de Reservas e o Cadastro de Equipamentos.' },
                  { num: '2', label: 'Seletor de Semana e Tipo', desc: 'Avance/volte semanas e filtre por tipo (Tablet, Notebook, Projetor, etc.).' },
                  { num: '3', label: 'Célula de Reserva', desc: 'Mostra professor, turma, quantidade reservada e saldo disponível naquela aula.' },
                  { num: '4', label: 'Condição do Equipamento', desc: '1. Em Uso (disponível), 2. Quebrado ou 3. Em Manutenção (descontados do saldo).' },
                ]}
              >
                <div className="p-3.5 bg-slate-50 space-y-2 text-[10px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-lg bg-sky-600 text-white font-bold">Grade Semanal</span>
                      <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-bold text-slate-700">Inventário &amp; Condição</span>
                      <PinBadge n="1" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-semibold">◀ Semana Atual ▶</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Em Uso: 32</span>
                      <PinBadge n="2" />
                      <PinBadge n="4" />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="bg-slate-200 rounded p-1 font-bold text-slate-700">Aula</div>
                    <div className="bg-slate-200 rounded p-1 font-bold text-slate-700">Segunda</div>
                    <div className="bg-slate-200 rounded p-1 font-bold text-slate-700">Terça</div>
                    <div className="bg-slate-200 rounded p-1 font-bold text-slate-700">Quarta</div>
                    <div className="bg-white border border-slate-200 rounded p-1.5 font-bold">1ª Aula</div>
                    <div className="bg-sky-50 border border-sky-300 rounded p-1.5 text-left">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sky-900">9ºA • 20 un.</span>
                        <PinBadge n="3" />
                      </div>
                      <p className="text-[8px] text-sky-700">Prof. Carlos (Plataforma)</p>
                    </div>
                    <div className="bg-emerald-50/70 border border-dashed border-emerald-300 rounded p-1.5 text-emerald-700 font-semibold">
                      + Reservar (32 livres)
                    </div>
                    <div className="bg-sky-50 border border-sky-300 rounded p-1.5 text-left">
                      <span className="font-bold text-sky-900">7ºB • 15 un.</span>
                      <p className="text-[8px] text-sky-700">Profª. Ana (17 livres)</p>
                    </div>
                  </div>
                </div>
              </ScreenFigure>
            )}

            {/* TELA 7: GRADE CURRICULAR & CALENDÁRIO */}
            {(showProfessor || showAOE || showGestao || showAdmin) && (
              <ScreenFigure
                screenId="tela_grade_calendario"
                number="7"
                title="Grade Curricular, Gerador de Horários, Multiplica & Calendário Letivo"
                subtitle="Organização completa dos horários por turma, professor, substituições e ano letivo"
                customImage={customScreens['tela_grade_calendario']}
                onUploadImage={handleUploadScreen}
                onResetImage={handleResetScreen}
                callouts={[
                  { num: '1', label: 'Abas de Planejamento', desc: 'Grade Geral, Por Professor, Matriz Curricular, Equipe, Critérios, Auditoria, Painéis, Substituições e Calendário.' },
                  { num: '2', label: 'Gerador & Ajuste Manual', desc: 'Distribuição automática (NOTE/EMA/Base) com detecção de choques de horário.' },
                  { num: '3', label: 'Horário Multiplica', desc: 'Professores podem atualizar seu dia/horário relógio diretamente da Tela Inicial.' },
                  { num: '4', label: 'Calendário & Roteiro AOE', desc: 'Bimestres, feriados, sábados letivos e visão diária das salas para a equipe AOE.' },
                ]}
              >
                <div className="p-3.5 bg-slate-50 space-y-2 text-[10px]">
                  <div className="flex flex-wrap items-center gap-1">
                    {['Grade', 'Por Professor', 'Matriz', 'Equipe', 'Critérios', 'Auditoria', 'Substituições', 'Calendário'].map((t, idx) => (
                      <span
                        key={t}
                        className={`px-2 py-0.5 rounded font-bold text-[9px] ${
                          idx === 0 ? 'bg-teal-600 text-white' : 'bg-white border border-slate-300 text-slate-700'
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                    <PinBadge n="1" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-white border border-teal-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-extrabold text-teal-800">Grade sem Conflitos</span>
                        <PinBadge n="2" />
                      </div>
                      <p className="text-[9px] text-slate-600">Alocação por turma, disciplina, professor e marcação de plataformas digitais.</p>
                    </div>
                    <div className="bg-white border border-violet-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-extrabold text-violet-800 flex items-center gap-1"><Clock className="w-3 h-3" /> Multiplica</span>
                        <PinBadge n="3" />
                      </div>
                      <p className="text-[9px] text-slate-600">Assimilação automática do horário Multiplica informado pelo docente.</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-extrabold text-slate-800">Calendário &amp; AOE</span>
                        <PinBadge n="4" />
                      </div>
                      <p className="text-[9px] text-slate-600">4 Bimestres, feriados, conselhos de classe e prancheta de trocas.</p>
                    </div>
                  </div>
                </div>
              </ScreenFigure>
            )}

            {/* TELA 8: RELATÓRIOS, BACKUP OFFLINE & RESTAURAÇÃO */}
            {(showGestao || showAdmin || showMaster) && (
              <ScreenFigure
                screenId="tela_backup_relatorios"
                number="8"
                title="Relatórios Oficiais, Backup de Segurança Offline & Restauração na Nuvem"
                subtitle="Prestação de contas pedagógica e proteção completa contra falhas de internet/nuvem"
                customImage={customScreens['tela_backup_relatorios']}
                onUploadImage={handleUploadScreen}
                onResetImage={handleResetScreen}
                callouts={[
                  { num: '1', label: 'Relatório de Acompanhamento', desc: 'Documento oficial consolidado (frequência, busca ativa, ocorrências e assinaturas).' },
                  { num: '2', label: 'Backup Offline (JSON)', desc: 'Baixa 1 arquivo completo com turmas, alunos, chamadas, intervenções, ocorrências e equipamentos.' },
                  { num: '3', label: 'Restaurar Backup', desc: 'Carrega arquivo JSON (ou texto colado), mostra prévia com datas e grava de volta no Firebase.' },
                  { num: '4', label: 'Gerenciador Central', desc: 'Cadastro de operadores/PINs, turmas, alunos e configurações gerais da escola.' },
                ]}
              >
                <div className="p-3.5 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[10px]">
                  <div className="bg-white border border-amber-200 rounded-xl p-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-amber-800 flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5" /> Relatórios &amp; Prestação de Contas</p>
                      <p className="text-[9px] text-slate-600 mt-1">Exportação mensal, dossiê individual do estudante e relatório oficial de acompanhamento com campo de assinaturas.</p>
                    </div>
                    <PinBadge n="1" />
                  </div>
                  <div className="bg-white border border-emerald-200 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-emerald-900">Segurança de Dados (Nuvem + Local)</span>
                      <div className="flex items-center gap-1"><PinBadge n="2" /><PinBadge n="3" /><PinBadge n="4" /></div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[9px]">
                        <Download className="w-3 h-3" /> Backup Offline (.json)
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 font-bold text-[9px]">
                        <Upload className="w-3 h-3" /> Restaurar Backup
                      </span>
                    </div>
                  </div>
                </div>
              </ScreenFigure>
            )}
          </section>

          {/* =============================================================== */}
          {/* SEÇÃO 5: BOAS PRÁTICAS & SOLUÇÃO DE DÚVIDAS (FAQ)               */}
          {/* =============================================================== */}
          <section className="manual-avoid-break space-y-4">
            <div className="border-b-2 border-indigo-600 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Seção 5</span>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                <span>Boas Práticas &amp; Perguntas Frequentes (FAQ)</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Os dados no celular atualizam sozinhos?</span>
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Sim. Ao abrir o site, fazer login ou retornar para a aba do navegador no celular, o EduScope 360 busca automaticamente as últimas atualizações do Firebase. Se desejar forçar atualização imediata a qualquer momento, toque no botão <strong>Sincronizar</strong> no topo.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Esqueci minha senha PIN de 4 dígitos. O que fazer?</span>
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Solicite ao <strong>Administrador da Unidade Escolar</strong> (ou Direção/Coordenação com perfil Admin). Ele pode consultar ou alterar seu PIN em poucos segundos pelo <em>Gerenciador Central → Operadores &amp; Senhas PIN</em>.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Por que não consigo reservar tablets em uma aula específica?</span>
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Verifique se o saldo de equipamentos em condição <strong>Em Uso</strong> já foi totalmente reservado naquela aula ou se existe <strong>Trava de Plataforma Digital</strong> cadastrada na Grade Horária para outra turma naquele horário.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Qual a rotina recomendada de Backup para a Gestão?</span>
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Recomenda-se que a Coordenação ou Administração clique no botão verde <strong>Backup Offline</strong> toda sexta-feira e salve o arquivo <code className="bg-white px-1 rounded border border-slate-200">backup-eduscope360-*.json</code> em uma pasta segura no computador ou Google Drive da escola.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span><strong>EduScope 360</strong> • {schoolName}</span>
              <span>Manual Oficial do Usuário • Gerado em {todayFormatted}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
