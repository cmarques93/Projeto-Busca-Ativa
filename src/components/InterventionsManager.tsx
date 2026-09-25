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
  Lock,
  UserPlus,
  Search,
  X
} from 'lucide-react';
import { InterventionCase, InterventionStage, Student, UserSession } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { getStudentPhones } from '../utils/phoneUtils';

interface InterventionsManagerProps {
  cases: InterventionCase[];
  students?: Student[];
  currentUser?: UserSession;
  onAddAction: (
    caseId: string,
    action: { action: string; author: string; notes: string; result: string; advanceStageTo?: InterventionStage }
  ) => Promise<void>;
  onCreateCase?: (caseData: Partial<InterventionCase>) => Promise<void>;
  onAutoGenerateCasesFromRiskStudents?: () => Promise<number>;
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
  students = [],
  currentUser,
  onAddAction,
  onCreateCase,
  onAutoGenerateCasesFromRiskStudents,
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

  // Modal Novo Caso State
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [selectedStudentForNewCase, setSelectedStudentForNewCase] = useState<string>('');
  const [newCasePriority, setNewCasePriority] = useState<'urgente_conselho' | 'alta' | 'media'>('alta');
  const [newCaseStage, setNewCaseStage] = useState<InterventionStage>('alerta_inicial');
  const [newCaseReason, setNewCaseReason] = useState<string>('');
  const [newCasePedagogue, setNewCasePedagogue] = useState<string>(currentUser?.name || 'Coordenação Pedagógica / PAAC');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [isSubmittingNewCase, setIsSubmittingNewCase] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // New action form state
  const [actionTitle, setActionTitle] = useState('Contato Telefônico / WhatsApp com Responsável');
  const [actionAuthor, setActionAuthor] = useState(currentUser?.name || 'Profª. Silvana Rocha (Coordenação Pedagógica)');
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

  const handleOpenNewCaseModal = () => {
    setSelectedStudentForNewCase('');
    setNewCaseReason('');
    setNewCasePriority('alta');
    setNewCaseStage('alerta_inicial');
    setStudentSearchTerm('');
    setIsNewCaseModalOpen(true);
  };

  const handleAutoSyncRiskCases = async () => {
    if (!onAutoGenerateCasesFromRiskStudents) return;
    setIsAutoSyncing(true);
    try {
      const generatedCount = await onAutoGenerateCasesFromRiskStudents();
      if (generatedCount > 0) {
        setFeedbackMsg(`${generatedCount} caso(s) de Busca Ativa instaurado(s) com sucesso para os estudantes em risco.`);
      } else {
        setFeedbackMsg('Todos os estudantes em risco já possuem casos instaurados na plataforma.');
      }
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (e) {
      console.error('Erro ao sincronizar casos:', e);
      setFeedbackMsg('Erro ao sincronizar casos de risco.');
      setTimeout(() => setFeedbackMsg(null), 4000);
    } finally {
      setIsAutoSyncing(false);
    }
  };

  const handleSaveNewCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForNewCase || !onCreateCase) return;

    const studentObj = students.find(s => s.id === selectedStudentForNewCase);
    if (!studentObj) return;

