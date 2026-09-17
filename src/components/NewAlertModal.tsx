import React, { useState, useEffect } from 'react';
import { X, Send, Smartphone, MessageSquare, Phone, AlertTriangle, Sparkles } from 'lucide-react';
import { Student, AlertChannel, AlertTrigger } from '../types';

interface NewAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  preSelectedStudent?: Student | null;
  onSendAlert: (alertData: {
    studentId: string;
    channel: AlertChannel;
    messageContent: string;
    triggerReason?: AlertTrigger;
    triggerLabel?: string;
  }) => Promise<void>;
}

export const NewAlertModal: React.FC<NewAlertModalProps> = ({
  isOpen,
  onClose,
  students,
  preSelectedStudent,
  onSendAlert,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [channel, setChannel] = useState<AlertChannel>('whatsapp');
  const [triggerType, setTriggerType] = useState<AlertTrigger>('3_faltas_consecutivas');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const activeStudent = students.find(s => s.id === selectedStudentId) || preSelectedStudent || students[0];

  useEffect(() => {
    if (preSelectedStudent) {
      setSelectedStudentId(preSelectedStudent.id);
    } else if (students.length > 0 && !selectedStudentId) {
      setSelectedStudentId(students[0].id);
    }
  }, [preSelectedStudent, students]);

  // Generate template message based on trigger and student
  useEffect(() => {
    if (!activeStudent) return;

    if (triggerType === '1_falta') {
      setMessage(
        `Prezado(a) ${activeStudent.guardianName}, informamos que o(a) estudante ${activeStudent.name} (${activeStudent.className}) faltou às aulas hoje na Escola Arlindo Silvestre. A presença diária é fundamental para o acompanhamento dos conteúdos pedagógicos. Caso a ausência tenha ocorrido por motivo de força maior, pedimos a gentileza de comunicar a secretaria escolar.`
      );
    } else if (triggerType === '2_faltas_consecutivas') {
      setMessage(
        `Aviso Escolar - Escola Arlindo Silvestre: Prezado(a) ${activeStudent.guardianName}, o(a) estudante ${activeStudent.name} (${activeStudent.className}) registrou sua 2ª falta consecutiva hoje. Solicitamos atenção para evitar prejuízos na rotina de estudos. Caso necessite de apoio ou esclarecimentos, entre em contato com nossa equipe.`
      );
    } else if (triggerType === '3_faltas_consecutivas') {
      setMessage(
        `Alerta de Infrequência - Escola Arlindo Silvestre: Prezado(a) ${activeStudent.guardianName}, informamos que o(a) estudante ${activeStudent.name} (${activeStudent.className}) registrou a 3ª falta consecutiva. De acordo com os protocolos pedagógicos, solicitamos comparecimento ou contato urgente com a coordenação para alinhamento e justificativa da ausência.`
      );
    } else if (triggerType === 'mais_de_3_conselho_tutelar') {
      setMessage(
        `NOTIFICAÇÃO URGENTE - Escola Arlindo Silvestre: Prezado(a) ${activeStudent.guardianName}, o(a) estudante ${activeStudent.name} (${activeStudent.className}) ultrapassou o limite de 3 faltas consecutivas sem justificativa formal (${activeStudent.consecutiveAbsences} faltas). Conforme prevê o Estatuto da Criança e do Adolescente (ECA) e a LDB, caso não haja comparecimento imediato na escola, o caso será encaminhado ao Conselho Tutelar e à Rede de Proteção.`
      );
    } else if (triggerType === 'dias_alternados_baixa_frequencia') {
      setMessage(
        `Acompanhamento de Frequência - Escola Arlindo Silvestre: Prezado(a) ${activeStudent.guardianName}, identificamos um padrão de faltas alternadas ou chegadas tardias/saídas antecipadas do(a) estudante ${activeStudent.name} (${activeStudent.className}), resultando em baixa frequência acumulada (${activeStudent.attendanceRate}%). Solicitamos agendamento com a orientação pedagógica para regularização do horário escolar.`
      );
    } else if (triggerType === 'frequencia_abaixo_75') {
      setMessage(
        `URGENTE - RISCO DE REPROVAÇÃO POR INFREQUÊNCIA: Prezado(a) ${activeStudent.guardianName}, o(a) estudante ${activeStudent.name} atingiu a marca de ${activeStudent.attendanceRate}% de frequência acumulada na Escola Arlindo Silvestre, ficando abaixo do mínimo legal de 75% exigido pela LDB. Convocamos a família com urgência para reunião de alinhamento com a equipe gestora.`
      );
    } else if (triggerType === '5_faltas_mes') {
      setMessage(
        `Aviso de Frequência - Escola Arlindo Silvestre: O(A) estudante ${activeStudent.name} acumulou mais de 5 faltas no período letivo recente. Pedimos que a família responda a esta mensagem informando o motivo para que a escola possa ofertar o devido suporte pedagógico.`
      );
    } else {
      setMessage(
        `Olá ${activeStudent.guardianName}, aqui é da coordenação da Escola Arlindo Silvestre. Gostaríamos de conversar sobre a frequência escolar e o rendimento pedagógico de ${activeStudent.name}. Solicitamos que responda a esta mensagem ou nos ligue.`
      );
    }
  }, [activeStudent, triggerType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent) return;

    setIsSending(true);
    try {
      let label = 'Alerta Pedagógico aos Responsáveis';
      if (triggerType === '1_falta') label = '1 Falta Registrada';
      if (triggerType === '2_faltas_consecutivas') label = '2 Faltas Consecutivas';
      if (triggerType === '3_faltas_consecutivas') label = '3 Faltas Consecutivas';
      if (triggerType === 'mais_de_3_conselho_tutelar') label = '+ de 3 Faltas (Encaminhamento Conselho Tutelar)';
      if (triggerType === 'dias_alternados_baixa_frequencia') label = 'Dias Alternados / Baixa Frequência';
      if (triggerType === 'frequencia_abaixo_75') label = 'Frequência Abaixo de 75% (Evasão Iminente)';
      if (triggerType === '5_faltas_mes') label = 'Infrequência Acumulada no Mês';

      await onSendAlert({
        studentId: activeStudent.id,
        channel,
        messageContent: message,
        triggerReason: triggerType,
        triggerLabel: label,
      });
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Emissão de Alerta aos Responsáveis
              </h3>
              <p className="text-xs text-slate-500">
                Notificação direta e acolhedora para conter a evasão escolar
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Student Selector */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">Selecione o Estudante:</label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.className}) — Resp: {s.guardianName} ({s.guardianPhone})
                </option>
              ))}
            </select>
          </div>

          {/* Trigger template selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Gatilho / Motivo do Alerta:</label>
              <select
                value={triggerType}
                onChange={e => setTriggerType(e.target.value as AlertTrigger)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                <option value="1_falta">1 Falta (Aviso do Dia)</option>
                <option value="2_faltas_consecutivas">2 Faltas Consecutivas (Alerta Prévio)</option>
                <option value="3_faltas_consecutivas">3 Faltas Consecutivas (Convocação Escolar)</option>
                <option value="mais_de_3_conselho_tutelar">+ de 3 Faltas (Encaminhado ao Conselho Tutelar)</option>
                <option value="dias_alternados_baixa_frequencia">Dias Alternados ou Baixa Frequência / Atrasos</option>
                <option value="frequencia_abaixo_75">Frequência Abaixo de 75% (Crítico LDB)</option>
                <option value="5_faltas_mes">Infrequência Acumulada no Mês (&gt; 5)</option>
                <option value="alerta_manual">Convocação / Mensagem Personalizada</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Canal de Envio:</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setChannel('whatsapp')}
                  className={`flex-1 p-2 rounded-lg font-bold border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                    channel === 'whatsapp'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChannel('sms')}
                  className={`flex-1 p-2 rounded-lg font-bold border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                    channel === 'sms'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>SMS</span>
                </button>
              </div>
            </div>
          </div>

          {/* Recipient info summary */}
          {activeStudent && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-600 text-[11px] space-y-0.5">
              <div><strong>Destinatário:</strong> {activeStudent.guardianName} ({activeStudent.guardianRelationship})</div>
              <div><strong>Número de Contato:</strong> {activeStudent.guardianPhone}</div>
              <div><strong>Situação Atual:</strong> {activeStudent.consecutiveAbsences} faltas consecutivas • Taxa: {activeStudent.attendanceRate}%</div>
            </div>
          )}

          {/* Message textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">Texto da Mensagem Oficial:</label>
              <span className="text-[11px] text-slate-400">Pode ser editado antes do envio</span>
            </div>
            <textarea
              rows={5}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 font-normal leading-relaxed focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              required
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            {channel === 'whatsapp' && activeStudent && (
              <a
                href={`https://wa.me/55${activeStudent.guardianPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs mr-auto transition-colors"
                title="Abrir a conversa pré-formatada no WhatsApp"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Abrir no WhatsApp Web</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Emitindo...' : 'Registrar Envio no Sistema'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
