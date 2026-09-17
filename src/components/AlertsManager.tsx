import React, { useState } from 'react';
import {
  BellRing,
  CheckCircle,
  Clock,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Smartphone,
  ExternalLink,
  Search,
  Filter,
  CheckCheck,
  AlertCircle,
  Users
} from 'lucide-react';
import { ParentAlert, AlertStatus } from '../types';
import { BulkWhatsAppModal } from './BulkWhatsAppModal';

interface AlertsManagerProps {
  alerts: ParentAlert[];
  onUpdateAlertStatus: (alertId: string, status: AlertStatus, feedback?: string) => Promise<void>;
  onOpenNewAlertModal: () => void;
  onOpenStudentDetail: (studentId: string) => void;
}

export const AlertsManager: React.FC<AlertsManagerProps> = ({
  alerts,
  onUpdateAlertStatus,
  onOpenNewAlertModal,
  onOpenStudentDetail,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterChannel, setFilterChannel] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAlertForReply, setSelectedAlertForReply] = useState<ParentAlert | null>(null);
  const [customReplyText, setCustomReplyText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);

  const filteredAlerts = alerts.filter(a => {
    const matchesStatus = filterStatus === 'todos' || a.status === filterStatus;
    const matchesChannel = filterChannel === 'todos' || a.channel === filterChannel;
    const matchesSearch =
      a.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.guardianName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.className.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.triggerLabel.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesChannel && matchesSearch;
  });

  const totalAlerts = alerts.length;
  const deliveredCount = alerts.filter(a => a.status === 'entregue' || a.status === 'lido' || a.status === 'respondido').length;
  const readCount = alerts.filter(a => a.status === 'lido' || a.status === 'respondido').length;
  const respondedCount = alerts.filter(a => a.status === 'respondido' || a.guardianFeedback).length;

  const responseRate = totalAlerts > 0 ? ((respondedCount / totalAlerts) * 100).toFixed(0) : '0';

  const handleSimulateStatus = async (alertId: string, status: AlertStatus, defaultFeedback?: string) => {
    setIsUpdating(true);
    try {
      await onUpdateAlertStatus(alertId, status, defaultFeedback);
      if (selectedAlertForReply?.id === alertId) {
        setSelectedAlertForReply(null);
        setCustomReplyText('');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Cards */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 uppercase tracking-wider">
              <span>Disparador de Alertas Escolares</span>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              Central de Comunicação com Responsáveis
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Notificações automáticas via WhatsApp e SMS para alertar pais sobre ausências reiteradas e risco de evasão.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setIsBulkWhatsAppOpen(true)}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              title="Disparo sequencial e fila em massa para WhatsApp"
            >
              <Smartphone className="w-4 h-4" />
              <span>Envio em Massa (WhatsApp)</span>
            </button>

            <button
              onClick={onOpenNewAlertModal}
              className="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Emitir Alerta Manual</span>
            </button>
          </div>
        </div>

        {/* Metric tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <div className="text-xs text-slate-500 font-medium">Total de Alertas Emitidos</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalAlerts}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Gatilho automático e manual</div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3.5">
            <div className="text-xs text-blue-700 font-medium">Entregues com Sucesso</div>
            <div className="text-2xl font-extrabold text-blue-950 mt-1">{deliveredCount}</div>
            <div className="text-[11px] text-blue-700 mt-0.5">Confirmação de operadora</div>
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3.5">
            <div className="text-xs text-indigo-700 font-medium">Lidos pelos Pais</div>
            <div className="text-2xl font-extrabold text-indigo-950 mt-1">{readCount}</div>
            <div className="text-[11px] text-indigo-700 mt-0.5">Confirmação de leitura no app</div>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3.5">
            <div className="text-xs text-emerald-700 font-medium">Taxa de Resposta / Retorno</div>
            <div className="text-2xl font-extrabold text-emerald-950 mt-1">{responseRate}%</div>
            <div className="text-[11px] text-emerald-700 mt-0.5">{respondedCount} respostas registradas</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por estudante, responsável ou turma..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterChannel}
            onChange={e => setFilterChannel(e.target.value)}
            className="text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
          >
            <option value="todos">Todos os Canais</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="ligacao">Ligação Telefônica</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
          >
            <option value="todos">Todos os Status</option>
            <option value="enviado">Enviado</option>
            <option value="entregue">Entregue</option>
            <option value="lido">Lido</option>
            <option value="respondido">Respondido pelos Pais</option>
          </select>
        </div>
      </div>

      {/* Feed of Alerts */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            Nenhum alerta encontrado com os filtros atuais.
          </div>
        ) : (
          filteredAlerts.map(alert => {
            const isWhatsApp = alert.channel === 'whatsapp';
            const hasFeedback = Boolean(alert.guardianFeedback);

            return (
              <div
                key={alert.id}
                className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isWhatsApp
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {isWhatsApp ? (
                        <Smartphone className="w-5 h-5" />
                      ) : (
                        <MessageSquare className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => onOpenStudentDetail(alert.studentId)}
                          className="font-bold text-slate-900 hover:text-indigo-600 transition-colors text-base text-left"
                        >
                          {alert.studentName}
                        </button>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {alert.className}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          {alert.triggerLabel}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                        <span className="font-medium text-slate-700">
                          Destinatário: {alert.guardianName} ({alert.guardianPhone})
                        </span>
                        <span>•</span>
                        <span>Canal: {alert.channel.toUpperCase()}</span>
                        <span>•</span>
                        <span>
                          Enviado em: {new Date(alert.sentAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2 self-start">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                        alert.status === 'respondido'
                          ? 'bg-emerald-100 text-emerald-800'
                          : alert.status === 'lido'
                          ? 'bg-indigo-100 text-indigo-800'
                          : alert.status === 'entregue'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {alert.status === 'respondido' && <CheckCheck className="w-3.5 h-3.5" />}
                      {alert.status === 'lido' && <CheckCheck className="w-3.5 h-3.5" />}
                      {alert.status === 'entregue' && <CheckCircle className="w-3.5 h-3.5" />}
                      {alert.status === 'enviado' && <Clock className="w-3.5 h-3.5" />}
                      <span className="capitalize">{alert.status}</span>
                    </span>
                  </div>
                </div>

                {/* Message Content Bubble */}
                <div className="mt-3.5 bg-slate-50 rounded-lg p-3.5 border border-slate-200/80 text-xs sm:text-sm text-slate-800 leading-relaxed font-normal">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span>Conteúdo da Notificação Enviada</span>
                  </div>
                  <p className="whitespace-pre-line">{alert.messageContent}</p>
                </div>

                {/* Guardian Feedback section if present */}
                {hasFeedback && (
                  <div className="mt-3 bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-xs sm:text-sm text-emerald-950">
                    <div className="font-bold text-emerald-900 text-xs flex items-center gap-1.5 mb-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Retorno dos Responsáveis / Justificativa:</span>
                    </div>
                    <p className="italic">"{alert.guardianFeedback}"</p>
                  </div>
                )}

                {/* Action Bar / Simulation Controls */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="font-semibold text-slate-600">Simulador de Interação:</span>
                    {alert.status === 'enviado' && (
                      <button
                        onClick={() => handleSimulateStatus(alert.id, 'entregue')}
                        disabled={isUpdating}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
                      >
                        Marcar Entregue
                      </button>
                    )}
                    {(alert.status === 'enviado' || alert.status === 'entregue') && (
                      <button
                        onClick={() => handleSimulateStatus(alert.id, 'lido')}
                        disabled={isUpdating}
                        className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium cursor-pointer"
                      >
                        Simular Confirmação de Leitura
                      </button>
                    )}
                    <button
                      onClick={() =>
                        handleSimulateStatus(
                          alert.id,
                          'respondido',
                          'Responsável ligou informando que o aluno estava com febre e levará o atestado amanhã.'
                        )
                      }
                      disabled={isUpdating}
                      className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium cursor-pointer"
                    >
                      Simular Resposta Positiva
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {alert.channel === 'whatsapp' && (
                      <a
                        href={`https://wa.me/55${alert.guardianPhone.replace(/\D/g, '')}?text=${encodeURIComponent(alert.messageContent)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                        title="Abrir mensagem pré-formatada no WhatsApp Web / Celular"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Abrir no WhatsApp</span>
                      </a>
                    )}

                    <button
                      onClick={() => onOpenStudentDetail(alert.studentId)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Abrir Ficha de Busca Ativa</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bulk WhatsApp Modal */}
      <BulkWhatsAppModal
        isOpen={isBulkWhatsAppOpen}
        onClose={() => setIsBulkWhatsAppOpen(false)}
        alerts={alerts}
        onMarkAsDelivered={async (alertId) => {
          await onUpdateAlertStatus(alertId, 'entregue');
        }}
      />
    </div>
  );
};
