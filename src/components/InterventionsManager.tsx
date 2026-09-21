import React, { useState } from 'react';
import {
  ShieldAlert,
  Home,
  PhoneCall,
  Users,
  CheckCircle2,
  FileBadge,
  Sparkles,
  Plus,
  ChevronRight,
  Clock,
  Calendar,
  AlertOctagon,
  Info,
  HelpCircle,
  HeartHandshake,
  Trash2,
  RefreshCw,
  Phone,
  Smartphone,
  AlertTriangle,
  Scale,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { InterventionCase, InterventionStage } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { getStudentPhones } from '../utils/phoneUtils';

interface InterventionsManagerProps {
  cases: InterventionCase[];
  onAddAction: (
    caseId: string,
    action: { action: string; author: string; notes: string; result: string; advanceStageTo?: InterventionStage }
  ) => Promise<void>;
  onOpenStudentDetail: (studentId: string) => void;
  onGenerateAIPlan: (caseItem: InterventionCase) => Promise<void>;
  isGeneratingAI: boolean;
  aiPlanResult: { caseId: string; plan: any } | null;
  aiQuotaStatus?: any;
  onRefresh: () => void;
  onDeleteAllOpenCases: () => Promise<void>;
}

const STAGE_CONFIG: Record<
  InterventionStage,
  { label: string; color: string; badgeBg: string; badgeText: string; icon: React.ReactNode }
> = {
  alerta_inicial: {
    label: 'Alerta Inicial',
    color: 'border-amber-300',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    icon: <Clock className="w-4 h-4 text-amber-600" />,
  },
  contato_telefonico_whatsapp: {
    label: 'Contato Telefônico / WhatsApp',
    color: 'border-emerald-300',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    icon: <PhoneCall className="w-4 h-4 text-emerald-600" />,
  },
  reuniao_pais: {
    label: 'Reunião com Pais',
    color: 'border-indigo-300',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    icon: <Users className="w-4 h-4 text-indigo-600" />,
  },
  encaminhado_cras_conselho: {
    label: 'Conselho Tutelar / CRAS',
    color: 'border-rose-300',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    icon: <AlertOctagon className="w-4 h-4 text-rose-600" />,
  },
  reintegrado: {
    label: 'Reintegrado com Sucesso',
    color: 'border-emerald-300',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  },
  encerrado: {
    label: 'Caso Concluído',
    color: 'border-slate-300',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    icon: <FileBadge className="w-4 h-4 text-slate-600" />,
  },
};

export const InterventionsManager: React.FC<InterventionsManagerProps> = ({
  cases,
  onAddAction,
  onOpenStudentDetail,
  onGenerateAIPlan,
  isGeneratingAI,
  aiPlanResult,
  aiQuotaStatus,
  onRefresh,
  onDeleteAllOpenCases,
}) => {
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id || null);
  const [filterStage, setFilterStage] = useState<string>('todos');
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [isDeletingConfirmOpen, setIsDeletingConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // New action form state
  const [actionTitle, setActionTitle] = useState('Contato Telefônico / WhatsApp com Responsável');
  const [actionAuthor, setActionAuthor] = useState('Profª. Cláudia Valença (Orientadora Educacional)');
  const [actionNotes, setActionNotes] = useState('');
  const [actionResult, setActionResult] = useState('Família acolhida e informada; pactuado retorno imediato.');
  const [advanceToStage, setAdvanceToStage] = useState<InterventionStage | ''>('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const activeCases = cases.filter(c => c.stage !== 'reintegrado' && c.stage !== 'encerrado');
  const resolvedCases = cases.filter(c => c.stage === 'reintegrado' || c.stage === 'encerrado');

  const filteredCases = cases.filter(c => {
    if (filterStage === 'todos') return true;
    if (filterStage === 'ativos') return c.stage !== 'reintegrado' && c.stage !== 'encerrado';
    if (filterStage === 'resolvidos') return c.stage === 'reintegrado' || c.stage === 'encerrado';
    return c.stage === filterStage;
  });

  const selectedCase = cases.find(c => c.id === selectedCaseId) || filteredCases[0] || cases[0];

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;

    setSubmittingAction(true);
    try {
      await onAddAction(selectedCase.id, {
        action: actionTitle,
        author: actionAuthor,
        notes: actionNotes || 'Registro pedagógico adicionado.',
        result: actionResult,
        advanceStageTo: advanceToStage ? (advanceToStage as InterventionStage) : undefined,
      });
      setIsAddingAction(false);
      setActionNotes('');
      setAdvanceToStage('');
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 uppercase tracking-wider">
              <span>Gestão de Casos & Rede Intersetorial</span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h2 className="text-xl font-bold text-slate-900">
                Plataforma de Casos da Busca Ativa Escolar
              </h2>
              <InfoTooltip
                title="Gestão de Casos & Rede Intersetorial"
                content="Acompanhamento detalhado de contatos telefônicos, WhatsApp institucional, pactuação de compromissos com famílias e encaminhamentos formais ao CRAS e Conselho Tutelar."
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDeletingConfirmOpen(true)}
              className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
              title="Excluir casos em aberto"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRefresh}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
              title="Atualizar registros reais"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2 text-xs">
              <span className="text-emerald-700 font-medium">Reintegrados com Sucesso:</span>
              <span className="font-extrabold text-emerald-900 ml-1.5 text-sm">{resolvedCases.length}</span>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2 text-xs">
              <span className="text-rose-700 font-medium">Casos em Aberto:</span>
              <span className="font-extrabold text-rose-900 ml-1.5 text-sm">{activeCases.length}</span>
            </div>

            {/* Status da Cota Gratuita / Proteção de Custos */}
            {aiQuotaStatus && (
              <div
                className={`hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold ${
                  aiQuotaStatus.isBlockedUntilNextDay
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
                title={
                  aiQuotaStatus.isBlockedUntilNextDay
                    ? aiQuotaStatus.blockedReason || 'Cota excedida: IA bloqueada até amanhã às 00:00 (Custo R$ 0,00 garantido)'
                    : `Cota gratuita hoje: ${aiQuotaStatus.requestsToday}/${aiQuotaStatus.maxFreeRequestsPerDay} requisições. Proteção ativa de custo zero.`
                }
              >
                {aiQuotaStatus.isBlockedUntilNextDay ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>IA Bloqueada até 00:00 (Cota Excedida • Custo Zero)</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Cota Diária Gratuita: {aiQuotaStatus.requestsToday || 0}/{aiQuotaStatus.maxFreeRequestsPerDay || 50}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Modal */}
        {isDeletingConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-rose-200">
              <h3 className="text-base font-bold text-slate-900 text-center">Confirmar exclusão?</h3>
              <p className="text-xs text-slate-600 text-center mt-2">
                Você tem certeza que deseja excluir todos os {activeCases.length} casos em aberto? Esta ação é irreversível.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => setIsDeletingConfirmOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setIsDeleting(true);
                    await onDeleteAllOpenCases();
                    setIsDeleting(false);
                    setIsDeletingConfirmOpen(false);
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage Pills Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-5 pt-5 border-t border-slate-100">
          {(Object.keys(STAGE_CONFIG) as InterventionStage[]).slice(0, 6).map(stageKey => {
            const cfg = STAGE_CONFIG[stageKey];
            const count = cases.filter(c => c.stage === stageKey).length;
            return (
              <button
                key={stageKey}
                onClick={() => setFilterStage(stageKey)}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  filterStage === stageKey
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                    : 'border-slate-200 bg-slate-50 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="p-1 rounded-md bg-white border border-slate-200 shadow-2xs">
                    {cfg.icon}
                  </span>
                  <span className="text-xs font-bold text-slate-700">{count}</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-800 mt-1.5 line-clamp-1">
                  {cfg.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split View: Left List of Cases / Right Case Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Cases List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between shadow-xs">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Casos ({filteredCases.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterStage('todos')}
                className={`text-xs px-2 py-1 rounded font-semibold cursor-pointer ${
                  filterStage === 'todos' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterStage('ativos')}
                className={`text-xs px-2 py-1 rounded font-semibold cursor-pointer ${
                  filterStage === 'ativos' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Ativos
              </button>
              <button
                onClick={() => setFilterStage('resolvidos')}
                className={`text-xs px-2 py-1 rounded font-semibold cursor-pointer ${
                  filterStage === 'resolvidos' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Reintegrados
              </button>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {filteredCases.map(c => {
              const isSelected = c.id === selectedCase?.id;
              const stageCfg = STAGE_CONFIG[c.stage] || STAGE_CONFIG.alerta_inicial;

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCaseId(c.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{c.studentName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {c.className} • Responsável: {c.guardianName}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        c.priority === 'urgente_conselho'
                          ? 'bg-rose-100 text-rose-800'
                          : c.priority === 'alta'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {c.priority === 'urgente_conselho' ? 'Urgente Conselho' : `Prioridade ${c.priority}`}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md ${stageCfg.badgeBg} ${stageCfg.badgeText}`}
                    >
                      {stageCfg.icon}
                      <span>{stageCfg.label}</span>
                    </span>

                    <span className="text-[11px] text-slate-400">
                      Atualizado em {c.lastUpdatedAt}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Case Deep Dive */}
        <div className="lg:col-span-7">
          {selectedCase ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-6">
              {/* Header Details */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{selectedCase.studentName}</h3>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                      {selectedCase.className}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                    <span>Responsável: <strong className="text-slate-700">{selectedCase.guardianName}</strong></span>
                    <span>•</span>
                    {(() => {
                      const phones = getStudentPhones(selectedCase.guardianPhone);
                      if (phones.length === 0) {
                        return <span>Tel: <strong className="text-slate-700">{selectedCase.guardianPhone || 'Não informado'}</strong></span>;
                      }
                      return (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-slate-500">Tel:</span>
                          {phones.map((p, idx) => (
                            <a
                              key={idx}
                              href={p.whatsAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded border border-emerald-200 transition-colors"
                              title={`Abrir WhatsApp no contato: ${p.formatted}`}
                            >
                              <Smartphone className="w-2.5 h-2.5 text-emerald-600" />
                              <span>{p.formatted}</span>
                            </a>
                          ))}
                        </div>
                      );
                    })()}
                    <span>•</span>
                    <span>Orientador(a): <strong className="text-slate-700">{selectedCase.assignedPedagogue}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onGenerateAIPlan(selectedCase)}
                    disabled={isGeneratingAI}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      aiQuotaStatus?.isBlockedUntilNextDay
                        ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                    }`}
                    title={
                      aiQuotaStatus?.isBlockedUntilNextDay
                        ? 'Cota diária gratuita atingida. O plano será gerado instantaneamente pelo Motor Pedagógico Local (SEDUC 39/2023) sem custos.'
                        : 'Gerar diagnóstico e orientações pedagógicas com fundamentação legal'
                    }
                  >
                    {aiQuotaStatus?.isBlockedUntilNextDay ? (
                      <Lock className="w-3.5 h-3.5 text-amber-700" />
                    ) : (
                      <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                    )}
                    <span>
                      {isGeneratingAI
                        ? 'Analisando...'
                        : aiQuotaStatus?.isBlockedUntilNextDay
                        ? 'Assistente Local (SEDUC 39/2023)'
                        : 'Assistente IA (Plano Busca Ativa)'}
                    </span>
                  </button>

                  <button
                    onClick={() => onOpenStudentDetail(selectedCase.studentId)}
                    className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Ficha Completa
                  </button>
                </div>
              </div>

              {/* Stage Progression Bar */}
              <div>
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Fase da Busca Ativa:
                </div>
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="p-1.5 rounded-md bg-white border border-slate-200 text-indigo-600">
                    {STAGE_CONFIG[selectedCase.stage]?.icon}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {STAGE_CONFIG[selectedCase.stage]?.label}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Motivo instaurador: {selectedCase.reason}
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Plan Result Banner if generated */}
              {aiPlanResult && aiPlanResult.caseId === selectedCase.id && (
                <div className="bg-linear-to-r from-indigo-50/70 via-purple-50/50 to-indigo-50/70 border border-indigo-200 rounded-xl p-4 sm:p-5 text-xs text-slate-800 space-y-3.5 shadow-xs">
                  {/* Warning banner when quota exceeded / blocked */}
                  {(aiPlanResult.plan.quotaStatus?.quotaExceeded || aiPlanResult.plan.quotaStatus?.isBlocked) && (
                    <div className="p-3.5 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl text-amber-950 text-xs space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Alerta: Limite da Cota Gratuita Diária Atingido</span>
                      </div>
                      <p className="text-amber-800 leading-relaxed font-medium">
                        {aiPlanResult.plan.quotaStatus?.reason ||
                          'A cota gratuita de requisições foi atingida. Para proteger você de qualquer cobrança na sua chave de API, a função de IA externa foi bloqueada até as 00:00 de amanhã.'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-semibold text-amber-900">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded border border-amber-300">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Modo de Proteção Ativo • Custo Zero Garantido</span>
                        </span>
                        <span>As orientações abaixo foram geradas pelo Motor Pedagógico Local oficial.</span>
                      </div>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                    <div className="flex items-center gap-2 font-bold text-indigo-950 text-sm">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Diagnóstico Pedagógico & Recomendações de Busca Ativa</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full font-semibold bg-white border border-indigo-200 text-indigo-800">
                        {aiPlanResult.plan.quotaStatus?.source === 'gemini_ai'
                          ? 'Gerado por IA (Gemini Flash)'
                          : 'Motor Pedagógico Local (SEDUC 39/2023)'}
                      </span>
                    </div>
                  </div>

                  {/* Fundamentação Legal Badges */}
                  {aiPlanResult.plan.fundamentacaoLegal && (
                    <div className="bg-white/80 border border-indigo-100 rounded-lg p-2.5 space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-indigo-700" />
                        <span>Fundamentação Legal Aplicada (Rede Estadual de SP):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiPlanResult.plan.fundamentacaoLegal.map((fund: string, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-900 border border-indigo-200"
                          >
                            {fund}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Diagnóstico */}
                  <div>
                    <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-1">
                      Diagnóstico da Situação:
                    </div>
                    <p className="text-slate-800 leading-relaxed font-medium bg-white/60 p-3 rounded-lg border border-indigo-100/60">
                      {aiPlanResult.plan.diagnostico}
                    </p>
                  </div>

                  {/* Recomendações */}
                  <div>
                    <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-1">
                      Ações Recomendadas pela Rede:
                    </div>
                    <ul className="space-y-1.5">
                      {aiPlanResult.plan.recomendacoes?.map((rec: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-slate-800 bg-white/60 p-2 rounded-md border border-indigo-50">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Mensagem sugerida */}
                  {aiPlanResult.plan.mensagemSugerida && (
                    <div className="p-3 bg-white rounded-xl border border-indigo-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <strong className="text-indigo-950 font-bold text-xs flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sugestão de Mensagem de Acolhimento aos Pais (WhatsApp):</span>
                        </strong>
                        <button
                          type="button"
                          onClick={() => {
                            if (aiPlanResult.plan.mensagemSugerida) {
                              navigator.clipboard.writeText(aiPlanResult.plan.mensagemSugerida);
                              setCopiedMessage(true);
                              setTimeout(() => setCopiedMessage(false), 2500);
                            }
                          }}
                          className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold border border-indigo-200 transition-colors cursor-pointer"
                        >
                          {copiedMessage ? 'Copiado!' : 'Copiar Mensagem'}
                        </button>
                      </div>
                      <p className="text-slate-800 italic leading-relaxed text-xs">
                        "{aiPlanResult.plan.mensagemSugerida}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Action Plan Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Plano de Ação Individualizado
                  </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-2 text-xs">
                  {selectedCase.actionPlan.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action History Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Histórico de Intervenções & Visitas ({selectedCase.actionLog.length})
                  </span>
                  <button
                    onClick={() => setIsAddingAction(!isAddingAction)}
                    className="text-xs font-bold px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Registrar Intervenção</span>
                  </button>
                </div>

                {/* Form to Add Action */}
                {isAddingAction && (
                  <form
                    onSubmit={handleSaveAction}
                    className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 mb-4 space-y-3 text-xs"
                  >
                    <div className="font-bold text-indigo-900 text-sm">
                      Novo Registro de Intervenção Pedagógica
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Tipo de Ação Realizada:</label>
                        <select
                          value={actionTitle}
                          onChange={e => setActionTitle(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded p-1.5 font-medium"
                        >
                          <option value="Contato Telefônico / WhatsApp com Responsável">Contato Telefônico / WhatsApp com Responsável</option>
                          <option value="Envio de Mensagem Direta via WhatsApp Escolar">Envio de Mensagem Direta via WhatsApp Escolar</option>
                          <option value="Reunião Presencial na Escola">Reunião Presencial na Escola</option>
                          <option value="Encaminhamento ao Conselho Tutelar (FICAI)">Encaminhamento ao Conselho Tutelar (FICAI)</option>
                          <option value="Acionamento do CRAS / Assistência Social">Acionamento do CRAS / Assistência Social</option>
                          <option value="Confirmação de Retorno Escolar">Confirmação de Retorno Escolar</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Profissional Responsável:</label>
                        <input
                          type="text"
                          value={actionAuthor}
                          onChange={e => setActionAuthor(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded p-1.5"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Anotações / Relato do Atendimento:</label>
                      <textarea
                        rows={2}
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        placeholder="Descreva o contato com a família, justificativas apresentadas e acordos estabelecidos..."
                        className="w-full bg-white border border-slate-300 rounded p-2 text-xs"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Resultado Imediato:</label>
                        <input
                          type="text"
                          value={actionResult}
                          onChange={e => setActionResult(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded p-1.5"
                          required
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Avançar Caso para a Fase:</label>
                        <select
                          value={advanceToStage}
                          onChange={e => setAdvanceToStage(e.target.value as any)}
                          className="w-full bg-white border border-slate-300 rounded p-1.5 font-medium"
                        >
                          <option value="">Manter Fase Atual ({STAGE_CONFIG[selectedCase.stage]?.label})</option>
                          <option value="contato_telefonico_whatsapp">Contato Telefônico / WhatsApp</option>
                          <option value="reuniao_pais">Reunião com Pais</option>
                          <option value="encaminhado_cras_conselho">Encaminhado CRAS / Conselho Tutelar</option>
                          <option value="reintegrado">Reintegrado com Sucesso (Retornou às Aulas!)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingAction(false)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded font-semibold text-slate-700 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={submittingAction}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded font-bold text-white cursor-pointer"
                      >
                        {submittingAction ? 'Salvando...' : 'Salvar Intervenção'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Log timeline */}
                <div className="space-y-3">
                  {selectedCase.actionLog.map(item => (
                    <div
                      key={item.id}
                      className="border-l-2 border-indigo-400 pl-3.5 py-1 text-xs space-y-1 relative"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-bold text-slate-900">{item.action}</span>
                        <span className="text-slate-400 text-[11px]">{item.date} • {item.author}</span>
                      </div>
                      <p className="text-slate-600">{item.notes}</p>
                      <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded inline-block">
                        Resultado: {item.result}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
              Selecione um caso de busca ativa para ver os detalhes da intervenção.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