    setIsSubmittingNewCase(true);
    try {
      await onCreateCase({
        studentId: studentObj.id,
        studentName: studentObj.name,
        classId: studentObj.classId,
        className: studentObj.className,
        guardianName: studentObj.guardianName,
        guardianPhone: studentObj.guardianPhone,
        priority: newCasePriority,
        stage: newCaseStage,
        assignedPedagogue: newCasePedagogue || currentUser?.name || 'Coordenação Pedagógica / PAAC',
        reason: newCaseReason || `Acompanhamento preventivo de infrequência escolar. Aluno com ${studentObj.consecutiveAbsences || 0} faltas e taxa de frequência ${studentObj.attendanceRate || 0}%.`,
      });

      setIsNewCaseModalOpen(false);
      setFeedbackMsg(`Caso de Busca Ativa para "${studentObj.name}" criado com sucesso!`);
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err) {
      console.error('Erro ao criar caso:', err);
      alert('Erro ao criar caso. Tente novamente.');
    } finally {
      setIsSubmittingNewCase(false);
    }
  };

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

  const filteredStudentOptions = students.filter(s => {
    const q = studentSearchTerm.toLowerCase().trim();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.ra.toLowerCase().includes(q) || s.className.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 font-semibold text-xs rounded-xl shadow-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 uppercase tracking-wider">
              <span>Gestão de Casos & Rede Intersetorial</span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h2 className="text-xl font-bold text-slate-900">
                Plataforma de Casos da Busca Ativa Escolar & IA
              </h2>
              <InfoTooltip
                title="Gestão de Casos & Rede Intersetorial"
                content="Acompanhamento detalhado de contatos telefônicos, WhatsApp institucional, pactuação de compromissos com famílias e encaminhamentos formais ao CRAS e Conselho Tutelar."
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Casos gerados automaticamente a partir de 3 faltas consecutivas na chamada ou abertos pela equipe gestora.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Botão Novo Caso */}
            {onCreateCase && (
              <button
                onClick={handleOpenNewCaseModal}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Abrir novo caso de busca ativa para um estudante"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Caso</span>
              </button>
            )}

            {/* Botão Sincronizar Estudantes em Risco */}
            {onAutoGenerateCasesFromRiskStudents && (
              <button
                onClick={handleAutoSyncRiskCases}
                disabled={isAutoSyncing}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Instaurar casos automaticamente para todos os estudantes que já possuem faltas e alertas críticos"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-600 ${isAutoSyncing ? 'animate-spin' : ''}`} />
                <span>{isAutoSyncing ? 'Sincronizando...' : 'Sincronizar Alunos em Risco'}</span>
              </button>
            )}

            {cases.length > 0 && (
              <button
                onClick={() => setIsDeletingConfirmOpen(true)}
                className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                title="Excluir casos em aberto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onRefresh}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 transition-all cursor-pointer"
              title="Atualizar registros reais"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-emerald-700 font-medium">Reintegrados:</span>
              <span className="font-extrabold text-emerald-900 ml-1.5 text-sm">{resolvedCases.length}</span>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-rose-700 font-medium">Casos Ativos:</span>
              <span className="font-extrabold text-rose-900 ml-1.5 text-sm">{activeCases.length}</span>
            </div>

            {/* Status da Cota Gratuita / Proteção de Custos */}
            {aiQuotaStatus && (
              <div
                className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
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

        {/* Delete Confirmation Modal */}
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
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-500'
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

      {/* Main Content Area */}
      {cases.length === 0 ? (
        /* Informational & Actionable State Container */
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="max-w-2xl mx-auto space-y-2">
              <h3 className="text-xl font-bold text-slate-900">
                Plataforma de Gestão de Casos da Busca Ativa & Assistente IA
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Esta aba é o centro de acolhimento e acompanhamento pedagógico de estudantes em risco de evasão ou infrequência crônica.
                Os casos são <strong>instaurados automaticamente</strong> a partir de 3 faltas na chamada diária ou podem ser abertos manualmente pela equipe gestora/PAAC.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto text-left">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[11px]">1</span>
                  <span>Gatilho na Chamada Diária</span>
                </div>
                <p className="text-xs text-slate-600 leading-normal">
                  Ao registrar ausências no <strong>Lançamento Diário</strong>, o sistema detecta sequências de faltas e índices de assiduidade (&lt;75% ou &lt;80%), instaurando o caso imediatamente.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[11px]">2</span>
                  <span>Assistente IA & Planos</span>
                </div>
                <p className="text-xs text-slate-600 leading-normal">
                  Para cada caso em aberto, você pode clicar em <strong>Assistente IA</strong> para gerar diagnósticos, planos de acolhimento e cronogramas pedagógicos fundamentados na <strong>Resolução SEDUC 39/2023</strong> e no ECA.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[11px]">3</span>
                  <span>Rede Intersetorial & CRAS</span>
                </div>
                <p className="text-xs text-slate-600 leading-normal">
                  Registre contatos por WhatsApp, reuniões com os responsáveis e, se necessário, o encaminhamento formal (FICAI) ao Conselho Tutelar até a <strong>reintegração com sucesso</strong> do estudante.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {onCreateCase && (
                <button
                  onClick={handleOpenNewCaseModal}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer active:scale-98"
                >
                  <Plus className="w-4 h-4" />
                  <span>Abrir Novo Caso de Busca Ativa</span>
                </button>
              )}

              {onAutoGenerateCasesFromRiskStudents && (
                <button
                  onClick={handleAutoSyncRiskCases}
                  disabled={isAutoSyncing}
                  className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 text-emerald-600 ${isAutoSyncing ? 'animate-spin' : ''}`} />
                  <span>{isAutoSyncing ? 'Sincronizando...' : 'Sincronizar Estudantes em Risco'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Diagnóstico Rápido de Alunos da Escola */}
          {students.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Diagnóstico de Estudantes & Frequência na Escola</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Selecione qualquer estudante abaixo para instaurar um acompanhamento de Busca Ativa imediato.
                  </p>
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Total de Estudantes: <strong className="text-slate-800">{students.length}</strong>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">Estudante</th>
                      <th className="py-2.5 px-3">Turma</th>
                      <th className="py-2.5 px-3 text-center">Faltas Totais</th>
                      <th className="py-2.5 px-3 text-center">Faltas Consecutivas</th>
                      <th className="py-2.5 px-3 text-center">Frequência</th>
                      <th className="py-2.5 px-3 text-center">Status / Risco</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.slice(0, 15).map(st => {
                      const isRisk = st.riskLevel === 'critico' || st.riskLevel === 'alto' || (st.consecutiveAbsences && st.consecutiveAbsences >= 2) || (st.attendanceRate && st.attendanceRate < 80);
                      return (
                        <tr key={st.id} className={`hover:bg-slate-50/80 transition-colors ${isRisk ? 'bg-amber-50/30' : ''}`}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {st.name}
                            <div className="text-[10px] text-slate-400 font-normal">RA: {st.ra || 'Não informado'}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{st.className}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-800">{st.totalAbsences || 0}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-amber-700">{st.consecutiveAbsences || 0}</td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            <span className={`${(st.attendanceRate ?? 100) < 75 ? 'text-rose-600' : (st.attendanceRate ?? 100) < 85 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {st.attendanceRate ?? 100}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              st.riskLevel === 'critico'
                                ? 'bg-rose-100 text-rose-800'
                                : st.riskLevel === 'alto'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {st.riskLevel ? st.riskLevel.toUpperCase() : 'REGULAR'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {onCreateCase && (
                              <button
                                onClick={() => {
                                  setSelectedStudentForNewCase(st.id);
                                  setNewCasePriority(st.consecutiveAbsences >= 4 || st.riskLevel === 'critico' ? 'urgente_conselho' : 'alta');
                                  setNewCaseReason(`Acompanhamento pedagógico de infrequência. Estudante com ${st.consecutiveAbsences || 0} ausências consecutivas e frequência de ${st.attendanceRate || 100}%.`);
                                  setIsNewCaseModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-md border border-indigo-200 transition-colors cursor-pointer"
                              >
                                Instaurar Caso
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Main Split View: Left List of Cases / Right Case Details */
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
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Ver Ficha
                    </button>
                  </div>
                </div>

                {/* AI Plan Result Box */}
                {aiPlanResult && aiPlanResult.caseId === selectedCase.id && (
                  <div className="bg-indigo-950 text-indigo-100 rounded-xl p-5 border border-indigo-800 space-y-4 shadow-md">
                    <div className="flex items-center justify-between border-b border-indigo-800/80 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                        <span className="font-bold text-sm text-white">
                          Plano Estratégico de Busca Ativa (IA Pedagógica)
                        </span>
                      </div>
                      <span className="text-[11px] bg-indigo-900 text-indigo-200 px-2 py-0.5 rounded font-mono border border-indigo-700">
                        Resolução SEDUC 39/2023
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px] block mb-1">
                          Diagnóstico & Causa Raiz:
                        </span>
                        <p className="text-slate-200 leading-relaxed bg-indigo-900/40 p-3 rounded-lg border border-indigo-800/50">
                          {aiPlanResult.plan.diagnosticoCausaRaiz || aiPlanResult.plan.diagnostico || JSON.stringify(aiPlanResult.plan)}
                        </p>
                      </div>

                      {aiPlanResult.plan.acoesImediatas && (
                        <div>
                          <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px] block mb-1">
                            Ações Imediatas Recomendadas:
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-slate-200 bg-indigo-900/40 p-3 rounded-lg border border-indigo-800/50">
                            {Array.isArray(aiPlanResult.plan.acoesImediatas)
                              ? aiPlanResult.plan.acoesImediatas.map((a: string, i: number) => <li key={i}>{a}</li>)
                              : <li>{String(aiPlanResult.plan.acoesImediatas)}</li>}
                          </ul>
                        </div>
                      )}

                      {aiPlanResult.plan.roteiroAcolhimento && (
                        <div>
                          <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px] block mb-1">
                            Roteiro de Acolhimento da Família:
                          </span>
                          <p className="text-slate-200 leading-relaxed bg-indigo-900/40 p-3 rounded-lg border border-indigo-800/50">
                            {aiPlanResult.plan.roteiroAcolhimento}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Case Status and Reason */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200">
                    <span className="text-slate-500 font-medium block mb-1">Etapa Atual do Fluxo:</span>
                    <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      {STAGE_CONFIG[selectedCase.stage]?.icon}
                      <span>{STAGE_CONFIG[selectedCase.stage]?.label}</span>
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200">
                    <span className="text-slate-500 font-medium block mb-1">Motivo / Vulnerabilidade:</span>
                    <span className="font-semibold text-slate-900 block leading-snug">
                      {selectedCase.reason}
                    </span>
                  </div>
                </div>

                {/* Action Plan */}
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
      )}

      {/* Modal: Abrir Novo Caso de Busca Ativa */}
      {isNewCaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Instaurar Novo Caso de Busca Ativa
                </h3>
              </div>
              <button
                onClick={() => setIsNewCaseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewCase} className="space-y-3.5 text-xs">
              {/* Seleção do Estudante */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Selecione o Estudante:
                </label>
                <div className="mb-1.5 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome, RA ou turma..."
                    value={studentSearchTerm}
                    onChange={e => setStudentSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <select
                  required
                  value={selectedStudentForNewCase}
                  onChange={e => setSelectedStudentForNewCase(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 max-h-32"
                >
                  <option value="">-- Selecione o aluno matriculado --</option>
                  {filteredStudentOptions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.className}) • {s.consecutiveAbsences || 0} faltas consec. • Freq: {s.attendanceRate || 0}%
                    </option>
                  ))}
                </select>
              </div>

              {/* Informações Complementares do Estudante Selecionado */}
              {(() => {
                const st = students.find(s => s.id === selectedStudentForNewCase);
                if (!st) return null;
                return (
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg text-[11px] text-indigo-950 space-y-1">
                    <div><strong>Turma:</strong> {st.className} • <strong>RA:</strong> {st.ra}</div>
                    <div><strong>Responsável:</strong> {st.guardianName} ({st.guardianPhone || 'Tel não cadastrado'})</div>
                    <div><strong>Taxa de Frequência:</strong> {st.attendanceRate || 0}% • <strong>Risco:</strong> {st.riskLevel || 'baixo'}</div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Prioridade:</label>
                  <select
                    value={newCasePriority}
                    onChange={e => setNewCasePriority(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-medium"
                  >
                    <option value="urgente_conselho">Urgente Conselho (Mais de 3 faltas)</option>
                    <option value="alta">Prioridade Alta (2 a 3 faltas)</option>
                    <option value="media">Prioridade Média (Faltas recorrentes)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-800 block mb-1">Etapa Inicial:</label>
                  <select
                    value={newCaseStage}
                    onChange={e => setNewCaseStage(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-medium"
                  >
                    <option value="alerta_inicial">Alerta Inicial</option>
                    <option value="contato_telefonico_whatsapp">Contato Telefônico / WhatsApp</option>
                    <option value="reuniao_pais">Reunião com Pais</option>
                    <option value="encaminhado_cras_conselho">Conselho Tutelar / CRAS</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Orientador(a) Pedagógico(a) Responsável:</label>
                <input
                  type="text"
                  value={newCasePedagogue}
                  onChange={e => setNewCasePedagogue(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Motivo da Instauração / Fatores de Vulnerabilidade:</label>
                <textarea
                  rows={2}
                  value={newCaseReason}
                  onChange={e => setNewCaseReason(e.target.value)}
                  placeholder="Ex: Infrequência contínua, dificuldade de transporte, trabalho infantil ou necessidade de acolhimento pedagógico..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNewCaseModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedStudentForNewCase || isSubmittingNewCase}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {isSubmittingNewCase ? 'Instaurando...' : 'Instaurar Caso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
