import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Smartphone,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Users,
  Copy,
  Check,
  Phone,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { ParentAlert } from '../types';
import { getStudentPhones } from '../utils/phoneUtils';
import { storageService } from '../data/storageService';

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
  const whatsappAlerts = alerts.filter(a => a.channel === 'whatsapp');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [sendLogs, setSendLogs] = useState<
    Record<string, { status: 'pending' | 'success'; msg?: string; time?: string }>
  >({});

  const wasOpenRef = useRef<boolean>(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSelectedIds(whatsappAlerts.map(a => a.id));
      setCurrentIndex(0);
      setSendLogs({});
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, whatsappAlerts]);

  if (!isOpen) return null;

  const activeSchoolName = storageService.getActiveSchool()?.name || 'Unidade Escolar';
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
    const critical = whatsappAlerts
      .filter(a => a.triggerReason === '3_faltas_consecutivas')
      .map(a => a.id);
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
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();

    setSendLogs(prev => ({
      ...prev,
      [alert.id]: {
        status: 'success',
        msg: 'Aberto no WhatsApp Web',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      },
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

  const sentSuccessCount = Object.values(sendLogs).filter((l: { status: string }) => l.status === 'success').length;

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
                {activeSchoolName} • Fila guiada de comunicados e Busca Ativa via WhatsApp Web
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between bg-white flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>Envio Guiado via WhatsApp Web (1 Clique por Estudante)</span>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer font-semibold select-none text-xs text-slate-600">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={e => setAutoAdvance(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Avançar para o próximo estudante automaticamente após abrir</span>
          </label>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {whatsappAlerts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <MessageSquare className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="font-bold text-slate-700">Nenhum alerta de WhatsApp na fila atual</p>
              <p className="text-xs mt-1">
                Gere novos alertas a partir do lançamento diário de ausências ou emita alertas manuais.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-bold block text-emerald-900">
                    Envio 1-a-1 Assistido pelo Navegador (Sem custo de API):
                  </span>
                  <p className="text-[11px] text-slate-700">
                    Ao clicar em <strong>"Abrir no WhatsApp Web e Avançar"</strong>, a conversa já abre com a mensagem oficial pronta para o responsável, registra o alerta como entregue e avança automaticamente para o próximo estudante da fila.
                  </p>
                </div>
              </div>

              {/* Layout in 2 columns */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Lista lateral de destinatários */}
                <div className="md:col-span-5 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[440px] bg-white">
                  <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
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

                  <div className="divide-y divide-slate-100 overflow-y-auto flex-1 p-1">
                    {whatsappAlerts.map(alert => {
                      const isSelected = selectedIds.includes(alert.id);
                      const log = sendLogs[alert.id];
                      const isDelivered =
                        alert.status === 'entregue' ||
                        alert.status === 'lido' ||
                        alert.status === 'respondido' ||
                        log?.status === 'success';
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
                            onChange={e => {
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
                            <div className="text-[11px] text-slate-500 truncate">
                              Resp: {alert.guardianName}
                            </div>
                          </div>

                          {isDelivered ? (
                            <span className="shrink-0 text-emerald-700 text-[10px] font-bold flex items-center gap-1 bg-emerald-100 px-1.5 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Enviado</span>
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

                {/* Painel Central / Preview & Execução */}
                <div className="md:col-span-7 flex flex-col space-y-4">
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
                                <span>
                                  Destinatário: <strong>{currentAlert.guardianName}</strong>
                                </span>
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
                            {copiedId === currentAlert.id ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedId === currentAlert.id ? 'Copiado!' : 'Copiar Texto'}</span>
                          </button>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-300 text-xs text-slate-800 leading-relaxed overflow-y-auto max-h-[160px] whitespace-pre-line shadow-2xs">
                          {currentAlert.messageContent}
                        </div>
                      </div>

                      {/* Controles */}
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

                        {(() => {
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
