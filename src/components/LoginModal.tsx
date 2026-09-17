import React, { useState } from 'react';
import { Shield, KeyRound, User, Lock, CheckCircle, Info, X } from 'lucide-react';
import { UserRole, UserSession } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession;
  onSelectRole: (role: UserRole, customName?: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectRole,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentUser.role);
  const [customName, setCustomName] = useState(currentUser.name);
  const [password, setPassword] = useState('••••••••');

  if (!isOpen) return null;

  const roleDetails: Record<UserRole, {
    title: string;
    badge: string;
    description: string;
    permissions: string[];
    defaultName: string;
    color: string;
    badgeColor: string;
  }> = {
    gestao_paac: {
      title: 'Gestão / PAAC',
      badge: 'Acesso Total',
      description: 'Direção, Vice-Direção, Coordenação Pedagógica e Professor Articulador de Ações Comunitárias (PAAC).',
      permissions: [
        'Acesso irrestrito a todas as turmas e estudantes',
        'Lançamento de frequência diária e atestados',
        'Controle de portaria (entradas e saídas fora do horário)',
        'Disparo e gestão de alertas automáticos via WhatsApp',
        'Abertura e acompanhamento de casos de Busca Ativa',
        'Geração de relatórios mensais e plano de contingência SEDUC',
        'Cadastro de novos estudantes e importação em lote CSV'
      ],
      defaultName: 'Profª. Silvana Rocha (Coordenação / PAAC)',
      color: 'border-indigo-600 bg-indigo-50/40 text-indigo-950',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    },
    aoe: {
      title: 'AOE - Agente de Organização Escolar',
      badge: 'Secretaria & Portaria',
      description: 'Responsável pelo suporte operacional, registro pontual de frequências e controle de portaria.',
      permissions: [
        'Registro de frequências diárias e diário de classe',
        'Registro de entradas tardias e saídas antecipadas na portaria',
        'Lançamento de justificativas e atestados médicos apresentados na secretaria',
        'Visualização restrita das turmas operacionais'
      ],
      defaultName: 'Carlos Eduardo Mendes (AOE - Secretaria & Portaria)',
      color: 'border-blue-600 bg-blue-50/40 text-blue-950',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    professor: {
      title: 'Professor Regente / Docente',
      badge: 'Acesso Restrito',
      description: 'Docente em sala de aula com consulta estritamente focada no motivo das ausências e atestados médicos.',
      permissions: [
        'Consulta exclusiva ao motivo das ausências dos estudantes',
        'Visualização de justificativas e atestados médicos válidos',
        'Sem acesso a contatos privados de responsáveis ou alertas externos',
        'Sem acesso ao módulo de intervenções sigilosas de proteção social'
      ],
      defaultName: 'Prof. Rogério Silva (Língua Portuguesa / Matemática)',
      color: 'border-emerald-600 bg-emerald-50/40 text-emerald-950',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setCustomName(roleDetails[role].defaultName);
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    onSelectRole(selectedRole, customName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Autenticação & Controle de Acesso (RBAC)</h2>
              <p className="text-xs text-slate-300">EE Professor Arlindo Silvestre • Perfis Institucionais</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleConfirm} className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Definição de Perfis Conforme Diretrizes da Unidade Escolar:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                <li><strong>AOE:</strong> Apenas registro das frequências e entradas e saídas fora dos horários oficiais.</li>
                <li><strong>Gestão/PAAC:</strong> Acesso total a todas as funcionalidades, intervenções e relatórios.</li>
                <li><strong>Professor:</strong> Acesso restrito somente ao motivo das ausências e nada mais.</li>
              </ul>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
              Selecione o Perfil de Trabalho:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['gestao_paac', 'aoe', 'professor'] as UserRole[]).map(role => {
                const info = roleDetails[role];
                const isSelected = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleSelect(role)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? `${info.color} ring-2 ring-indigo-500 shadow-sm font-semibold`
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${info.badgeColor}`}>
                          {info.badge}
                        </span>
                        {isSelected && <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </div>
                      <div className="text-sm font-bold text-slate-900">{info.title}</div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-snug">
                        {info.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Display Name & Password Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nome do Servidor / Operador:
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  placeholder="Nome do profissional"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Autenticação de Segurança:
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-slate-50"
                  placeholder="Senha institucional"
                />
              </div>
            </div>
          </div>

          {/* Detailed Permissions for Active Role */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 block mb-1.5 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              Permissões Ativas para este Perfil:
            </span>
            <ul className="space-y-1">
              {roleDetails[selectedRole].permissions.map((p, idx) => (
                <li key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Entrar com este Perfil</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
