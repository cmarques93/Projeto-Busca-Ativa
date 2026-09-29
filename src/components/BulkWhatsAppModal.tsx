import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Users,
  Copy,
  Check,
  Phone,
  Play,
  Pause,
  RotateCcw,
  ShieldCheck,
  Server,
  Zap,
  Info,
  Clock,
  Settings,
  ChevronRight,
  ChevronLeft,
  Key,
  Globe
} from 'lucide-react';
import { ParentAlert } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { getStudentPhones } from '../utils/phoneUtils';

interface BulkWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: ParentAlert[];
  onMarkAsDelivered: (alertId: string) => Promise<void>;
}

export const BulkWhatsAppModal: React.FC<BulkWhatsAppModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onMarkAsDelivered,
}) => {
  // Filter alerts eligible for WhatsApp
  const whatsappAlerts = alerts.filter(a => a.channel === 'whatsapp');

  // Selection & Navigation
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modes: 'assisted_web' (1-a-1 imediato via WhatsApp Web) vs 'background_auto' (100% automático via API de Servidor)
  const [mode, setMode] = useState<'assisted_web' | 'background_auto'>('assisted_web');
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);

  // Gateway configuration state
  const [gatewayConfig, setGatewayConfig] = useState<{
    provider: string;
    endpointUrl: string;
    apiToken: string;
    instanceName: string;
    phoneId: string;
    isConfigured: boolean;
  }>({
    provider: 'evolution',
    endpointUrl: '',
    apiToken: '',
    instanceName: '',
    phoneId: '',
    isConfigured: false,
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [showGatewayConfigForm, setShowGatewayConfigForm] = useState(false);
  const [saveConfigSuccess, setSaveConfigSuccess] = useState(false);
  const [testingGateway, setTestingGateway] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Automatic background dispatch state
  const [isAutoSending, setIsAutoSending] = useState(false);
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [sendLogs, setSendLogs] = useState<Record<string, { status: 'pending' | 'sending' | 'success' | 'error'; msg?: string; time?: string }>>({});
  const [antiSpamDelay, setAntiSpamDelay] = useState<number>(15); // Padrão seguro de 15 segundos para proteção anti-spam
  const isCancelledRef = useRef<boolean>(false);

  // Carrega configuração de Gateway do backend ao abrir
  const loadGatewayConfig = async () => {
    try {
      setIsLoadingConfig(true);
      const res = await fetch('/api/whatsapp/config');
      if (res.ok) {
        const data = await res.json();
        setGatewayConfig({
          provider: data.provider || 'evolution',
          endpointUrl: data.endpointUrl || '',
          apiToken: data.apiToken || '',
          instanceName: data.instanceName || '',
          phoneId: data.phoneId || '',
          isConfigured: Boolean(data.isConfigured),
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar configuração de WhatsApp Gateway:', e);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  // Inicializa a seleção ao abrir
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(whatsappAlerts.map(a => a.id));
      setCurrentIndex(0);
      setIsAutoSending(false);
      isCancelledRef.current = false;
      loadGatewayConfig();
    }
  }, [isOpen, whatsappAlerts.length]);

  if (!isOpen) return null;

  const targetAlerts = whatsappAlerts.filter(a => selectedIds.includes(a.id));
  const currentAlert = targetAlerts[currentIndex] || targetAlerts[0];

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === whatsappAlerts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(whatsappAlerts.map(a => a.id));
    }
  };

  const handleSelectCriticalOnly = () => {
    const critical = whatsappAlerts.filter(a => a.triggerReason === '3_faltas_consecutivas').map(a => a.id);
    setSelectedIds(critical.length > 0 ? critical : whatsappAlerts.map(a => a.id));
  };

  const getWaLink = (alert: ParentAlert, phoneIndex = 0) => {
    const phones = getStudentPhones(alert.guardianPhone, alert.messageContent);
    if (phones.length > 0 && phones[phoneIndex]) {
      return phones[phoneIndex].whatsAppUrl;
    }
    const rawPhone = alert.guardianPhone.replace(/\D/g, '');
    const cleanPhone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(alert.messageContent)}`;
  };

  // Envio Assistido Oficial (Abre a conversa no WhatsApp Web com texto pronto)
  const handleOpenWhatsApp = async (alert: ParentAlert, phoneIndex = 0) => {
    const url = getWaLink(alert, phoneIndex);
    window.open(url, '_blank');
    
    // Marca como entregue no sistema e avança
    setSendLogs(prev => ({
      ...prev,
      [alert.id]: {
        status: 'success',
        msg: 'Aberto no WhatsApp Web',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }
    }));
    await onMarkAsDelivered(alert.id);
    
    if (autoAdvance && currentIndex < targetAlerts.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleCopyMessage = (alert: ParentAlert) => {
    navigator.clipboard.writeText(alert.messageContent);
    setCopiedId(alert.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleNext = () => {
    if (currentIndex < targetAlerts.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // Salvar configuração de API de WhatsApp no Servidor
  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gatewayConfig),
      });
      if (res.ok) {
        setSaveConfigSuccess(true);
        setTimeout(() => setSaveConfigSuccess(false), 3000);
        await loadGatewayConfig();
      }
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
    }
  };

  // Testar conexão de Gateway de WhatsApp
  const handleTestGateway = async () => {
    setTestingGateway(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '11999999999',
          testMessage: 'Teste de conexão • EE Prof. Arlindo Silvestre',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, msg: 'Conexão validada com sucesso com o servidor de WhatsApp!' });
      } else {
        setTestResult({ success: false, msg: data.error || 'Falha ao conectar com o Gateway.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, msg: err?.message || 'Erro de conexão com o servidor.' });
    } finally {
      setTestingGateway(false);
    }
  };

  // --- DISPARO AUTOMÁTICO EM SEGUNDO PLANO (VIA GATEWAY DE SERVIDOR) ---
  const handleStartAutoDispatch = async () => {
    if (targetAlerts.length === 0) return;

    if (!gatewayConfig.isConfigured) {
      setShowGatewayConfigForm(true);
      return;
    }

    setIsAutoSending(true);
    isCancelledRef.current = false;
    setAutoProgress({ current: 0, total: targetAlerts.length });

    for (let i = 0; i < targetAlerts.length; i++) {
      if (isCancelledRef.current) {
        break;
      }

      const alert = targetAlerts[i];
      setAutoProgress({ current: i + 1, total: targetAlerts.length });
      setCurrentIndex(i);

      setSendLogs(prev => ({
        ...prev,
        [alert.id]: { status: 'sending', msg: 'Enviando via Gateway API...' }
      }));

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: alert.guardianPhone,
            message: alert.messageContent,
            studentName: alert.studentName,
            guardianName: alert.guardianName,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          await onMarkAsDelivered(alert.id);
          setSendLogs(prev => ({
            ...prev,
            [alert.id]: {
              status: 'success',
              msg: 'Entregue com sucesso via API',
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            }
          }));
        } else {
          setSendLogs(prev => ({
            ...prev,
            [alert.id]: {
              status: 'error',
              msg: data.error || `Falha no envio (${res.status})`
            }
          }));
          // Pausa se houver erro crítico de configuração para não travar
          if (data.notConfigured) {
            setShowGatewayConfigForm(true);
            break;
          }
        }
      } catch (err: any) {
        setSendLogs(prev => ({
          ...prev,
          [alert.id]: { status: 'error', msg: err?.message || 'Erro de conexão' }
        }));
      }

      // Delay seguro anti-spam entre cada envio
      if (i < targetAlerts.length - 1 && !isCancelledRef.current) {
        await new Promise(resolve => setTimeout(resolve, antiSpamDelay * 1000));
      }
    }

    setIsAutoSending(false);
  };

  const handleStopAutoDispatch = () => {
    isCancelledRef.current = true;
    setIsAutoSending(false);
  };

  const sentSuccessCount = Object.values(sendLogs).filter((l: { status: string }) => l.status === 'success').length;
  const progressPercent = targetAlerts.length > 0 ? Math.round((autoProgress.current / targetAlerts.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[94vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  Envio de Alertas WhatsApp aos Responsáveis
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800">
                  {targetAlerts.length} selecionados
                </span>
              </div>
              <p className="text-xs text-slate-600">
                EE Professor Arlindo Silvestre • Disparo de comunicados e Busca Ativa com garantia de entrega
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 flex items-center justify-between bg-white flex-wrap gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('assisted_web')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                mode === 'assisted_web'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>1. Fila Assistida WhatsApp Web (Recomendado • Imediato & 100% Gratuito)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('background_auto')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                mode === 'background_auto'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Zap className="w-4 h-4 text-blue-600" />
              <span>2. Disparo Automático em Segundo Plano (Requer Conexão API)</span>
            </button>
          </div>

          {/* Auto advance toggle or Anti-spam delay */}
          {mode === 'assisted_web' ? (
            <div className="pb-2 flex items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-1.5 cursor-pointer font-semibold select-none">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={e => setAutoAdvance(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Avançar para o próximo aluno automaticamente após abrir</span>
              </label>
            </div>
          ) : (
            <div className="pb-2 flex items-center gap-1.5 text-xs text-slate-600">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-semibold text-[11px]">Intervalo Anti-Spam:</span>
              <select
                value={antiSpamDelay}
                onChange={e => setAntiSpamDelay(Number(e.target.value))}
                disabled={isAutoSending}
                className="bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800"
              >
                <option value={15}>15 segundos (Recomendado • Proteção Alta)</option>
                <option value={20}>20 segundos (Altamente Seguro)</option>
                <option value={30}>30 segundos (Máxima Blindagem)</option>
                <option value={10}>10 segundos (Moderado)</option>
              </select>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {whatsappAlerts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <MessageSquare className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="font-bold text-slate-700">Nenhum alerta de WhatsApp na fila atual</p>
              <p className="text-xs mt-1">Gere novos alertas a partir do lançamento diário de ausências ou emita alertas manuais.</p>
            </div>
          ) : (
            <>
              {/* Informativo Específico por Modo */}
              {mode === 'assisted_web' ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 leading-relaxed">
                    <span className="font-bold block text-emerald-900">
                      Como funciona o Envio Rápido Assistido no WhatsApp da Vice-Diretora:
                    </span>
                    <p className="text-[11px] text-slate-700">
                      1. O WhatsApp Web deve estar aberto no computador. Ao clicar em <strong>"Abrir no WhatsApp Web e Avançar"</strong>, a conversa do responsável abre instantaneamente com o texto pronto.<br />
                      2. Basta apertar <strong>Enter (Enviar)</strong> no WhatsApp. O sistema registra a entrega e já pula para o próximo aluno da fila! Em menos de 2 minutos você envia toda a lista com 100% de certeza.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {!gatewayConfig.isConfigured ? (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-bold text-amber-900 text-sm">
                            Por que a mensagem não sai sem uma API/Gateway conectado?
                          </span>
                          <p className="text-slate-700 leading-relaxed">
                            Por regras de segurança da Meta (WhatsApp), <strong>nenhum site na internet pode enviar mensagens invisíveis diretamente pelo celular de uma pessoa</strong> sem uma API oficial ou instância autorizada (como Evolution API, Z-API ou Meta Cloud API).
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-200 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setMode('assisted_web')}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>Usar Fila Assistida Imediata (1 Clique por Aluno • Recomendado)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowGatewayConfigForm(!showGatewayConfigForm)}
                          className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-500" />
                          <span>{showGatewayConfigForm ? 'Ocultar Configuração de API' : 'Configurar Gateway de API'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-blue-600" />
                        <span>Gateway Ativo: <strong>{gatewayConfig.provider.toUpperCase()}</strong> ({gatewayConfig.endpointUrl || 'Meta Cloud'})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGatewayConfigForm(!showGatewayConfigForm)}
                        className="text-blue-700 font-bold hover:underline"
                      >
                        {showGatewayConfigForm ? 'Ocultar' : 'Alterar Configuração'}
                      </button>
                    </div>
                  )}

                  {/* Form de Configuração de Gateway */}
                  {showGatewayConfigForm && (
                    <form onSubmit={handleSaveGateway} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Key className="w-4 h-4 text-slate-600" />
                        <span>Configuração do Servidor de WhatsApp (Gateway API)</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Provedor de API:</label>
                          <select
                            value={gatewayConfig.provider}
                            onChange={e => setGatewayConfig(prev => ({ ...prev, provider: e.target.value }))}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800"
                          >
                            <option value="evolution">Evolution API (Recomendado • Auto-Hospedado / QR Code)</option>
                            <option value="zapi">Z-API (Gateway Nacional)</option>
                            <option value="meta_cloud">Meta Cloud API (Oficial WhatsApp Business API)</option>
                            <option value="webhook">Webhook Personalizado</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">URL do Endpoint da API:</label>
                          <input
                            type="text"
                            placeholder="https://api.meuservidor.com/message/sendText/escola"
                            value={gatewayConfig.endpointUrl}
                            onChange={e => setGatewayConfig(prev => ({ ...prev, endpointUrl: e.target.value }))}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">API Key / Token Secreto:</label>
                          <input
                            type="password"
                            placeholder="Insira o token de autorização..."
                            value={gatewayConfig.apiToken}
                            onChange={e => setGatewayConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800"
                          />
                        </div>

                        {gatewayConfig.provider === 'meta_cloud' && (
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">Phone Number ID (Meta):</label>
                            <input
                              type="text"
                              placeholder="Ex: 104829104829104"
                              value={gatewayConfig.phoneId}
                              onChange={e => setGatewayConfig(prev => ({ ...prev, phoneId: e.target.value }))}
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
                          >
                            Salvar Configuração
                          </button>
                          <button
                            type="button"
                            onClick={handleTestGateway}
                            disabled={testingGateway}
                            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg cursor-pointer disabled:opacity-50"
                          >
                            {testingGateway ? 'Testando...' : 'Testar Conexão'}
                          </button>
                        </div>

                        {saveConfigSuccess && (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Salvo com sucesso!
                          </span>
                        )}
                      </div>

                      {testResult && (
                        <div className={`p-2.5 rounded-lg text-xs font-semibold ${testResult.success ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'}`}>
                          {testResult.msg}
                        </div>
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* Layout in 2 columns: List on left, preview & dispatch on right */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Lista lateral de destinatários com seleção rápida */}
                <div className="md:col-span-5 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[440px] bg-white">
                  <div className="bg-slate-50 p-3 border-b border-slate-200 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selectedIds.length === whatsappAlerts.length && whatsappAlerts.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Destinatários ({targetAlerts.length}/{whatsappAlerts.length})</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleSelectCriticalOnly}
                        className="text-[10px] text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold cursor-pointer"
                        title="Selecionar apenas estudantes com 3+ faltas"
                      >
                        3+ Faltas
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto flex-1 p-1">
                    {whatsappAlerts.map((alert, idx) => {
                      const isSelected = selectedIds.includes(alert.id);
                      const log = sendLogs[alert.id];
                      const isDelivered = alert.status === 'entregue' || alert.status === 'lido' || alert.status === 'respondido' || log?.status === 'success';
                      const isCurrentlyActive = currentAlert?.id === alert.id;

                      return (
                        <div
                          key={alert.id}
                          className={`p-2.5 rounded-lg flex items-center gap-2.5 text-xs transition-colors cursor-pointer ${
                            isCurrentlyActive
                              ? 'bg-emerald-50/90 border border-emerald-300 shadow-2xs'
                              : 'hover:bg-slate-50'
                          }`}
                          onClick={() => {
                            const indexInTarget = targetAlerts.findIndex(a => a.id === alert.id);
                            if (indexInTarget !== -1) setCurrentIndex(indexInTarget);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleSelect(alert.id);
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 truncate">{alert.studentName}</span>
                              <span className="text-[10px] text-slate-500 shrink-0 ml-1">{alert.className}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                              <span>Resp: {alert.guardianName}</span>
                            </div>
                          </div>

                          {log?.status === 'sending' ? (
                            <span className="shrink-0 text-sky-700 text-[10px] font-bold flex items-center gap-1 bg-sky-100 px-1.5 py-0.5 rounded animate-pulse">
                              <span>Enviando...</span>
                            </span>
                          ) : isDelivered ? (
                            <span className="shrink-0 text-emerald-700 text-[10px] font-bold flex items-center gap-1 bg-emerald-100 px-1.5 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Enviado</span>
                            </span>
                          ) : log?.status === 'error' ? (
                            <span className="shrink-0 text-rose-700 text-[10px] font-bold bg-rose-100 px-1.5 py-0.5 rounded" title={log.msg}>
                              Erro
                            </span>
                          ) : (
                            <span className="shrink-0 text-slate-500 text-[10px] font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                              Pendente
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Painel Central / Preview & Execução do Disparo */}
                <div className="md:col-span-7 flex flex-col space-y-4">
                  {/* Bloco de Disparo Automático em Lote (Quando no modo 2) */}
                  {mode === 'background_auto' && (
                    <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <span className="font-bold text-sm text-white">
                            Disparo Automático Contínuo via API
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-300 font-mono">
                          {autoProgress.current} de {autoProgress.total} processados
                        </span>
                      </div>

                      {/* Barra de Progresso */}
                      <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-300">
                          {isAutoSending
                            ? `Disparando mensagem para ${currentAlert?.studentName || 'estudante'}...`
                            : sentSuccessCount > 0
                            ? `✅ Disparo finalizado: ${sentSuccessCount} alertas enviados!`
                            : gatewayConfig.isConfigured
                            ? 'Pronto para iniciar envio autônomo via Gateway.'
                            : 'Configure o Gateway acima para habilitar o envio.'}
                        </span>

                        {!isAutoSending ? (
                          <button
                            type="button"
                            onClick={handleStartAutoDispatch}
                            disabled={targetAlerts.length === 0}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors disabled:opacity-40"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>Iniciar Disparo ({targetAlerts.length} Destinatários)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleStopAutoDispatch}
                            className="px-4 py-2 bg-rose-500 hover:bg-rose-400 text-white font-black rounded-lg text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
                          >
                            <Pause className="w-4 h-4 fill-current" />
                            <span>Pausar Disparo</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pré-visualização do Aluno Selecionado */}
                  {currentAlert ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col flex-1">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{currentAlert.studentName}</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                              {currentAlert.className}
                            </span>
                          </div>
                          {(() => {
                            const phones = getStudentPhones(currentAlert.guardianPhone);
                            return (
                              <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                                <span>Destinatário: <strong>{currentAlert.guardianName}</strong></span>
                                <span>•</span>
                                <div className="flex flex-wrap items-center gap-1">
                                  {phones.map((p, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1 bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[11px] text-emerald-800 font-semibold shadow-2xs"
                                    >
                                      <Phone className="w-2.5 h-2.5 text-emerald-600" />
                                      <span>{p.formatted}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          {currentAlert.triggerLabel}
                        </span>
                      </div>

                      {/* Texto da Mensagem */}
                      <div className="my-3 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            Texto do Alerta Oficial:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(currentAlert)}
                            className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-semibold text-xs cursor-pointer"
                          >
                            {copiedId === currentAlert.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedId === currentAlert.id ? 'Copiado!' : 'Copiar Texto'}</span>
                          </button>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-300 text-xs text-slate-800 leading-relaxed overflow-y-auto max-h-[140px] whitespace-pre-line shadow-2xs">
                          {currentAlert.messageContent}
                        </div>
                      </div>

                      {/* Controles do Modo Assistido */}
                      <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentIndex === 0}
                            onClick={handlePrev}
                            className="p-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-xs disabled:opacity-40 cursor-pointer flex items-center gap-1"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            <span>Anterior</span>
                          </button>
                          <span className="text-xs text-slate-600 font-bold px-1">
                            {currentIndex + 1} / {targetAlerts.length}
                          </span>
                          <button
                            type="button"
                            disabled={currentIndex >= targetAlerts.length - 1}
                            onClick={handleNext}
                            className="p-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-xs disabled:opacity-40 cursor-pointer flex items-center gap-1"
                          >
                            <span>Próximo</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>

                        {mode === 'assisted_web' && (() => {
                          const phones = getStudentPhones(currentAlert.guardianPhone);
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              {phones.length > 0 ? (
                                phones.map((p, pIdx) => (
                                  <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => handleOpenWhatsApp(currentAlert, pIdx)}
                                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-transform active:scale-95"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>
                                      {phones.length > 1
                                        ? `Abrir Tel ${pIdx + 1} (${p.formatted}) e Avançar`
                                        : `Abrir no WhatsApp Web e Avançar (${currentAlert.studentName.split(' ')[0]})`}
                                    </span>
                                  </button>
                                ))
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenWhatsApp(currentAlert, 0)}
                                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  <span>Abrir no WhatsApp Web e Avançar</span>
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center p-6 text-center text-slate-400 text-xs">
                      Selecione ao menos um alerta na lista ao lado para disparar.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-600 font-medium">
            Progresso: <strong>{sentSuccessCount}</strong> de <strong>{targetAlerts.length}</strong> mensagens processadas
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
