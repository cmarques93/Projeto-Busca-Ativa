import React from 'react';
import { AlertTriangle, CheckCircle2, Send, Smartphone, ShieldAlert, X, ArrowRight, Phone } from 'lucide-react';
import { ParentAlert } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { getStudentPhones } from '../utils/phoneUtils';

interface AutomatedAlertTriggerModalProps {
  alerts: ParentAlert[];
  onClose: () => void;
  onGoToAlerts: () => void;
  onGoToInterventions: () => void;
}

export const AutomatedAlertTriggerModal: React.FC<AutomatedAlertTriggerModalProps> = ({
  alerts,
  onClose,
  onGoToAlerts,
  onGoToInterventions,
}) => {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-6 py-4 bg-amber-500 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white text-amber-600 flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg leading-tight">
                  Alertas Automáticos de Evasão Disparados!
                </h3>
                <InfoTooltip
                  title="Mecanismo de Proteção Busca Ativa"
                  content="O sistema detectou infrequência crítica e emitiu notificações automáticas aos responsáveis legais via WhatsApp para assegurar resposta rápida e prevenir o abandono escolar."
                />
              </div>
              <p className="text-xs text-amber-100 font-medium mt-0.5">
                {alerts.length} {alerts.length === 1 ? 'estudante atingiu' : 'estudantes atingiram'} o limiar de faltas consecutivas
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-amber-100 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="space-y-3">
            {alerts.map(alt => (
              <div
                key={alt.id}
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{alt.studentName}</span>
                    <span className="bg-slate-200 text-slate-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {alt.className}
                    </span>
                  </div>
                  <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full text-[11px]">
                    {alt.triggerLabel}
                  </span>
                </div>

                {(() => {
                  const phones = getStudentPhones(alt.guardianPhone, alt.messageContent);
                  return (
                    <div className="text-slate-600 flex flex-wrap items-center gap-2 text-[11px]">
                      <span>Destinatário: <strong>{alt.guardianName}</strong></span>
                      <span>•</span>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-slate-500 font-medium">WhatsApp:</span>
                        {phones.map((p, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[10px] text-emerald-800 font-semibold"
                          >
                            <Phone className="w-2.5 h-2.5 text-emerald-600" />
                            <span>{p.formatted}</span>
                          </span>
                        ))}
                      </div>
                      <span>•</span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Disparo Realizado
                      </span>
                      <div className="flex items-center gap-1 ml-auto">
                        {phones.map((p, idx) => (
                          <a
                            key={idx}
                            href={p.whatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200"
                            title={`Abrir no WhatsApp (${p.formatted})`}
                          >
                            <Smartphone className="w-3 h-3" />
                            <span>WhatsApp {phones.length > 1 ? `#${idx + 1}` : ''}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-700 italic text-[11px] leading-relaxed">
                  "{alt.messageContent}"
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 text-[11px]">
            Casos instaurados no fluxo de intervenção da equipe pedagógica.
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                onClose();
                onGoToAlerts();
              }}
              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg cursor-pointer transition-colors"
            >
              Ver Central de Alertas
            </button>

            <button
              onClick={() => {
                onClose();
                onGoToInterventions();
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <span>Gerenciar Casos na Busca Ativa</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
