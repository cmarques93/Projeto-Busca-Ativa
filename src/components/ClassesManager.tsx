import React, { useState, useMemo } from 'react';
import {
  Users,
  GraduationCap,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Building2,
  ArrowRight,
  Info,
  X,
  Lock,
  MessageSquare,
  Smartphone
} from 'lucide-react';
import { SchoolClass, Student, UserSession, RiskLevel, AttendanceStatus } from '../types';
import { storageService } from '../data/storageService';
import { getStudentPhones } from '../utils/phoneUtils';

interface ClassesManagerProps {
  classes: SchoolClass[];
  students: Student[];
  currentUser: UserSession;
  onRefresh: () => void;
  onOpenStudentDetail: (id: string) => void;
  onOpenStudentRegistration: () => void;
  onOpenResetAllModal: () => void;
}

export const ClassesManager: React.FC<ClassesManagerProps> = ({
  classes,
  students,
  currentUser,
  onRefresh,
  onOpenStudentDetail,
  onOpenStudentRegistration,
  onOpenResetAllModal,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isGestao = currentUser.role === 'gestao_paac';
  const isProfessor = currentUser.role === 'professor';
  const isAOE = currentUser.role === 'aoe';

  // State: Tab view ('turmas' | 'estudantes')
  const [activeSubTab, setActiveSubTab] = useState<'turmas' | 'estudantes'>('turmas');

  // Filters for students list
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('todas');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('todos');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<string>('todos');

  // Modal States
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [classToDelete, setClassToDelete] = useState<SchoolClass | null>(null);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [isNewClassModalOpen, setIsNewClassModalOpen] = useState(false);

  // New Class Form State
  const [newClassId, setNewClassId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('Ensino Fundamental II');
  const [newClassShift, setNewClassShift] = useState<'manha' | 'tarde' | 'integral'>('manha');

  // Toast / Feedback message
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // Filtered students list
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Text search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        student.name.toLowerCase().includes(q) ||
        student.ra.toLowerCase().includes(q) ||
        (student.guardianName && student.guardianName.toLowerCase().includes(q)) ||
        (student.className && student.className.toLowerCase().includes(q));

      // Class filter
      const matchClass = selectedClassFilter === 'todas' || student.classId === selectedClassFilter;

      // Status filter
      const matchStatus =
        selectedStatusFilter === 'todos' ||
        (selectedStatusFilter === 'busca_ativa' && (student.status === 'busca_ativa' || student.status === 'em_busca_ativa')) ||
        (selectedStatusFilter === 'regular' && student.status === 'regular') ||
        (selectedStatusFilter === 'alerta' && student.status === 'alerta') ||
        (selectedStatusFilter === 'evasao' && student.status === 'evasao_iminente');

      // Risk filter
      const matchRisk = selectedRiskFilter === 'todos' || student.riskLevel === selectedRiskFilter;

      return matchSearch && matchClass && matchStatus && matchRisk;
    });
  }, [students, searchQuery, selectedClassFilter, selectedStatusFilter, selectedRiskFilter]);

  // Handle Delete Student
  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    try {
      // Backend deletion
      const res = await fetch(`/api/students/${encodeURIComponent(studentToDelete.id)}`, {
        method: 'DELETE',
      }).catch(() => null);

      // Local storage deletion with complete cascade
      storageService.deleteStudent(studentToDelete.id);

      showToast(`Estudante ${studentToDelete.name} e todos os seus registros de faltas/alertas foram removidos.`);
      setStudentToDelete(null);
      onRefresh();
    } catch (e: any) {
      showToast('Erro ao excluir estudante: ' + e.message, 'error');
    }
  };

  // Handle Delete Class
  const handleConfirmDeleteClass = async () => {
    if (!classToDelete) return;
    try {
      // Backend deletion
      const res = await fetch(`/api/classes/${encodeURIComponent(classToDelete.id)}`, {
        method: 'DELETE',
      }).catch(() => null);

      // Local storage deletion with cascade
      storageService.deleteClass(classToDelete.id);

      showToast(`Turma ${classToDelete.name} e seus estudantes foram removidos com sucesso.`);
      setClassToDelete(null);
      onRefresh();
    } catch (e: any) {
      showToast('Erro ao excluir turma: ' + e.message, 'error');
    }
  };

  // Handle Save Student Edits
  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    try {
      // Update in backend
      const res = await fetch(`/api/students/${encodeURIComponent(editingStudent.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingStudent),
      }).catch(() => null);

      // Update in storageService
      storageService.updateStudent(editingStudent.id, editingStudent);

      showToast(`Dados de ${editingStudent.name} atualizados com sucesso.`);
      setEditingStudent(null);
      onRefresh();
    } catch (e: any) {
      showToast('Erro ao salvar alterações: ' + e.message, 'error');
    }
  };

  // Handle Create New Class
  const handleCreateNewClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassId.trim() || !newClassName.trim()) {
      showToast('Preencha o identificador e o nome da turma.', 'error');
      return;
    }

    const cleanId = newClassId.trim().toUpperCase();
    const newCls: SchoolClass = {
      id: cleanId,
      name: newClassName.trim(),
      grade: newClassGrade,
      shift: newClassShift,
      totalStudents: 0,
      presentToday: 0,
      absentToday: 0,
      attendanceRateToday: 100,
      studentsAtRiskCount: 0,
    };

    try {
      await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCls),
      }).catch(() => null);

      storageService.createClass(newCls);

      showToast(`Turma ${newCls.name} criada com sucesso!`);
      setIsNewClassModalOpen(false);
      setNewClassId('');
      setNewClassName('');
      onRefresh();
    } catch (e: any) {
      showToast('Erro ao criar turma: ' + e.message, 'error');
    }
  };

  // Handle Save Class Edits
  const handleSaveClassEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    try {
      await fetch(`/api/classes/${encodeURIComponent(editingClass.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingClass),
      }).catch(() => null);

      storageService.updateClass(editingClass.id, editingClass);

      showToast(`Turma ${editingClass.name} atualizada com sucesso.`);
      setEditingClass(null);
      onRefresh();
    } catch (e: any) {
      showToast('Erro ao atualizar turma: ' + e.message, 'error');
    }
  };

  // Total metrics
  const totalStudentsCount = students.length;
  const atRiskCount = students.filter(s => s.riskLevel === 'alto' || s.riskLevel === 'critico').length;
  const activeSearchCount = students.filter(s => s.status === 'busca_ativa' || s.status === 'em_busca_ativa').length;
  const avgAttendance = totalStudentsCount > 0
    ? Math.round(students.reduce((acc, s) => acc + (s.attendanceRate || 100), 0) / totalStudentsCount)
    : 100;

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-xl text-white text-sm font-medium flex items-center gap-2 transition-all ${
            feedbackMessage.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {feedbackMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Role Context & Suggestion Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-lg ${isAdmin ? 'bg-purple-100 text-purple-700' : isGestao ? 'bg-indigo-100 text-indigo-700' : isProfessor ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Gestão de Turmas & Estudantes</h1>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  isAdmin ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                  isGestao ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                  isProfessor ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                  'bg-blue-100 text-blue-800 border border-blue-200'
                }`}>
                  {currentUser.roleLabel || currentUser.role}
                </span>
              </div>

              {/* Role-specific explanation & suggestion */}
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                {isAdmin && (
                  <span className="text-purple-900 font-medium">
                    Controle Pleno (Master): Cadastre, edite e remova turmas e estudantes com limpeza automática em cascata de faltas e alertas. Você também tem acesso ao Reset Total do sistema.
                  </span>
                )}
                {isGestao && (
                  <span className="text-indigo-900 font-medium">
                    Gestão Escolar / PAAC: Cadastre novas turmas e novos estudantes, e atualize contatos e endereços. Exclusões permanentes são de prerrogativa do Master.
                  </span>
                )}
                {isProfessor && (
                  <span className="text-amber-900 font-medium">
                    Modo Consulta Docente: Acompanhe a lista de alunos da sua turma, RA, porcentagem de presença acumulada e telefones de recados pedagógicos.
                  </span>
                )}
                {isAOE && (
                  <span className="text-blue-900 font-medium">
                    Modo Secretaria & Portaria: Localize qualquer estudante rapidamente para autorização de entrada/saída e conferência cadastral.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Master Action Buttons: Add Student, Add Class, Wipe/Reset */}
          <div className="flex flex-wrap items-center gap-2">
            {(isAdmin || isGestao) && (
              <button
                onClick={onOpenStudentRegistration}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer"
                title="Cadastrar novo estudante ou importar em lote"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo Estudante</span>
              </button>
            )}

            {(isAdmin || isGestao) && (
              <button
                onClick={() => setIsNewClassModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer"
                title="Criar uma nova turma na escola"
              >
                <Building2 className="w-4 h-4" />
                <span>+ Nova Turma</span>
              </button>
            )}

            {/* Master exclusive: Factory Reset / Wipe All Data Button */}
            {isAdmin && (
              <button
                onClick={onOpenResetAllModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer"
                title="Apaga todas as turmas, estudantes, frequências, alertas e usuários secundários, restaurando o sistema limpo do zero"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Reset Total (Limpar Tudo)</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total de Turmas</span>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{classes.length}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Estudantes Matriculados</span>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{totalStudentsCount > 0 ? totalStudentsCount : '-'}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Busca Ativa / Risco</span>
            <div className="text-xl font-bold text-rose-600 mt-0.5">{activeSearchCount}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Média de Presença</span>
            <div className="text-xl font-bold text-emerald-600 mt-0.5">{avgAttendance}%</div>
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Turmas vs Estudantes */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('turmas')}
          className={`py-3 px-5 text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'turmas'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Turmas Escolares ({classes.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('estudantes')}
          className={`py-3 px-5 text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'estudantes'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Todos os Estudantes ({students.length})</span>
        </button>
      </div>

      {/* VIEW 1: TURMAS ESCOLARES */}
      {activeSubTab === 'turmas' && (
        <div className="space-y-4">
          {classes.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <Building2 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">Nenhuma turma cadastrada</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
                O sistema está limpo. Comece cadastrando as turmas da sua escola ou importando as listas de estudantes.
              </p>
              {(isAdmin || isGestao) && (
                <button
                  onClick={() => setIsNewClassModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar Primeira Turma
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map(cls => {
                const classStudents = students.filter(s => s.classId === cls.id);
                const classRiskCount = classStudents.filter(s => s.riskLevel === 'alto' || s.riskLevel === 'critico').length;
                const shiftLabel = cls.shift === 'manha' ? 'Manhã' : cls.shift === 'tarde' ? 'Tarde' : 'Integral';

                return (
                  <div
                    key={cls.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                            {cls.id}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900 mt-1">{cls.name}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span>{cls.grade}</span>
                            <span>•</span>
                            <span className="capitalize">{shiftLabel}</span>
                          </div>
                        </div>

                        {/* Master Actions for Class */}
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingClass(cls)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="Editar turma"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setClassToDelete(cls)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="Excluir turma e seus estudantes"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Class Metrics */}
                      <div className="grid grid-cols-3 gap-2 my-4 pt-3 border-t border-slate-100 text-center">
                        <div className="bg-slate-50 p-2 rounded">
                          <span className="text-[10px] text-slate-500 font-semibold block">Estudantes</span>
                          <span className="text-base font-bold text-slate-800">{classStudents.length}</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded">
                          <span className="text-[10px] text-slate-500 font-semibold block">Presença Média</span>
                          <span className="text-base font-bold text-emerald-600">
                            {cls.attendanceRateToday || 100}%
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded">
                          <span className="text-[10px] text-slate-500 font-semibold block">Em Risco</span>
                          <span className={`text-base font-bold ${classRiskCount > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                            {classRiskCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* View Class Students Button */}
                    <button
                      onClick={() => {
                        setSelectedClassFilter(cls.id);
                        setActiveSubTab('estudantes');
                      }}
                      className="w-full mt-2 py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Ver {classStudents.length} estudantes desta turma</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: TODOS OS ESTUDANTES */}
      {activeSubTab === 'estudantes' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar por Nome, RA ou Responsável..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Class Filter */}
              <div>
                <select
                  value={selectedClassFilter}
                  onChange={e => setSelectedClassFilter(e.target.value)}
                  className="w-full py-2 px-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium cursor-pointer"
                >
                  <option value="todas">Todas as Turmas ({classes.length})</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({students.filter(s => s.classId === c.id).length} alunos)
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={selectedStatusFilter}
                  onChange={e => setSelectedStatusFilter(e.target.value)}
                  className="w-full py-2 px-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium cursor-pointer"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="regular">Frequência Regular</option>
                  <option value="alerta">Em Alerta</option>
                  <option value="busca_ativa">Casos de Busca Ativa</option>
                  <option value="evasao">Risco de Evasão</option>
                </select>
              </div>

              {/* Risk Filter */}
              <div>
                <select
                  value={selectedRiskFilter}
                  onChange={e => setSelectedRiskFilter(e.target.value)}
                  className="w-full py-2 px-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium cursor-pointer"
                >
                  <option value="todos">Todos os Níveis de Risco</option>
                  <option value="baixo">Risco Baixo</option>
                  <option value="medio">Risco Médio</option>
                  <option value="alto">Risco Alto</option>
                  <option value="critico">Risco Crítico</option>
                </select>
              </div>
            </div>

            {/* Filter Summary */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>
                Exibindo <strong className="text-slate-800">{filteredStudents.length}</strong> de {students.length} estudantes cadastrados
              </span>
              {(searchQuery || selectedClassFilter !== 'todas' || selectedStatusFilter !== 'todos' || selectedRiskFilter !== 'todos') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedClassFilter('todas');
                    setSelectedStatusFilter('todos');
                    setSelectedRiskFilter('todos');
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          </div>

          {/* Students Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredStudents.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-800">Nenhum estudante encontrado</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Ajuste os filtros ou cadastre novos estudantes para esta turma.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Estudante</th>
                      <th className="py-3 px-3">Turma</th>
                      <th className="py-3 px-3 text-center">Frequência</th>
                      <th className="py-3 px-3 text-center">Faltas</th>
                      <th className="py-3 px-3">Responsável & Contato</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map(student => {
                      const rate = student.attendanceRate ?? 100;
                      const isLowAttendance = rate < 75;
                      const isMidAttendance = rate >= 75 && rate < 85;

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Student Name & RA */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs shrink-0">
                                {student.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 block">{student.name}</span>
                                <span className="text-[11px] text-slate-500">RA: {student.ra}</span>
                              </div>
                            </div>
                          </td>

                          {/* Class */}
                          <td className="py-3 px-3">
                            <span className="font-medium text-slate-700 block">{student.className}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{student.classId}</span>
                          </td>

                          {/* Attendance Rate */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`font-bold ${isLowAttendance ? 'text-rose-600' : isMidAttendance ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {rate}%
                              </span>
                              <div className="w-14 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                                <div
                                  className={`h-full rounded-full ${isLowAttendance ? 'bg-rose-500' : isMidAttendance ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Absences */}
                          <td className="py-3 px-3 text-center">
                            <span className="text-slate-800 font-semibold">{student.totalAbsences || 0}</span>
                            {student.consecutiveAbsences && student.consecutiveAbsences > 0 ? (
                              <span className="block text-[10px] text-rose-600 font-semibold">
                                {student.consecutiveAbsences} consec.
                              </span>
                            ) : null}
                          </td>

                          {/* Guardian & Phone */}
                          <td className="py-3 px-3">
                            <span className="font-medium text-slate-800 block text-xs truncate max-w-[160px]">
                              {student.guardianName || 'Não informado'}
                            </span>
                            {(() => {
                              const phones = getStudentPhones(student.guardianPhone);
                              if (phones.length === 0) {
                                return <span className="text-[11px] text-slate-400">Sem telefone</span>;
                              }

                              if (phones.length === 1) {
                                return (
                                  <a
                                    href={phones[0].whatsAppUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 hover:underline font-medium"
                                    title={`Abrir conversa no WhatsApp (${phones[0].formatted})`}
                                  >
                                    <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>{phones[0].formatted}</span>
                                  </a>
                                );
                              }

                              // Multiple numbers (e.g. "19 99999-0000 / +55 19 90000-9999")
                              return (
                                <div className="space-y-1 mt-0.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.2 rounded-full">
                                    <Smartphone className="w-2.5 h-2.5" /> {phones.length} números
                                  </span>
                                  <div className="flex flex-col gap-0.5">
                                    {phones.map((p, pIdx) => (
                                      <a
                                        key={pIdx}
                                        href={p.whatsAppUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 hover:underline font-mono bg-emerald-50/70 border border-emerald-200/80 px-1.5 py-0.5 rounded transition-colors"
                                        title={`Abrir WhatsApp no contato ${pIdx + 1}: ${p.formatted}`}
                                      >
                                        <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span className="font-sans font-bold text-slate-400 text-[9px]">#{pIdx + 1}</span>
                                        <span>{p.formatted}</span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-3">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block ${
                              student.status === 'busca_ativa' || student.status === 'em_busca_ativa'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : student.status === 'alerta'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : student.status === 'evasao_iminente'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {student.status === 'busca_ativa' || student.status === 'em_busca_ativa' ? 'Busca Ativa' :
                               student.status === 'alerta' ? 'Alerta' :
                               student.status === 'evasao_iminente' ? 'Evasão' : 'Regular'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* View detail (everyone) */}
                              <button
                                onClick={() => onOpenStudentDetail(student.id)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                                title="Ver ficha pedagógica completa"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Edit student (Admin & Gestão) */}
                              {(isAdmin || isGestao) && (
                                <button
                                  onClick={() => setEditingStudent({ ...student })}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                                  title="Editar informações do estudante"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}

                              {/* Delete student (Master Only) */}
                              {isAdmin && (
                                <button
                                  onClick={() => setStudentToDelete(student)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                  title="Excluir estudante e purgar dados"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: EDITAR ESTUDANTE (Master & Gestão) */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Editar Estudante</h3>
              </div>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentEdit} className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={editingStudent.name}
                  onChange={e => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">RA (Registro do Aluno)</label>
                  <input
                    type="text"
                    required
                    value={editingStudent.ra}
                    onChange={e => setEditingStudent({ ...editingStudent, ra: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Turma</label>
                  <select
                    value={editingStudent.classId}
                    onChange={e => {
                      const sel = classes.find(c => c.id === e.target.value);
                      setEditingStudent({
                        ...editingStudent,
                        classId: e.target.value,
                        className: sel ? sel.name : editingStudent.className,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nome do Responsável</label>
                  <input
                    type="text"
                    value={editingStudent.guardianName || ''}
                    onChange={e => setEditingStudent({ ...editingStudent, guardianName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Telefone(s) / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editingStudent.guardianPhone || ''}
                    onChange={e => setEditingStudent({ ...editingStudent, guardianPhone: e.target.value })}
                    placeholder="Ex: 19 99999-0000 / +55 19 90000-9999"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
                  />

                  {/* Real-time detection feedback */}
                  {editingStudent.guardianPhone && (() => {
                    const detected = getStudentPhones(editingStudent.guardianPhone);
                    if (detected.length === 0) return null;
                    return (
                      <div className="mt-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs">
                        <div className="flex items-center justify-between font-semibold text-emerald-900 mb-1">
                          <span className="text-[10px] uppercase tracking-wide">
                            {detected.length > 1 ? `${detected.length} números identificados:` : '1 número identificado:'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {detected.map((p, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-emerald-300 rounded text-emerald-900 font-mono text-[10px]"
                            >
                              <Phone className="w-2.5 h-2.5 text-emerald-600" />
                              <strong className="font-sans text-slate-500">#{idx + 1}:</strong> {p.formatted}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <span className="text-[10px] text-slate-500 block mt-1">
                    Para múltiplos números, separe com barra: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">19 99999-0000 / +55 19 90000-9999</code>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Parentesco</label>
                  <input
                    type="text"
                    value={editingStudent.guardianRelationship || ''}
                    onChange={e => setEditingStudent({ ...editingStudent, guardianRelationship: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Status no Sistema</label>
                  <select
                    value={editingStudent.status}
                    onChange={e => setEditingStudent({ ...editingStudent, status: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="regular">Regular</option>
                    <option value="alerta">Alerta</option>
                    <option value="busca_ativa">Busca Ativa</option>
                    <option value="evasao_iminente">Evasão Iminente</option>
                    <option value="reintegrado">Reintegrado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Endereço Residencial</label>
                <input
                  type="text"
                  value={editingStudent.address || ''}
                  onChange={e => setEditingStudent({ ...editingStudent, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Bairro</label>
                <input
                  type="text"
                  value={editingStudent.neighborhood || ''}
                  onChange={e => setEditingStudent({ ...editingStudent, neighborhood: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Observações Pedagógicas</label>
                <textarea
                  rows={2}
                  value={editingStudent.notes || ''}
                  onChange={e => setEditingStudent({ ...editingStudent, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMAÇÃO DE EXCLUSÃO DE ESTUDANTE (Master Only) */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">Excluir Estudante do Sistema?</h3>
            <p className="text-xs sm:text-sm text-slate-600 text-center mt-2 leading-relaxed">
              Você está prestes a excluir <strong className="text-slate-900">{studentToDelete.name}</strong> (RA: {studentToDelete.ra}) da turma {studentToDelete.className}.
            </p>
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-800 mt-3">
              <strong>Atenção:</strong> Todos os registros de faltas, chamadas diárias, casos de busca ativa e histórico de portaria deste estudante serão removidos imediatamente em cascata.
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteStudent}
                className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CRIAR NOVA TURMA (Master & Gestão) */}
      {isNewClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Cadastrar Nova Turma</h3>
              </div>
              <button
                onClick={() => setIsNewClassModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewClass} className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Código / ID da Turma</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 9A, 1EM_A, 8B"
                  value={newClassId}
                  onChange={e => setNewClassId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">Identificador único da turma no sistema.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nome da Turma</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 9º Ano A, 1ª Série Médio A"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Segmento / Grau Escolar</label>
                <select
                  value={newClassGrade}
                  onChange={e => setNewClassGrade(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Ensino Fundamental II">Ensino Fundamental II</option>
                  <option value="Ensino Médio">Ensino Médio</option>
                  <option value="Ensino Fundamental I">Ensino Fundamental I</option>
                  <option value="EJA">EJA (Educação de Jovens e Adultos)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Turno</label>
                <select
                  value={newClassShift}
                  onChange={e => setNewClassShift(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="integral">Integral (PEI)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewClassModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs transition-colors"
                >
                  Cadastrar Turma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EDITAR TURMA (Master Only) */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Editar Turma ({editingClass.id})</h3>
              </div>
              <button
                onClick={() => setEditingClass(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClassEdit} className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nome da Turma</label>
                <input
                  type="text"
                  required
                  value={editingClass.name}
                  onChange={e => setEditingClass({ ...editingClass, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Segmento / Grau Escolar</label>
                <select
                  value={editingClass.grade}
                  onChange={e => setEditingClass({ ...editingClass, grade: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Ensino Fundamental II">Ensino Fundamental II</option>
                  <option value="Ensino Médio">Ensino Médio</option>
                  <option value="Ensino Fundamental I">Ensino Fundamental I</option>
                  <option value="EJA">EJA</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Turno</label>
                <select
                  value={editingClass.shift}
                  onChange={e => setEditingClass({ ...editingClass, shift: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="integral">Integral (PEI)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs transition-colors"
                >
                  Salvar Turma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: CONFIRMAR EXCLUSÃO DE TURMA (Master Only) */}
      {classToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">Excluir Turma {classToDelete.name}?</h3>
            <p className="text-xs sm:text-sm text-slate-600 text-center mt-2 leading-relaxed">
              Você está excluindo permanentemente a turma <strong className="text-slate-900">{classToDelete.name}</strong> ({classToDelete.id}).
            </p>
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-800 mt-3">
              <strong>Atenção:</strong> Todos os estudantes vinculados a esta turma e seus respectivos registros de frequência, faltas e portaria também serão apagados do sistema.
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setClassToDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteClass}
                className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
