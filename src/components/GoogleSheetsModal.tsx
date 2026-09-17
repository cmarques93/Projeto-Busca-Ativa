import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  UploadCloud,
  DownloadCloud,
  Database,
  Table,
  LogOut,
  ShieldCheck,
  Sparkles,
  Link2,
} from 'lucide-react';
import { GoogleSheetsConfig } from '../types';
import {
  googleSignIn,
  logoutGoogle,
  initAuth,
  getAccessToken,
} from '../firebase';
import { User } from 'firebase/auth';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRefreshed?: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  onDataRefreshed,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getAccessToken());
  const [config, setConfig] = useState<GoogleSheetsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [customSheetInput, setCustomSheetInput] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState<{
    action: 'create' | 'syncTo' | 'syncFrom';
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
      },
      () => {
        // If not authenticated
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/google-sheets/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Erro ao buscar configuração do Google Sheets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setFeedback(null);
    setActionLoading('login');
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setFeedback({
          type: 'success',
          message: `Conectado com sucesso com a conta ${result.user.email}!`,
        });
        loadConfig();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao autenticar com a conta Google.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setUser(null);
    setToken(null);
    setFeedback({
      type: 'success',
      message: 'Desconectado da conta Google com sucesso.',
    });
  };

  const executeCreateSpreadsheet = async () => {
    setShowConfirmModal(null);
    if (!token) {
      setFeedback({
        type: 'error',
        message: 'Faça login com sua conta Google antes de criar a planilha.',
      });
      return;
    }

    setActionLoading('create');
    setFeedback(null);
    try {
      const res = await fetch('/api/google-sheets/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: user?.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar planilha no Google Drive');
      }

      setConfig(data.config);
      setFeedback({
        type: 'success',
        message: 'Planilha Oficial criada e preenchida com sucesso no seu Google Drive!',
      });
      if (onDataRefreshed) onDataRefreshed();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao criar planilha no Google Drive.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const executeSyncToSheet = async () => {
    setShowConfirmModal(null);
    if (!token) {
      setFeedback({
        type: 'error',
        message: 'Faça login com sua conta Google antes de sincronizar.',
      });
      return;
    }

    setActionLoading('syncTo');
    setFeedback(null);
    try {
      const res = await fetch('/api/google-sheets/sync-to-sheet', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: user?.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao sincronizar dados com Google Sheets');
      }

      setConfig(data.config);
      setFeedback({
        type: 'success',
        message: 'Todas as abas da planilha foram sincronizadas com os dados mais recentes!',
      });
      if (onDataRefreshed) onDataRefreshed();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao sincronizar dados.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const executeSyncFromSheet = async () => {
    setShowConfirmModal(null);
    if (!token) {
      setFeedback({
        type: 'error',
        message: 'Faça login com sua conta Google antes de importar dados.',
      });
      return;
    }

    setActionLoading('syncFrom');
    setFeedback(null);
    try {
      const res = await fetch('/api/google-sheets/sync-from-sheet', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao importar alterações da Planilha');
      }

      setFeedback({
        type: 'success',
        message: data.message || 'Dados de estudantes atualizados com sucesso.',
      });
      if (onDataRefreshed) onDataRefreshed();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao importar dados da planilha.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLinkCustomSheet = async () => {
    if (!customSheetInput.trim()) return;
    setActionLoading('link');
    setFeedback(null);
    try {
      const res = await fetch('/api/google-sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: customSheetInput.trim(),
          userEmail: user?.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao vincular planilha');

      setConfig(data);
      setCustomSheetInput('');
      setFeedback({
        type: 'success',
        message: 'Planilha vinculada com sucesso!',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao vincular planilha existente.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <FileSpreadsheet className="w-6 h-6 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Banco de Dados em Google Planilhas & Drive</h2>
              <p className="text-xs text-emerald-100">
                EE Professor Arlindo Silvestre • Sincronização direta em Nuvem
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Feedback messages */}
          {feedback && (
            <div
              className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              )}
              <span className="flex-1 font-medium">{feedback.message}</span>
              <button
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Section 1: Google Account Connection */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Conta Google Conectada
                </span>
                {user ? (
                  <div className="flex items-center gap-3 mt-1.5">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Usuário'}
                        className="w-9 h-9 rounded-full border border-slate-300"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
                        {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        {user.displayName || 'Usuário Autorizado'}
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-xs text-slate-600">{user.email}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 mt-1">
                    Conecte sua conta do Google para ler, gravar e criar a planilha oficial no seu Google Drive.
                  </p>
                )}
              </div>

              <div>
                {user && token ? (
                  <button
                    onClick={handleGoogleLogout}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Desconectar Conta
                  </button>
                ) : (
                  <button
                    onClick={handleGoogleLogin}
                    disabled={actionLoading === 'login'}
                    className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm border border-slate-300 rounded-xl shadow-sm transition-all hover:shadow hover:border-slate-400 active:scale-[0.99]"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 48 48">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    {actionLoading === 'login' ? 'Conectando...' : 'Conectar com Google'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Active Spreadsheet or Creation Card */}
          {config?.spreadsheetId ? (
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="font-bold text-slate-900 text-base">
                      {config.title || 'EE Prof. Arlindo Silvestre - Banco de Dados'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600">
                    ID da Planilha: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">{config.spreadsheetId}</span>
                  </p>
                  {config.lastSync && (
                    <p className="text-xs text-slate-500">
                      Última sincronização completa:{' '}
                      <span className="font-medium text-slate-700">
                        {new Date(config.lastSync).toLocaleString('pt-BR')}
                      </span>
                    </p>
                  )}
                </div>

                <a
                  href={config.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex-shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir no Google Planilhas
                </a>
              </div>

              {/* Sync row counts breakdown */}
              {config.syncedCounts && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-emerald-200/60">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                    <div className="text-xs text-slate-500">Alunos</div>
                    <div className="text-sm font-bold text-slate-800">{config.syncedCounts.students}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                    <div className="text-xs text-slate-500">Frequência</div>
                    <div className="text-sm font-bold text-slate-800">{config.syncedCounts.attendance}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                    <div className="text-xs text-slate-500">Busca Ativa</div>
                    <div className="text-sm font-bold text-slate-800">{config.syncedCounts.interventions}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                    <div className="text-xs text-slate-500">Portaria</div>
                    <div className="text-sm font-bold text-slate-800">{config.syncedCounts.gateRecords}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center col-span-2 sm:col-span-1">
                    <div className="text-xs text-slate-500">Alertas Enviados</div>
                    <div className="text-sm font-bold text-slate-800">{config.syncedCounts.alerts}</div>
                  </div>
                </div>
              )}

              {/* Sync Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() =>
                    setShowConfirmModal({
                      action: 'syncTo',
                      title: 'Sincronizar dados com o Google Planilhas?',
                      description:
                        'Essa ação enviará todas as alterações recentes (presenças, faltas justificadas, atestados médicos, casos de busca ativa e portaria) para as abas da sua planilha oficial no Google Drive.',
                    })
                  }
                  disabled={!token || actionLoading === 'syncTo'}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4 text-emerald-400" />
                  {actionLoading === 'syncTo' ? 'Enviando dados...' : 'Gravar Dados na Planilha (Push)'}
                </button>

                <button
                  onClick={() =>
                    setShowConfirmModal({
                      action: 'syncFrom',
                      title: 'Importar dados da Planilha para o Sistema?',
                      description:
                        'Os dados de nomes, contatos e responsáveis editados na aba "Alunos" da planilha do Google serão lidos e atualizados no banco local do sistema escolar.',
                    })
                  }
                  disabled={!token || actionLoading === 'syncFrom'}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <DownloadCloud className="w-4 h-4 text-blue-600" />
                  {actionLoading === 'syncFrom' ? 'Importando...' : 'Importar da Planilha (Pull)'}
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-base">
                    Criar a Planilha Oficial no seu Google Drive
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Ao clicar no botão abaixo, o sistema criará uma nova planilha no seu Google Drive já estruturada com 7 abas organizadas (Alunos, Frequência Diária, Busca Ativa, Portaria, Alertas, Turmas e Usuários) e copiará os registros escolares atuais para ela.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() =>
                    setShowConfirmModal({
                      action: 'create',
                      title: 'Criar Planilha Oficial no Google Drive?',
                      description:
                        'O sistema criará uma nova planilha intitulada "EE Prof. Arlindo Silvestre - Banco de Dados Oficial" com todas as tabelas pedagógicas e cadastros já preenchidos no seu Google Drive.',
                    })
                  }
                  disabled={!token || actionLoading === 'create'}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  {actionLoading === 'create'
                    ? 'Criando e populando planilha no Drive...'
                    : 'Criar Planilha Oficial no Google Drive Agora'}
                </button>
                {!token && (
                  <p className="text-[11px] text-amber-700 font-medium mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Conecte sua conta Google acima para habilitar a criação no seu Drive.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Section 3: Explanation of the 7 Worksheets */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Table className="w-4 h-4 text-slate-600" />
              Estrutura das Abas da Planilha Oficial (8 Abas Integradas)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-800">1. Alunos:</span>
                <p className="text-slate-600 mt-0.5">
                  RA, Turma, Nome do Aluno, Responsável, Grau de Parentesco, Telefone WhatsApp, Faltas e Nível de Risco.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-emerald-300 bg-emerald-50/50">
                <span className="font-bold text-emerald-900">2. Calendario_Frequencia (Matriz):</span>
                <p className="text-emerald-800 mt-0.5">
                  Formato calendário por data com códigos oficiais: <strong>0</strong> = presença, <strong>1</strong> = ausência/falta, <strong>AT</strong> = atestado médico.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-800">3. Frequencia_Diaria:</span>
                <p className="text-slate-600 mt-0.5">
                  Lançamento cronológico com duração em dias, motivos e atestados médicos cadastrados.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-800">4. Buscas_Ativas:</span>
                <p className="text-slate-600 mt-0.5">
                  Protocolos abertos, prazos de retorno, encaminhamentos a CRAS/Conselho Tutelar e histórico de ações.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-800">5. Portaria_Movimentacoes:</span>
                <p className="text-slate-600 mt-0.5">
                  Entradas tardias e saídas antecipadas autorizadas com identificação do responsável e operador AOE.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-800">6. Alertas_Responsaveis:</span>
                <p className="text-slate-600 mt-0.5">
                  Mensagens automáticas e manuais disparadas via WhatsApp com modelo institucional da Escola Arlindo Silvestre.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Link Existing Spreadsheet (Alternative option) */}
          <div className="pt-2 border-t border-slate-200">
            <details className="group text-xs">
              <summary className="font-semibold text-slate-700 cursor-pointer hover:text-slate-900 flex items-center justify-between list-none">
                <span className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-slate-500" />
                  Já possui uma planilha do Google existente? Vincular manualmente
                </span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
                <p className="text-slate-600">
                  Cole o link completo ou o ID da planilha do Google Sheets que você deseja utilizar como repositório:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSheetInput}
                    onChange={e => setCustomSheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XR.../edit"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    onClick={handleLinkCustomSheet}
                    disabled={actionLoading === 'link' || !customSheetInput.trim()}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-50"
                  >
                    Vincular
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Google Workspace Integration • OAuth 2.0 Client Scopes Ativos</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Explicit User Confirmation Modal for Destructive/Mutating Operations */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-amber-700">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="font-bold text-slate-900 text-base">
                {showConfirmModal.title}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {showConfirmModal.description}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowConfirmModal(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (showConfirmModal.action === 'create') executeCreateSpreadsheet();
                  else if (showConfirmModal.action === 'syncTo') executeSyncToSheet();
                  else if (showConfirmModal.action === 'syncFrom') executeSyncFromSheet();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow transition-colors"
              >
                Confirmar e Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
