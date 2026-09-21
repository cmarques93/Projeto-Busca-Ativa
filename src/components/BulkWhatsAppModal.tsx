import React, { useState } from 'react';
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
  Phone
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
  const [selectedIds, setSelectedIds] = useState<string[]>(whatsappAlerts.map(a => a.id));
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [sentAlertIds, setSentAlertIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

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

  const targetAlerts = whatsappAlerts.filter(a => selectedIds.includes(a.id));
  const currentAlert = targetAlerts[currentIndex] || targetAlerts[0];

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
    if (!sentAlertIds.includes(alert.id)) {
      setSentAlertIds(prev => [...prev, alert.id]);
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  Disparo em Lote / Massa via WhatsApp
                </h3>
                <InfoTooltip
                  title="Envio em Massa no WhatsApp"
                  content="Para garantir que seu número escolar institucional não seja bloqueado por envio automatizado invasivo, o sistema prepara a mensagem personalizada de cada estudante. Basta clicar em 'Enviar via WhatsApp' para abrir a conversa com a mensagem já pré-preenchida."
                />
              </div>
              <p className="text-xs text-slate-500">
                Escola Arlindo Silvestre • Fila sequencial de envio assistido e link direto para os responsáveis
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {whatsappAlerts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <MessageSquare className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="font-bold text-slate-700">Nenhum alerta de WhatsApp na fila atual</p>
              <p className="text-xs mt-1">Gere novos alertas a partir do lançamento diário ou emita alertas manuais.</p>
            </div>
          ) : (
            <>
              {/* Layout in 2 columns: List on left, active preview & sender on right */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* List of queue items */}
                <div className="md:col-span-5 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[420px]">
                  <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === whatsappAlerts.length && whatsappAlerts.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Fila de Destinatários ({targetAlerts.length}/{whatsappAlerts.length})</span>
                    </label>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto flex-1 p-1">
                    {whatsappAlerts.map((alert, idx) => {
                      const isSelected = selectedIds.includes(alert.id);
                      const isSent = sentAlertIds.includes(alert.id) || alert.status === 'entregue' || alert.status === 'lido' || alert.status === 'respondido';
                      const isCurrentlyActive = currentAlert?.id === alert.id;

                      return (
                        <div
                          key={alert.id}
                          className={`p-2.5 rounded-lg flex items-center gap-2.5 text-xs transition-colors cursor-pointer ${
                            isCurrentlyActive
                              ? 'bg-emerald-50/80 border border-emerald-300'
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

                          {isSent ? (
                            <span className="shrink-0 text-emerald-600 text-[10px] font-bold flex items-center gap-0.5 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Enviado</span>
                            </span>
                          ) : (
                            <span className="shrink-0 text-amber-700 text-[10px] font-medium bg-amber-100/70 px-1.5 py-0.5 rounded">
                              Pendente
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sender card on right */}
                <div className="md:col-span-7 flex flex-col">
                  {currentAlert ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col h-full">
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
                                  {phones.length > 1 && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                                      {phones.length} contatos
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          {currentAlert.triggerLabel}
                        </span>
                      </div>

                      {/* Message body preview */}
                      <div className="my-3 flex-1 flex flex-col">
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                          <span>Texto Personalizado:</span>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(currentAlert)}
                            className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-semibold normal-case text-xs cursor-pointer"
                          >
                            {copiedId === currentAlert.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedId === currentAlert.id ? 'Copiado!' : 'Copiar Texto'}</span>
                          </button>
                        </label>
                        <div className="bg-white p-3.5 rounded-lg border border-slate-300 text-xs text-slate-800 font-normal leading-relaxed overflow-y-auto max-h-[160px] whitespace-pre-line shadow-2xs">
                          {currentAlert.messageContent}
                        </div>
                      </div>

                      {/* Controls and navigation */}
                      <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentIndex === 0}
                            onClick={handlePrev}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-xs disabled:opacity-40 cursor-pointer"
                          >
                            Anterior
                          </button>
                          <span className="text-xs text-slate-500 font-medium">
                            {currentIndex + 1} de {targetAlerts.length}
                          </span>
                          <button
                            type="button"
                            disabled={currentIndex >= targetAlerts.length - 1}
                            onClick={handleNext}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-xs disabled:opacity-40 cursor-pointer"
                          >
                            Próximo
                          </button>
                        </div>

                        {(() => {
                          const phones = getStudentPhones(currentAlert.guardianPhone);
                          if (phones.length <= 1) {
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  handleOpenWhatsApp(currentAlert, 0);
                                  if (currentIndex < targetAlerts.length - 1) {
                                    setTimeout(() => handleNext(), 500);
                                  }
                                }}
                                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                              >
                                <Smartphone className="w-4 h-4" />
                                <span>Enviar no WhatsApp e Avançar</span>
                              </button>
                            );
                          }

                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              {phones.map((p, pIdx) => (
                                <button
                                  key={pIdx}
                                  type="button"
                                  onClick={() => {
                                    handleOpenWhatsApp(currentAlert, pIdx);
                                    if (pIdx === phones.length - 1 && currentIndex < targetAlerts.length - 1) {
                                      setTimeout(() => handleNext(), 600);
                                    }
                                  }}
                                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                                  title={`Enviar para o contato #${pIdx + 1}: ${p.formatted}`}
                                >
                                  <Smartphone className="w-3.5 h-3.5" />
                                  <span>Enviar Tel {pIdx + 1} ({p.formatted})</span>
                                </button>
                              ))}
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
          <span className="text-slate-500">
            {sentAlertIds.length} de {targetAlerts.length} mensagens disparadas nesta sessão
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
