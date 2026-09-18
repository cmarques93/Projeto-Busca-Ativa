import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Users,
  Search,
  KeyRound,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Briefcase,
  Lock,
  UserCheck,
  FileSpreadsheet,
  Info,
  AlertCircle
} from 'lucide-react';
import { UserAccount, UserRole } from '../types';
import { storageService, getRoleLabel } from '../data/storageService';

interface AccessManagementProps {
  onRefresh?: () => void;
  onOpenGoogleSheets?: () => void;
}

export const AccessManagement: React.FC<AccessManagementProps> = ({
  onRefresh,
  onOpenGoogleSheets,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('todos');
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);
  const [isEditPinModalOpen, setIsEditPinModalOpen] = useState(false);
  const [selectedUserForPin, setSelectedUserForPin] = useState<UserAccount | null>(null);
  const [newPinValue, setNewPinValue] = useState('');

  // User deletion state for in-app confirmation modal (works reliably inside iframes)
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Form for new user
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('professor');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserNotes, setNewUserNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/users');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
          setLoading(false);
          return;
        }
      }
    } catch (err: any) {
      console.warn('API /api/users indisponível, usando lista local:', err);
    }

    const localList = storageService.getUsers() as UserAccount[];
    setUsers(localList);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const togglePinReveal = (userId: string) => {
    setRevealedPins(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  // Change user role directly
  const handleRoleChange = async (user: UserAccount, newRole: UserRole) => {
    let updatedUser: UserAccount | null = null;
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        updatedUser = await res.json();
      }
    } catch (err: any) {
      console.warn('API backend indisponível, aplicando alteração local permanente:', err);
    }

    const localUpdated = storageService.updateUser(user.id, {
      role: newRole,
      roleLabel: getRoleLabel(newRole),
    });

    const finalUser = updatedUser || localUpdated;
    if (finalUser) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...finalUser } : u));
    }

    setSuccessMessage(`Perfil de "${user.name}" atualizado com sucesso para ${getRoleLabel(newRole)}!`);
    setTimeout(() => setSuccessMessage(null), 4000);
    if (onRefresh) onRefresh();
  };

  // Toggle user active/inactive
  const handleToggleActive = async (user: UserAccount) => {
    const newStatus = !user.active;
    try {
      await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newStatus }),
      });
    } catch (err: any) {
      console.warn('API backend indisponível, alterando status localmente:', err);
    }

    storageService.updateUser(user.id, { active: newStatus });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, active: newStatus } : u));
  };

  // Delete user trigger - opens in-app confirmation modal
  const handleDeleteUser = (user: UserAccount) => {
    setUserToDelete(user);
  };

  // Confirm deletion of user (idempotent across backend & local storage)
  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    const targetUser = userToDelete;

    try {
      await fetch(`/api/users/${targetUser.id}`, { method: 'DELETE' });
    } catch (err: any) {
      console.warn('API backend indisponível, removendo localmente:', err);
    }

    storageService.deleteUser(targetUser.id);
    setUsers(prev => prev.filter(u => u.id !== targetUser.id));
    setSuccessMessage(`Usuário "${targetUser.name}" removido com sucesso.`);
    setTimeout(() => setSuccessMessage(null), 4000);
    setUserToDelete(null);
    setIsDeletingUser(false);
    if (onRefresh) onRefresh();
  };

  // Update 4-digit PIN
  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPin) return;

    const cleanPin = newPinValue.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setErrorMessage('A senha deve conter exatamente 4 números.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await fetch(`/api/users/${selectedUserForPin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin }),
      });
    } catch (err: any) {
      console.warn('API backend indisponível, salvando senha localmente:', err);
    }

    storageService.updateUserPin(selectedUserForPin.id, cleanPin);
    setUsers(prev => prev.map(u => u.id === selectedUserForPin.id ? { ...u, pin: cleanPin } : u));

    setSuccessMessage(`Senha de 4 dígitos de "${selectedUserForPin.name}" atualizada com sucesso!`);
    setTimeout(() => setSuccessMessage(null), 4000);
    setIsEditPinModalOpen(false);
    setSelectedUserForPin(null);
    setNewPinValue('');
    setSubmitting(false);
  };

  // Create new user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateModalError(null);

    const cleanName = newUserName.trim();
    if (!cleanName) {
      setCreateModalError('O nome completo do servidor é obrigatório.');
      return;
    }

    const pinToUse = newUserPin.trim() || '1234';
    if (!/^\d{4}$/.test(pinToUse)) {
      setCreateModalError('A senha de acesso deve conter exatamente 4 números (ex: 1234).');
      return;
    }

    setSubmitting(true);
    let createdUser: UserAccount | null = null;
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          role: newUserRole,
          pin: pinToUse,
          notes: newUserNotes.trim(),
        }),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        createdUser = await res.json();
      } else if (contentType && contentType.includes('application/json')) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error) {
          setCreateModalError(errJson.error);
          setSubmitting(false);
          return;
        }
      }
    } catch (err: any) {
      console.warn('API backend indisponível, gravando no banco permanente:', err);
    }

    // Grava de forma resiliente e durável no storageService
    const localUser = storageService.createUser({
      name: cleanName,
      role: newUserRole,
      pin: pinToUse,
      notes: newUserNotes.trim(),
    });

    const userToDisplay = createdUser || localUser;
    setUsers(prev => [userToDisplay, ...prev.filter(u => u.id !== userToDisplay.id)]);

    setSuccessMessage(`Novo usuário "${userToDisplay.name}" cadastrado com sucesso com perfil ${userToDisplay.roleLabel}!`);
    setTimeout(() => setSuccessMessage(null), 4000);
    setIsCreateModalOpen(false);
    setNewUserName('');
    setNewUserRole('professor');
    setNewUserPin('');
    setNewUserNotes('');
    setCreateModalError(null);
    setSubmitting(false);
    if (onRefresh) onRefresh();
  };

  // Stats calculation
  const totalCount = users.length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const gestaoCount = users.filter(u => u.role === 'gestao_paac').length;
  const aoeCount = users.filter(u => u.role === 'aoe').length;
  const profCount = users.filter(u => u.role === 'professor').length;

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.notes && user.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (roleFilter !== 'todos' && user.role !== roleFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/30 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>Perfil Master de Administrador</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Banco de Dados de Acessos & Perfis da Equipe
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Painel exclusivo do Administrador para gerenciar todos os acessos institucionais. Você é o responsável por determinar o perfil de cada pessoa e configurar a respectiva senha de 4 dígitos para o login.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {onOpenGoogleSheets && (
            <button
              onClick={onOpenGoogleSheets}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-md"
              title="Sincronizar a aba de Usuários e Acessos com a Planilha Oficial do Google Drive"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Sincronizar com Planilha</span>
            </button>
          )}

          <button
            onClick={() => {
              setCreateModalError(null);
              setErrorMessage(null);
              setIsCreateModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-md"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Novo Usuário / Servidor</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-3 shadow-xs animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-3 shadow-xs animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Total de Usuários</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalCount}</div>
          <span className="text-[10px] text-slate-400 font-medium">Cadastrados no sistema</span>
        </div>

        <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 shadow-xs">
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-xs font-semibold">Administrador</span>
            <ShieldCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-950">{adminCount}</div>
          <span className="text-[10px] text-purple-700 font-medium">Controle Total & Perfis</span>
        </div>

        <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-200 shadow-xs">
          <div className="flex items-center justify-between text-indigo-700 mb-1">
            <span className="text-xs font-semibold">Gestão / PAAC</span>
            <Briefcase className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-950">{gestaoCount}</div>
          <span className="text-[10px] text-indigo-700 font-medium">Chamadas, Busca & Planilhas</span>
        </div>

        <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 shadow-xs">
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-xs font-semibold">AOE Secretaria</span>
            <UserCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-950">{aoeCount}</div>
          <span className="text-[10px] text-blue-700 font-medium">Frequência & Portaria</span>
        </div>

        <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-xs font-semibold">Professores</span>
            <Lock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-950">{profCount}</div>
          <span className="text-[10px] text-emerald-700 font-medium">Consulta de Ausências</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nome, usuário ou nota..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-slate-500 font-medium">Filtrar perfil:</span>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
          >
            <option value="todos">Todos os Perfis ({users.length})</option>
            <option value="admin">Administrador ({adminCount})</option>
            <option value="gestao_paac">Gestão / PAAC ({gestaoCount})</option>
            <option value="aoe">AOE - Secretaria & Portaria ({aoeCount})</option>
            <option value="professor">Professor Regente ({profCount})</option>
          </select>

          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Atualizar lista de acessos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Users Database Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Usuários Registrados na Escola ({filteredUsers.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            Dica: Altere o perfil de qualquer usuário diretamente na coluna "Perfil Determinado".
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Nome do Servidor</th>
                <th className="py-3 px-4">Perfil Determinado (Role)</th>
                <th className="py-3 px-4 text-center">Senha (4 Dígitos)</th>
                <th className="py-3 px-4">Último Acesso</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Nenhum usuário encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const isRevealed = revealedPins[user.id];
                  const isAdminUser = user.role === 'admin';

                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !user.active ? 'opacity-60 bg-slate-50' : ''
                      }`}
                    >
                      {/* Name & username */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          {user.name}
                          {user.id === 'usr-admin' && (
                            <span className="bg-purple-100 text-purple-800 text-[9px] px-1.5 py-0.2 rounded font-black border border-purple-300">
                              PRINCIPAL
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          @{user.username} {user.notes ? `• ${user.notes}` : ''}
                        </div>
                      </td>

                      {/* Role selection dropdown (Determinar Perfil) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={user.role}
                            onChange={e => handleRoleChange(user, e.target.value as UserRole)}
                            disabled={user.id === 'usr-admin'}
                            className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-hidden focus:ring-2 ${
                              user.role === 'admin'
                                ? 'bg-purple-50 text-purple-900 border-purple-300 focus:ring-purple-400'
                                : user.role === 'gestao_paac'
                                ? 'bg-indigo-50 text-indigo-900 border-indigo-300 focus:ring-indigo-400'
                                : user.role === 'aoe'
                                ? 'bg-blue-50 text-blue-900 border-blue-300 focus:ring-blue-400'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300 focus:ring-emerald-400'
                            }`}
                            title="Alterar perfil deste usuário"
                          >
                            <option value="admin">Administrador (Master)</option>
                            <option value="gestao_paac">Gestão / PAAC</option>
                            <option value="aoe">AOE - Secretaria & Portaria</option>
                            <option value="professor">Professor Regente</option>
                          </select>
                        </div>
                      </td>

                      {/* 4-digit PIN with reveal and quick edit */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          <span className="font-mono font-bold tracking-widest text-slate-800 text-xs">
                            {isRevealed ? user.pin : '••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePinReveal(user.id)}
                            className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                            title={isRevealed ? 'Ocultar senha' : 'Ver senha de 4 dígitos'}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForPin(user);
                              setNewPinValue(user.pin);
                              setIsEditPinModalOpen(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 p-0.5 ml-1 cursor-pointer"
                            title="Alterar senha de 4 dígitos"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Last access */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {user.lastLogin ? (
                          <span>{new Date(user.lastLogin).toLocaleString('pt-BR')}</span>
                        ) : (
                          <span className="text-slate-400 italic">Nunca acessou</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(user)}
                          disabled={user.id === 'usr-admin'}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                            user.active
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                          }`}
                          title={user.active ? 'Clique para desativar' : 'Clique para ativar'}
                        >
                          {user.active ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForPin(user);
                              setNewPinValue(user.pin);
                              setIsEditPinModalOpen(true);
                            }}
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                            title="Trocar senha de 4 dígitos"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {user.id !== 'usr-admin' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title="Excluir este usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explanatory Box on RBAC Profiles */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Info className="w-4 h-4 text-purple-600" />
          <span>Regras de Acesso Estabelecidas pelo Administrador:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] text-slate-600 pt-1">
          <div className="p-2.5 rounded-lg bg-white border border-purple-200">
            <strong className="text-purple-800 block mb-0.5">Administrador (Master):</strong>
            Acesso irrestrito a todo o sistema, gerenciamento de usuários, configuração de senhas de 4 dígitos e relatórios.
          </div>
          <div className="p-2.5 rounded-lg bg-white border border-indigo-200">
            <strong className="text-indigo-800 block mb-0.5">Gestão / PAAC:</strong>
            Acesso a chamadas, portaria, envio de alertas WhatsApp, busca ativa, relatórios e geração de Planilhas Google.
          </div>
          <div className="p-2.5 rounded-lg bg-white border border-blue-200">
            <strong className="text-blue-800 block mb-0.5">AOE (Secretaria / Portaria):</strong>
            Apenas lançamento diário de frequências e controle de portaria. Sem geração de planilhas e sem relatórios gerenciais.
          </div>
          <div className="p-2.5 rounded-lg bg-white border border-emerald-200">
            <strong className="text-emerald-800 block mb-0.5">Professor Regente:</strong>
            Apenas consulta aos motivos das ausências e atestados da sua turma. Sem planilhas, sem contatos e sem alertas.
          </div>
        </div>
      </div>

      {/* Modal: Create New User */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-sm">Cadastrar Novo Usuário</h3>
                  <p className="text-[11px] text-slate-400">Determine o perfil e a senha de 4 dígitos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} noValidate className="p-6 space-y-4 text-xs">
              {createModalError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold text-xs">{createModalError}</span>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Nome Completo do Servidor: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="Ex: Prof. Marcos Silva"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Perfil Determinado pelo Administrador: <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer text-slate-900"
                >
                  <option value="professor">Professor Regente (Consulta Restrita)</option>
                  <option value="aoe">AOE - Agente de Organização Escolar (Frequência & Portaria)</option>
                  <option value="gestao_paac">Gestão / PAAC (Acesso Total & Planilhas)</option>
                  <option value="admin">Administrador (Master - Controle Geral)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Senha Numérica de 4 Dígitos:
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newUserPin}
                  onChange={e => setNewUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Padrão: 1234"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono tracking-widest text-base focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-slate-900 bg-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Digite 4 dígitos numéricos (se deixar em branco, a senha inicial será <strong>1234</strong>).
                </span>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Observações / Disciplina / Lotação:
                </label>
                <input
                  type="text"
                  value={newUserNotes}
                  onChange={e => setNewUserNotes(e.target.value)}
                  placeholder="Ex: Docente de História dos 7ºs e 8ºs anos"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-slate-900 bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  {submitting ? 'Gravando no Sistema...' : 'Salvar no Banco de Acessos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit 4-digit PIN */}
      {isEditPinModalOpen && selectedUserForPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-sm">Alterar Senha Numérica</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPinModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewPin} noValidate className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-slate-500 block mb-1">Usuário selecionado:</span>
                <div className="font-bold text-slate-900 text-sm">{selectedUserForPin.name}</div>
                <div className="text-[11px] text-slate-500">{selectedUserForPin.roleLabel}</div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Nova Senha de 4 Dígitos Numéricos:
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPinValue}
                  onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  className="w-full px-3 py-2 text-center text-lg font-mono font-bold tracking-widest border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-slate-900 bg-white"
                  autoFocus
                />
                <span className="text-[10px] text-slate-500 mt-1 block text-center">
                  Digite exatamente 4 números.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditPinModalOpen(false)}
                  className="px-3 py-1.5 font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Confirmar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir Usuário (In-App, imune a bloqueios de iframes) */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Excluir Usuário do Sistema
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Tem certeza que deseja excluir o cadastro e revogar o acesso de{' '}
              <strong className="text-slate-900">{userToDelete.name}</strong>?
            </p>
            <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center text-[11px] text-slate-500">
              Cargo: <span className="font-semibold text-slate-800">{userToDelete.roleLabel}</span> • Identificador: <span className="font-mono text-slate-700">{userToDelete.id}</span>
            </div>
            <p className="text-[11px] text-rose-600 text-center mt-2 font-medium">
              Esta ação revogará permanentemente as permissões de acesso deste colaborador.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeletingUser}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={isDeletingUser}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isDeletingUser ? (
                  <span>Excluindo...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sim, Excluir Usuário</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
