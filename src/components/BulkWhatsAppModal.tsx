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
  ChevronLeft
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

  // Modes: 'background_auto' (100% automático no servidor) vs 'assisted_web' (1-a-1 via wa.me)
  const [mode, setMode] = useState<'background_auto' | 'assisted_web'>('background_auto');

  // Automatic background dispatch state
  const [isAutoSending, setIsAutoSending] = useState(false);
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [sendLogs, setSendLogs] = useState<Record<string, { status: 'pending' | 'sending' | 'success' | 'error'; msg?: string; time?: string }>>({});
  const [antiSpamDelay, setAntiSpamDelay] = useState<number>(15); // Padrão seguro de 15 segundos para proteção anti-spam
  const isCancelledRef = useRef<boolean>(false);

  // Inicializa a seleção ao abrir
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(whatsappAlerts.map(a => a.id));
      setCurrentIndex(0);
      setIsAutoSending(false);
      isCancelledRef.current = false;
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

  const handleOpenWhatsApp = async (alert: ParentAlert, phoneIndex = 0) => {
    const url = getWaLink(alert, phoneIndex);
    window.open(url, '_blank');
    setSendLogs(prev => ({
      ...prev,
      [alert.id]: { status: 'success', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
    }));
    await onMarkAsDelivered(alert.id);
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

  // --- DISPARO AUTOMÁTICO EM SEGUNDO PLANO (SEM ABRIR WHATSAPP WEB) ---
  const handleStartAutoDispatch = async () => {
    if (targetAlerts.length === 0) return;

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
        [alert.id]: { status: 'sending', msg: 'Enviando em segundo plano...' }
      }));

      try {
        // Envia para endpoint backend
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

        if (res.ok) {
          await onMarkAsDelivered(alert.id);
          setSendLogs(prev => ({
            ...prev,
            [alert.id]: {
              status: 'success',
              msg: 'Entregue com sucesso',
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            }
          }));
        } else {
          setSendLogs(prev => ({
            ...prev,
            [alert.id]: { status: 'error', msg: 'Falha no envio' }
          }));
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
                EE Professor Arlindo Silvestre • Disparo em massa com cadência segura anti-spam e integração direta
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
              onClick={() => setMode('background_auto')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                mode === 'background_auto'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Zap className="w-4 h-4 text-emerald-600" />
              <span>1. Disparo Automático em Segundo Plano (Sem abrir abas)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('assisted_web')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                mode === 'assisted_web'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>2. Fila Assistida (WhatsApp Web / wa.me 1-a-1)</span>
            </button>
          </div>

          {/* Anti-spam delay control */}
          <div className="pb-2 flex items-center gap-1.5 text-xs text-slate-600">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-semibold text-[11px]">Intervalo Anti-Spam:</span>
            <select
              value={antiSpamDelay}
              onChange={e => setAntiSpamDelay(Number(e.target.value))}
              disabled={isAutoSending}
              className="bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800"
            >
              <option value={15}>15 segundos (Recomendado • Proteção Anti-Spam Alta)</option>
              <option value={20}>20 segundos (Altamente Seguro)</option>
              <option value={30}>30 segundos (Máxima Blindagem)</option>
              <option value={10}>10 segundos (Moderado)</option>
              <option value={5}>5 segundos (Rápido)</option>
            </select>
          </div>
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
              {/* Informativo Anti-Spam */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-bold block text-emerald-900">
                    Como funciona a proteção contra bloqueios e Spam da Meta:
                  </span>
                  <p className="text-[11px] text-slate-600">
                    O WhatsApp não permite envio instantâneo massivo sem intervalo no mesmo segundo. O sistema aplica cadência inteligente de {antiSpamDelay}s entre mensagens com textos personalizados por aluno, evitando que o número institucional seja bloqueado.
                  </p>
                </div>
              </div>

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
                            <span className="shrink-0 text-rose-700 text-[10px] font-bold bg-rose-100 px-1.5 py-0.5 rounded">
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
                  {/* Bloco de Disparo Automático em Lote */}
                  {mode === 'background_auto' && (
                    <div className="bg-emerald-950 text-white rounded-xl p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <span className="font-bold text-sm text-white">
                            Disparo Automático Contínuo
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-300 font-mono">
                          {autoProgress.current} de {autoProgress.total} processados
                        </span>
                      </div>

                      {/* Barra de Progresso */}
                      <div className="w-full bg-emerald-900 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-emerald-200">
                          {isAutoSending
                            ? `Disparando mensagem para ${currentAlert?.studentName || 'estudante'}...`
                            : sentSuccessCount > 0
                            ? `✅ Disparo finalizado: ${sentSuccessCount} alertas enviados!`
                            : 'Pronto para iniciar envio em segundo plano.'}
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
                            Texto do Alerta:
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
                            <button
                              type="button"
                              onClick={() => handleOpenWhatsApp(currentAlert, 0)}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                              <span>Abrir no WhatsApp Web ({currentAlert.studentName.split(' ')[0]})</span>
                            </button>
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
            Status: {sentSuccessCount} de {targetAlerts.length} mensagens disparadas com sucesso
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
