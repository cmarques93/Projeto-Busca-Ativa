import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  FileSpreadsheet,
  Users,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  Trash2,
  Plus,
  Sparkles,
  Phone,
  User,
  GraduationCap,
  Hash,
  Smartphone
} from 'lucide-react';
import { SchoolClass, Student } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { storageService } from '../data/storageService';
import { getStudentPhones, parsePhoneNumbers } from '../utils/phoneUtils';

interface StudentRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: SchoolClass[];
  onStudentRegistered: () => Promise<void>;
  onOpenStudentDetail?: (id: string) => void;
}

export const StudentRegistrationModal: React.FC<StudentRegistrationModalProps> = ({
  isOpen,
  onClose,
  classes,
  onStudentRegistered,
  onOpenStudentDetail,
}) => {
  const [tab, setTab] = useState<'individual' | 'batch' | 'class'>('individual');

  // Form states - Individual: Only Nome, Turma, RA, Telefone
  const [name, setName] = useState('');
  const [ra, setRa] = useState('');
  const [classId, setClassId] = useState(classes[0]?.id || '9A');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states - Batch CSV: Nome; Turma; RA; Telefone
  const [csvText, setCsvText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<Partial<Student>[]>([]);
  const [batchTargetClass, setBatchTargetClass] = useState(classes[0]?.id || '9A');

  // Form states - New Class
  const [newClassId, setNewClassId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('Ensino Fundamental II');
  const [newClassShift, setNewClassShift] = useState('Manhã');

  // Local class list & in-app deletion confirmation (immune to iframe confirm blocking)
  const [classList, setClassList] = useState<SchoolClass[]>(classes);
  const [classToDelete, setClassToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  useEffect(() => {
    setClassList(classes);
  }, [classes]);

  if (!isOpen) return null;

  const handleIndividualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMessage('O nome completo do estudante é obrigatório.');
      return;
    }

    if (!classId) {
      setErrorMessage('Selecione uma turma para o estudante.');
      return;
    }

    setIsSubmitting(true);
    const selectedClassObj = classes.find(c => c.id === classId);
    const newStudentData = {
      name: cleanName,
      ra: ra.trim() || undefined,
      classId,
      className: selectedClassObj ? selectedClassObj.name : classId,
      guardianPhone: guardianPhone.trim() || '(11) 90000-0000',
      guardianName: 'Responsável',
      guardianRelationship: 'Responsável',
      address: 'Conforme matrícula escolar',
      neighborhood: 'Bairro escolar',
      vulnerabilityFactors: [],
      notes: 'Cadastrado no sistema escolar.',
    };

    let createdStudent: Student | null = null;
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudentData),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        createdStudent = await res.json();
      } else if (contentType && contentType.includes('application/json')) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error) {
          setErrorMessage(errJson.error);
          setIsSubmitting(false);
          return;
        }
      }
    } catch (err: any) {
      console.warn('API backend indisponível, salvando estudante localmente:', err);
    }

    storageService.createStudent(createdStudent || newStudentData);
    await onStudentRegistered();
    setSuccessMessage(`Estudante "${cleanName}" cadastrado(a) com sucesso no banco de dados!`);
    setName('');
    setRa('');
    setGuardianPhone('');
    setIsSubmitting(false);
  };

  const parseCsvData = (text: string) => {
    setCsvText(text);
    if (!text.trim()) {
      setParsedPreview([]);
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsed: Partial<Student>[] = [];

    lines.forEach((line, idx) => {
      // Skip header if detected
      if (idx === 0 && (line.toLowerCase().includes('nome') || line.toLowerCase().includes('estudante'))) {
        return;
      }

      // Supports semicolon, comma, or tab: Nome; Turma (opcional); RA; Telefone ou Nome; RA; Telefone
      const parts = line.includes(';') ? line.split(';') : line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length >= 1) {
        const studentName = parts[0]?.trim();
        let studentClass = batchTargetClass;
        let studentRa = '';
        let studentPhone = '';

        if (parts.length === 2) {
          studentPhone = parts[1]?.trim();
          studentRa = `2024-${Math.floor(1000 + Math.random() * 9000)}`;
        } else if (parts.length === 3) {
          studentRa = parts[1]?.trim() || `2024-${Math.floor(1000 + Math.random() * 9000)}`;
          studentPhone = parts[2]?.trim() || '';
        } else if (parts.length >= 4) {
          // Could be Nome ; Turma ; RA ; Telefone OR Nome ; RA ; Telefone ; Outro
          const part1Cls = classes.find(c => c.id.toLowerCase() === parts[1]?.trim().toLowerCase());
          if (part1Cls) {
            studentClass = part1Cls.id;
            studentRa = parts[2]?.trim();
            studentPhone = parts[3]?.trim();
          } else {
            studentRa = parts[1]?.trim();
            studentPhone = parts[2]?.trim() || parts[3]?.trim();
          }
        }

        if (studentName) {
          parsed.push({
            name: studentName,
            ra: studentRa || `2024-${Math.floor(1000 + Math.random() * 9000)}`,
            guardianPhone: studentPhone || '(11) 90000-0000',
            guardianName: 'Responsável',
            classId: studentClass,
          });
        }
      }
    });

    setParsedPreview(parsed);
  };

  const handleFillDemoCsv = () => {
    const demo = `Mariana Santos Lima;2024-3312;19 99999-0000 / +55 19 90000-9999
Pedro Henrique Costa;2024-4421;19 98765-4321 / 19 97654-3210
Larissa Souza Mendes;2024-5533;+55 19 97654-3210
Kauã Matheus Oliveira;2024-6644;19 96543-2109 / 19 95432-1098
Juliana Cristina Vieira;2024-7755;19 95432-1098`;
    parseCsvData(demo);
  };

  const handleBatchSubmit = async () => {
    if (parsedPreview.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const selectedClassObj = classes.find(c => c.id === batchTargetClass);
    const payload = parsedPreview.map(p => ({
      ...p,
      classId: p.classId || batchTargetClass,
      className: (classes.find(c => c.id === (p.classId || batchTargetClass)) || selectedClassObj)?.name || batchTargetClass,
      guardianName: 'Responsável',
      guardianRelationship: 'Responsável',
      address: 'Endereço escolar',
      neighborhood: 'Bairro escolar',
      status: 'regular' as const,
      riskLevel: 'baixo' as const,
      totalSchoolDays: 45,
      totalAbsences: 0,
      consecutiveAbsences: 0,
      attendanceRate: 100,
    }));

    try {
      const res = await fetch('/api/students/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: payload }),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        // Backend updated
      }
    } catch (err: any) {
      console.warn('API backend indisponível, importando lote localmente:', err);
    }

    const insertedCount = storageService.batchCreateStudents(payload);
    await onStudentRegistered();
    setSuccessMessage(`${insertedCount} estudantes importados com sucesso!`);
    setCsvText('');
    setParsedPreview([]);
    setIsSubmitting(false);
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanId = newClassId.trim().toUpperCase();
    const cleanName = newClassName.trim();
    if (!cleanId || !cleanName) {
      setErrorMessage('O código da turma e o nome de exibição são obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    const classData: SchoolClass = {
      id: cleanId,
      name: cleanName,
      grade: newClassGrade,
      shift: newClassShift,
      totalStudents: 0,
      presentToday: 0,
      absentToday: 0,
      attendanceRateToday: 100,
      studentsAtRiskCount: 0,
    };

    let serverSuccess = false;
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classData),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        serverSuccess = true;
      } else if (contentType && contentType.includes('application/json')) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error) {
          setErrorMessage(errJson.error);
          setIsSubmitting(false);
          return;
        }
      }
    } catch (err: any) {
      console.warn('API backend indisponível, criando turma localmente:', err);
    }

    storageService.createClass(classData);
    setClassList(prev => [...prev.filter(c => c.id.toLowerCase() !== cleanId.toLowerCase()), classData]);
    await onStudentRegistered();
    setSuccessMessage(`Turma "${cleanName}" (${cleanId}) salva com sucesso no banco de dados!`);
    setNewClassId('');
    setNewClassName('');
    setIsSubmitting(false);
  };

  // Open in-app deletion confirmation modal
  const handleDeleteClass = (clsId: string, clsName: string) => {
    setClassToDelete({ id: clsId, name: clsName });
  };

  // Confirm delete class (immune to iframe restrictions)
  const confirmDeleteClass = async () => {
    if (!classToDelete) return;
    const { id: clsId, name: clsName } = classToDelete;
    setIsDeletingClass(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await fetch(`/api/classes/${encodeURIComponent(clsId)}`, {
        method: 'DELETE',
      });
    } catch (err: any) {
      console.warn('API backend indisponível, excluindo turma localmente:', err);
    }

    storageService.deleteClass(clsId);
    setClassList(prev => prev.filter(c => c.id.toLowerCase() !== clsId.toLowerCase()));

    // Adjust selected class if it was the deleted one
    const remaining = classList.filter(c => c.id.toLowerCase() !== clsId.toLowerCase());
    if (classId.toLowerCase() === clsId.toLowerCase() && remaining.length > 0) {
      setClassId(remaining[0].id);
    }
    if (batchTargetClass.toLowerCase() === clsId.toLowerCase() && remaining.length > 0) {
      setBatchTargetClass(remaining[0].id);
    }

    await onStudentRegistered();
    setSuccessMessage(`Turma "${clsName}" (${clsId}) excluída com sucesso!`);
    setClassToDelete(null);
    setIsDeletingClass(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  Cadastrar Estudantes da Escola
                </h3>
                <InfoTooltip
                  title="Ajuda sobre o Cadastro"
                  content="Cadastre novos estudantes informando apenas Nome, Turma, RA e Telefone (WhatsApp) para alertas escolares."
                />
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="px-6 pt-3 border-b border-slate-200 flex gap-2 bg-white">
          <button
            onClick={() => setTab('individual')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'individual'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Cadastro Individual</span>
          </button>

          <button
            onClick={() => setTab('batch')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'batch'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Importar Planilha / Lote (CSV)</span>
          </button>

          <button
            onClick={() => setTab('class')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'class'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Nova Turma</span>
          </button>
        </div>

        {/* Feedback alerts */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content area */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {tab === 'individual' && (
            <form onSubmit={handleIndividualSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nome */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Nome Completo do Estudante: *</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Mariana Silva Rocha"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* Turma */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Turma: *</span>
                    </label>
                  </div>
                  <select
                    value={classId}
                    onChange={e => setClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.shift})
                      </option>
                    ))}
                  </select>
                </div>

                {/* RA */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-indigo-600" />
                      <span>RA:</span>
                    </label>
                    <InfoTooltip
                      title="RA (Registro do Aluno)"
                      content="Número de matrícula escolar oficial. Se não informado, o sistema irá gerar um RA automático."
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Ex: 2024-9182 (deixe vazio para auto-gerar)"
                    value={ra}
                    onChange={e => setRa(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* Telefone */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Telefone / WhatsApp: *</span>
                    </label>
                    <InfoTooltip
                      title="Múltiplos Contatos Suportados"
                      content="Se o estudante tiver mais de um número de contato, digite ambos separados por barra '/'. Exemplo: 19 99999-0000 / +55 19 90000-9999."
                    />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 19 99999-0000 / +55 19 90000-9999 (aceita mais de um número com /)"
                    value={guardianPhone}
                    onChange={e => setGuardianPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono"
                  />

                  {/* Real-time detection of multiple numbers */}
                  {guardianPhone.trim() && (() => {
                    const detected = getStudentPhones(guardianPhone);
                    return (
                      <div className="mt-2 p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs">
                        <div className="flex items-center justify-between font-semibold text-emerald-900 mb-1.5">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            {detected.length > 1
                              ? `${detected.length} números identificados:`
                              : '1 número identificado:'}
                          </span>
                          {detected.length > 1 && (
                            <span className="bg-emerald-200 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Multi-contatos Ativo
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {detected.map((p, idx) => (
                            <div
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-emerald-300 rounded-md text-emerald-950 font-mono text-[11px] shadow-2xs"
                            >
                              <Smartphone className="w-3 h-3 text-emerald-600" />
                              <span className="font-sans font-bold text-slate-500 text-[10px]">
                                {detected.length > 1 ? `Nº ${idx + 1}:` : 'WhatsApp:'}
                              </span>
                              <span className="font-semibold">{p.formatted}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-[11px] text-slate-500 mt-1">
                    💡 <strong>Múltiplos números:</strong> Separe com barra <code className="bg-slate-100 text-indigo-700 px-1 py-0.5 rounded font-mono font-bold">/</code> (ex: <span className="font-mono text-slate-700">19 99999-0000 / +55 19 90000-9999</span>). O sistema gerenciará ambos os contatos.
                  </p>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isSubmitting ? 'Cadastrando...' : 'Salvar Estudante'}</span>
                </button>
              </div>
            </form>
          )}

          {tab === 'batch' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  <span>Importação em Lote (CSV)</span>
                  <InfoTooltip
                    title="Formato de Importação em Lote"
                    content="Cole linhas no formato: Nome do Estudante ; RA ; Telefone (WhatsApp) ou Nome ; Turma ; RA ; Telefone. Pode colar direto do Excel."
                  />
                </div>

                <button
                  type="button"
                  onClick={handleFillDemoCsv}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Exemplo de Teste</span>
                </button>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Turma Padrão para os Alunos:
                </label>
                <select
                  value={batchTargetClass}
                  onChange={e => {
                    setBatchTargetClass(e.target.value);
                    if (parsedPreview.length > 0) {
                      setParsedPreview(parsedPreview.map(p => ({ ...p, classId: e.target.value })));
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.shift})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 block">
                    Cole os Dados (Nome; RA; Telefone):
                  </label>
                </div>
                <textarea
                  rows={6}
                  value={csvText}
                  onChange={e => parseCsvData(e.target.value)}
                  placeholder={`Mariana Santos Lima;2024-3312;11998765432\nPedro Henrique Costa;2024-4421;11987654321`}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs font-mono text-slate-800 leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {parsedPreview.length > 0 && (
                <div>
                  <div className="font-bold text-slate-800 mb-2 flex items-center justify-between">
                    <span>Prévia de Alunos Reconhecidos ({parsedPreview.length}):</span>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0">
                        <tr>
                          <th className="p-2">Nome</th>
                          <th className="p-2">Turma</th>
                          <th className="p-2">RA</th>
                          <th className="p-2">Telefone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedPreview.map((item, idx) => {
                          const phones = getStudentPhones(item.guardianPhone);
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2 font-bold text-slate-900">{item.name}</td>
                              <td className="p-2 text-slate-700">{item.classId}</td>
                              <td className="p-2 text-slate-500">{item.ra}</td>
                              <td className="p-2">
                                {phones.length > 1 ? (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                                      <Smartphone className="w-2.5 h-2.5" /> {phones.length} números
                                    </span>
                                    <div className="flex flex-col gap-0.5 font-mono text-[11px] text-emerald-700">
                                      {phones.map((p, pIdx) => (
                                        <span key={pIdx}>
                                          <span className="text-slate-400 font-sans text-[9px] mr-1">#{pIdx + 1}</span>
                                          {p.formatted}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="font-mono text-emerald-700">
                                    {phones[0]?.formatted || item.guardianPhone}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleBatchSubmit}
                  disabled={isSubmitting || parsedPreview.length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Importando...'
                      : `Confirmar Importação (${parsedPreview.length} Alunos)`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {tab === 'class' && (
            <form onSubmit={handleCreateClass} noValidate className="space-y-4">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs">
                <span>Criar Nova Turma</span>
                <InfoTooltip
                  title="Estrutura de Turmas"
                  content="Crie códigos de turmas (ex: 1A, 9B, 3EM-A) para organizar a frequência diária e relatórios de contingência."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Código da Turma: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 1A, 2B, 9B, 3EM-C"
                    value={newClassId}
                    onChange={e => setNewClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 uppercase font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Nome de Exibição: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 1º Ano Fundamental A"
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Etapa de Ensino:
                  </label>
                  <select
                    value={newClassGrade}
                    onChange={e => setNewClassGrade(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="Ensino Fundamental I">Ensino Fundamental I (1º ao 5º Ano)</option>
                    <option value="Ensino Fundamental II">Ensino Fundamental II (6º ao 9º Ano)</option>
                    <option value="Ensino Médio">Ensino Médio</option>
                    <option value="EJA - Educação de Jovens e Adultos">EJA</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Turno:
                  </label>
                  <select
                    value={newClassShift}
                    onChange={e => setNewClassShift(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="Manhã">Manhã</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Noite">Noite</option>
                    <option value="Integral">Integral</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSubmitting ? 'Criando...' : 'Cadastrar Nova Turma'}</span>
                </button>
              </div>

              {/* Lista de Turmas Existentes com opção de exclusão */}
              <div className="pt-5 mt-5 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-slate-800 text-xs flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Turmas Cadastradas Atualmente ({classList.length}):</span>
                  </div>
                  <InfoTooltip
                    title="Gerenciar Turmas"
                    content="Exclua turmas antigas ou inativas e gerencie a lista atual de turmas da escola."
                  />
                </div>

                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                  {classList.map(cls => (
                    <div
                      key={cls.id}
                      className="p-3 flex items-center justify-between hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center font-mono">
                          {cls.id}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">{cls.name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>{cls.grade}</span>
                            <span>•</span>
                            <span>Turno: {cls.shift}</span>
                            <span>•</span>
                            <span className="font-medium text-slate-700">
                              {cls.totalStudents} estudantes
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteClass(cls.id, cls.name)}
                        disabled={isSubmitting || isDeletingClass}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                        title={`Excluir turma ${cls.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Excluir Turma</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modal de Confirmação para Excluir Turma (In-App, imune a bloqueios de iframes) */}
      {classToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Excluir Turma da Escola
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Deseja realmente excluir a turma{' '}
              <strong className="text-slate-900">{classToDelete.name}</strong>?
            </p>
            <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center text-[11px] text-slate-500">
              Código / ID: <span className="font-mono font-bold text-slate-800">{classToDelete.id}</span>
            </div>
            <p className="text-[11px] text-rose-600 text-center mt-2 font-medium leading-normal">
              Atenção: Estudantes matriculados nesta turma serão desvinculados do quadro escolar.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setClassToDelete(null)}
                disabled={isDeletingClass}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteClass}
                disabled={isDeletingClass}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isDeletingClass ? (
                  <span>Excluindo...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sim, Excluir Turma</span>
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
