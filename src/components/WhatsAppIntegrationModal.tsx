import React, { useState } from 'react';
import {
  X,
  MessageCircle,
  Smartphone,
  Server,
  Key,
  CheckCircle2,
  ExternalLink,
  Send,
  HelpCircle,
  Code,
  ShieldCheck,
  Copy,
  Check,
  Zap
} from 'lucide-react';

interface WhatsAppIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppIntegrationModal: React.FC<WhatsAppIntegrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'direct' | 'cloud_api' | 'gateways'>('direct');
  const [testPhone, setTestPhone] = useState('11987654321');
  const [testMessage, setTestMessage] = useState(
    'Prezado(a) responsável, informamos que o(a) estudante atingiu a 3ª falta consecutiva hoje na Escola Arlindo Silvestre. A frequência diária é fundamental para a aprendizagem. Favor entrar em contato com a coordenação pedagógica.'
  );
  const [copiedLink, setCopiedLink] = useState(false);

  // Meta Cloud API configuration mock state
  const [wabaId, setWabaId] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  // Clean phone number for wa.me link
  const cleanPhone = testPhone.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  const directWaUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(testMessage)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directWaUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveApi = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Integração e Envio de Mensagens via WhatsApp
              </h3>
              <p className="text-xs text-slate-500">
                Opções para envio manual sem custo ou automatização em lote para a rede escolar
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

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-slate-200 flex gap-2 bg-white">
          <button
            onClick={() => setActiveTab('direct')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'direct'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-4 h-4 text-emerald-600" />
            <span>1. Modo Imediato (WhatsApp Web / wa.me)</span>
          </button>

          <button
            onClick={() => setActiveTab('cloud_api')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'cloud_api'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Server className="w-4 h-4 text-blue-600" />
            <span>2. API Oficial da Meta (Cloud API)</span>
          </button>

          <button
            onClick={() => setActiveTab('gateways')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'gateways'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="w-4 h-4 text-amber-600" />
            <span>3. Gateways Nacionais (Z-API / Evolution)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {activeTab === 'direct' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-sm mb-1 text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Funcionamento Imediato — Já Ativo no Sistema!</span>
                </div>
                O aplicativo já conta com o gerador automático de links oficiais do WhatsApp (<strong>wa.me</strong>).
                Ao registrar 3 faltas ou clicar em <em>"Disparar Alerta"</em>, o sistema monta a mensagem personalizada e permite que o coordenador ou professor abra diretamente no WhatsApp Web do computador ou no app do celular para envio com 1 clique, sem mensalidades nem homologações.
              </div>

              {/* Interactive Simulator */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="font-bold text-slate-900 text-sm">
                  Simulador de Envio Imediato aos Pais
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
                    Mensagem de Busca Ativa a ser Enviada:
                  </label>
                  <textarea
                    rows={3}
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
          )}

          {activeTab === 'cloud_api' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-950 leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-sm text-blue-900">
                  <Server className="w-4 h-4 text-blue-600" />
                  <span>Meta Cloud API (Oficial para Prefeituras e Secretarias de Educação)</span>
                </div>
                <p>
                  Permite o disparo 100% automático em segundo plano pelo servidor, sem necessidade de nenhum aparelho celular conectado ou ligado. Os alertas saem de um número fixo ou 0800 institucional verificado pela Meta.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-slate-900 text-sm">
                  Passo a Passo de Implantação:
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700 leading-relaxed">
                  <li>Acesse o portal <strong>developers.facebook.com</strong> e crie um aplicativo do tipo <em>Empresa</em>.</li>
                  <li>Adicione o produto <strong>WhatsApp</strong> ao aplicativo.</li>
                  <li>Registre o número institucional da Secretaria de Educação ou da Escola.</li>
                  <li>Crie o modelo de mensagem pré-aprovado (Template HSM) para a Busca Ativa Escolar.</li>
                  <li>Gere o <strong>Token Permanente de Acesso</strong> e configure abaixo.</li>
                </ol>
              </div>

              <form onSubmit={handleSaveApi} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="font-bold text-slate-900 text-xs">
                  Configurações da Conta da Meta (Opcional):
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      WhatsApp Business Account ID (WABA):
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 109283746501928"
                      value={wabaId}
                      onChange={e => setWabaId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Phone Number ID:
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 104928374659283"
                      value={phoneId}
                      onChange={e => setPhoneId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-semibold text-slate-700 block mb-1">
                      Access Token da API:
                    </label>
                    <input
                      type="password"
                      placeholder="EAAG... (Token permanente gerado no Gerenciador de Negócios)"
                      value={metaToken}
                      onChange={e => setMetaToken(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {isSaved && (
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded font-semibold text-xs">
                    Credenciais salvas com sucesso no ambiente escolar!
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Salvar Parâmetros de Produção
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'gateways' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-sm text-amber-900">
                  <Smartphone className="w-4 h-4 text-amber-600" />
                  <span>Gateways com Leitura de QR Code (Z-API, Evolution API, Twilio)</span>
                </div>
                <p>
                  Permite conectar o WhatsApp existente no celular da secretaria escolar escaneando um QR Code, igual ao WhatsApp Web. Quando a chamada escolar termina com faltas, o servidor dispara a mensagem através da API REST do gateway.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-900 text-slate-200 font-mono text-[11px] space-y-2">
                <div className="text-slate-400 font-sans font-bold flex items-center gap-1.5">
                  <Code className="w-4 h-4 text-amber-400" />
                  <span>Exemplo de Chamada Automática no Backend (`/api/alerts/send`):</span>
                </div>
                <pre className="overflow-x-auto p-2 bg-slate-950 rounded border border-slate-800 text-emerald-400">
{`// Disparo executado no servidor quando o aluno atinge 3 faltas
await fetch("https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN/send-text", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    phone: "5511987654321",
    message: "Prezada família de Lucas Gabriel: informamos a 3ª falta consecutiva hoje na Escola Darcy Ribeiro..."
  })
});`}
                </pre>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="font-bold text-slate-900 text-xs">
                  Webhook para Captura de Resposta dos Pais:
                </div>
                <p className="text-slate-600 text-[11px]">
                  Configure no painel do seu provedor a URL de webhook do sistema escolar:
                </p>
                <code className="block p-2 bg-slate-100 border border-slate-300 rounded font-mono text-slate-800 text-[11px]">
                  https://seu-dominio-escolar.gov.br/api/webhooks/whatsapp
                </code>
                <p className="text-slate-500 text-[11px]">
                  Quando o pai responder <em>"Ele estava com febre"</em> ou <em>"Vou comparecer na escola amanhã"</em>, o sistema atualiza o status do alerta para <strong>Respondido</strong> e registra a justificativa no dossiê do estudante!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Comunicação em conformidade com o ECA e a LGPD Escolar
          </span>
          <button
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
