import React, { useState } from 'react';
import {
  X,
  MessageCircle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { storageService } from '../data/storageService';

interface WhatsAppIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppIntegrationModal: React.FC<WhatsAppIntegrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeSchoolName = storageService.getActiveSchool()?.name || 'Unidade Escolar';
  const [testPhone, setTestPhone] = useState('11987654321');
  const [testMessage, setTestMessage] = useState(
    `Prezado(a) responsável, informamos que o(a) estudante atingiu a 3ª falta consecutiva na ${activeSchoolName}. A frequência diária é fundamental para a aprendizagem. Favor entrar em contato com a coordenação pedagógica.`
  );
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const cleanPhone = testPhone.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  const directWaUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(testMessage)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directWaUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Envio de Comunicados via WhatsApp
              </h3>
              <p className="text-xs text-slate-500">
                Simulador e gerador oficial de links WhatsApp Web (wa.me) para {activeSchoolName}
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 leading-relaxed">
            <div className="font-bold flex items-center gap-1.5 text-sm mb-1 text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Envio Imediato Ativo (WhatsApp Web / wa.me)</span>
            </div>
            O sistema gera automaticamente links oficiais do WhatsApp com a mensagem personalizada para os responsáveis. Nos módulos de <strong>Alertas</strong>, <strong>Busca Ativa</strong> e <strong>Ocorrências</strong>, basta clicar para abrir a conversa no computador ou celular com 1 clique, sem mensalidades nem necessidade de servidores externos.
          </div>

          {/* Interactive Simulator */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span>Simulador de Envio aos Responsáveis</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Telefone com WhatsApp do Responsável:
                </label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="Ex: 11987654321"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Link Oficial Gerado:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={directWaUrl}
                    className="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono text-[11px] text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 font-semibold cursor-pointer"
                    title="Copiar link"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Modelo de Mensagem:
              </label>
              <textarea
                rows={4}
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            <div className="flex justify-end pt-1">
              <a
                href={directWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-2 shadow-xs transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Testar e Abrir no WhatsApp Web / Celular</span>
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Comunicação escolar em conformidade com o ECA e a LGPD
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg cursor-pointer text-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
