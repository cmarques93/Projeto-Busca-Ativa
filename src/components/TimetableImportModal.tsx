import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2,
  RefreshCw,
  ArrowRight,
  Layers,
  Users
} from 'lucide-react';
import {
  AnnualTimetableCriteria,
  AtpcaBlockRule,
  CurriculumMatrixCategory,
  CurriculumMatrixItem,
  SchoolClass,
  TimetableGridCell,
  TimetablePeriodDef,
  TimetableTeacherProfile,
  TimetableWorkspace
} from '../types';
import {
  WEEKDAYS,
  getCellKey,
  hasPlatformKeyword,
  inferDisciplineArea,
  isExclusiveGroupDiscipline,
  isNoteDiscipline,
  normalizeAndEnrichTimetableCells,
  normalizeTeacherKey,
  normalizeText
} from '../utils/timetableEngine';
import {
  TimetableImportResult,
  downloadTimetableExcelTemplate,
  matchClassNameToSchoolClass,
  parseTimetableExcelFile
} from '../utils/timetableImportParser';

interface TimetableImportModalProps {
  workspace: TimetableWorkspace;
  criteria: AnnualTimetableCriteria;
  classes: SchoolClass[];
  onClose: () => void;
  onConfirmImport: (nextWorkspace: TimetableWorkspace, message: string) => void;
}

export const TimetableImportModal: React.FC<TimetableImportModalProps> = ({
  workspace,
  criteria,
  classes,
  onClose,
  onConfirmImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [parsedResult, setParsedResult] = useState<TimetableImportResult | null>(null);
  const [classMapping, setClassMapping] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [autoRegisterTeachers, setAutoRegisterTeachers] = useState<boolean>(true);
  const [importAuxSheets, setImportAuxSheets] = useState<boolean>(true);
  const [generateMatrixFromCells, setGenerateMatrixFromCells] = useState<boolean>(
    workspace.matrix.length === 0
  );

  // Filtros da prévia
  const [previewDayFilter, setPreviewDayFilter] = useState<string>('todos');
  const [previewClassFilter, setPreviewClassFilter] = useState<string>('todas');

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = typeof reader.result === 'string' ? reader.result : '';
        resolve(res);
      };
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo selecionado.'));
      reader.readAsDataURL(file);
    });
  };

  const initializeClassMapping = (rawNames: string[]) => {
    const map: Record<string, string> = {};
    for (const raw of rawNames) {
      const matched = matchClassNameToSchoolClass(raw, classes);
      map[raw] = matched ? matched.id : '';
    }
    setClassMapping(map);
  };

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    setParsedResult(null);

    const lower = file.name.toLowerCase();
    const isPdf = lower.endsWith('.pdf') || file.type === 'application/pdf';
    const isExcel =
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls') ||
      lower.endsWith('.csv');

    if (!isPdf && !isExcel) {
      setErrorMsg('Formato não suportado. Envie um arquivo Excel (.xlsx, .xls, .csv) ou PDF (.pdf).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Arquivo muito grande (limite de 15 MB).');
      return;
    }

    setIsLoading(true);
    try {
      if (isExcel) {
        setLoadingStep('Lendo abas e células da planilha Excel...');
        const result = await parseTimetableExcelFile(
          file,
          classes,
          workspace.periods || [],
          criteria,
          (workspace.teachers || []).map(t => t.name)
        );
        setParsedResult(result);
        initializeClassMapping(result.rawClassNames);
        if (result.matrixItems.length > 0) {
          setImportAuxSheets(true);
          setGenerateMatrixFromCells(false);
        }
      } else {
        setLoadingStep('Lendo tabelas e aulas do PDF (sem alterar nem inventar dados)...');
        const base64 = await readFileAsBase64(file);
        const resp = await fetch('/api/timetable/import-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: file.name,
            classes: classes.map(c => ({ id: c.id, name: c.name })),
            periods: workspace.periods || [],
            fixedTerms: criteria.preservedFixedTerms || [],
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error || 'Não foi possível interpretar o PDF enviado.');
        }

        const entries = Array.isArray(data.entries) ? data.entries : [];
        const rawClassNames = Array.from(
          new Set<string>(entries.map((e: any) => String(e.rawClassName || '').trim()).filter(Boolean))
        );

        const result: TimetableImportResult = {
          sourceType: 'pdf',
          fileName: file.name,
          entries,
          rawClassNames,
          matrixItems: [],
          teachers: [],
          atpcaRules: [],
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
          sheetsDetected: ['PDF'],
        };
        if (entries.length === 0) {
          result.warnings.push(
            'Nenhuma aula estruturada foi localizada neste PDF. Se o documento for uma imagem escaneada de baixa qualidade ou layout diferente, tente exportar para Excel (.xlsx).'
          );
        }
        setParsedResult(result);
        initializeClassMapping(rawClassNames);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao processar o arquivo selecionado.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const mappedEntries = useMemo(() => {
    if (!parsedResult) return [];
    const classById = new Map<string, SchoolClass>(classes.map(c => [c.id, c]));
    return parsedResult.entries
      .map(entry => {
        const targetClassId = classMapping[entry.rawClassName];
        const targetClass = targetClassId ? classById.get(targetClassId) : undefined;
        return {
          ...entry,
          targetClassId: targetClass?.id || '',
          targetClassName: targetClass?.name || '',
        };
      })
      .filter(e => Boolean(e.targetClassId));
  }, [parsedResult, classMapping, classes]);

  const detectedUniqueTeachers = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of mappedEntries) {
      const t = (e.teacherName || '').trim();
      if (t) {
        const key = normalizeTeacherKey(t);
        if (key && !map.has(key)) map.set(key, t);
      }
    }
    if (parsedResult) {
      for (const t of parsedResult.teachers) {
        const key = normalizeTeacherKey(t.name);
        if (key && !map.has(key)) map.set(key, t.name);
      }
    }
    return Array.from(map.values());
  }, [mappedEntries, parsedResult]);

  const filteredPreviewEntries = useMemo(() => {
    return mappedEntries.filter(e => {
      if (previewDayFilter !== 'todos' && String(e.dayOfWeek) !== previewDayFilter) return false;
      if (previewClassFilter !== 'todas' && e.targetClassId !== previewClassFilter) return false;
      return true;
    });
  }, [mappedEntries, previewDayFilter, previewClassFilter]);

  const fixedCount = useMemo(
    () => mappedEntries.filter(e => Boolean(e.fixedLabel)).length,
    [mappedEntries]
  );

  const regularCount = mappedEntries.length - fixedCount;

  const unmappedCount = useMemo(() => {
    if (!parsedResult) return 0;
    return parsedResult.rawClassNames.filter(raw => !classMapping[raw]).length;
  }, [parsedResult, classMapping]);

  const handleConfirm = () => {
    if (!parsedResult) return;
    if (mappedEntries.length === 0 && (!importAuxSheets || parsedResult.matrixItems.length === 0)) {
      setErrorMsg('Mapeie ao menos uma turma com aulas válidas antes de confirmar a importação.');
      return;
    }

    const teachingPeriods = (workspace.periods || []).filter(p => !p.isBreak && p.number > 0);
    const periodByNumber = new Map<number, TimetablePeriodDef>(
      teachingPeriods.map(p => [p.number, p])
    );
    const classById = new Map<string, SchoolClass>(classes.map(c => [c.id, c]));

    // 1. Construir células da grade
    const nextCellMap = new Map<string, TimetableGridCell>();
    if (importMode === 'merge') {
      for (const existing of workspace.cells || []) {
        nextCellMap.set(getCellKey(existing.dayOfWeek, existing.periodId, existing.classId), existing);
      }
    }

    let skippedUnknownPeriods = 0;
    for (const item of mappedEntries) {
      const pDef = periodByNumber.get(item.periodNumber);
      if (!pDef) {
        skippedUnknownPeriods++;
        continue;
      }

      const key = getCellKey(item.dayOfWeek, pDef.id, item.targetClassId);
      const isFixed = Boolean(item.fixedLabel);
      const disc = isFixed ? '' : (item.discipline || '').trim();
      const prof = isFixed ? '' : (item.teacherName || '').trim();

      let category: TimetableGridCell['category'] = 'manual';
      if (isFixed) {
        category = 'fixed';
      } else if (isNoteDiscipline(disc, criteria)) {
        category = 'note';
      } else if (isExclusiveGroupDiscipline(disc, criteria)) {
        category = 'ema';
      } else {
        category = 'rest';
      }

      const hasPlat = !isFixed && (category === 'note' || hasPlatformKeyword(disc, criteria));

      nextCellMap.set(key, {
        id: key,
        dayOfWeek: item.dayOfWeek,
        periodId: pDef.id,
        periodNumber: pDef.number,
        periodLabel: pDef.label,
        classId: item.targetClassId,
        className: item.targetClassName,
        discipline: disc,
        teacherName: prof,
        category,
        fixedLabel: isFixed ? (item.fixedLabel || '').trim().toUpperCase() : undefined,
        locked: false,
        hasPlatform: hasPlat,
        platformName: hasPlat ? disc : undefined,
      });
    }

    const nextCells = Array.from(nextCellMap.values());

    // 2. Professores (DB-PROF)
    let nextTeachers: TimetableTeacherProfile[] = [...(workspace.teachers || [])];
    const existingTeacherKeys = new Set(nextTeachers.map(t => normalizeTeacherKey(t.name)));

    if (importAuxSheets && parsedResult.teachers.length > 0) {
      for (const pt of parsedResult.teachers) {
        const key = normalizeTeacherKey(pt.name);
        if (!key || existingTeacherKeys.has(key)) continue;
        existingTeacherKeys.add(key);
        nextTeachers.push({
          id: `prof_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: pt.name,
          area: pt.area || 'LGG',
          multiplicaDay: pt.multiplicaDay,
          multiplicaPeriods: pt.multiplicaPeriods || [],
          dailyLimit: pt.dailyLimit || criteria.defaultTeacherDailyLimit || 7,
        });
      }
    }

    if (autoRegisterTeachers) {
      for (const tName of detectedUniqueTeachers) {
        const key = normalizeTeacherKey(tName);
        if (!key || existingTeacherKeys.has(key)) continue;
        existingTeacherKeys.add(key);

        // Infere áreas iniciais a partir das disciplinas reais ministradas por este docente
        const areaSet = new Set<string>();
        for (const c of nextCells) {
          if (!c.fixedLabel && normalizeTeacherKey(c.teacherName) === key) {
            const a = inferDisciplineArea(c.discipline, criteria);
            if (a && a !== 'OUTROS') areaSet.add(a);
          }
        }
        const inferredAreas = Array.from(areaSet);
        const primaryArea = inferredAreas[0] || 'OUTROS';

        nextTeachers.push({
          id: `prof_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: tName,
          area: primaryArea,
          areas: inferredAreas.length > 0 ? inferredAreas : undefined,
          multiplicaPeriods: [],
          dailyLimit: criteria.defaultTeacherDailyLimit || 7,
        });
      }
    }

    // 3. ATPCA (se vieram nas abas da planilha Excel)
    let nextAtpca: AtpcaBlockRule[] = [...(workspace.atpcaRules || [])];
    if (importAuxSheets && parsedResult.atpcaRules.length > 0) {
      const existingAtpcaSig = new Set(
        nextAtpca.map(a => `${normalizeText(a.area)}__${a.dayOfWeek}__${(a.periodNumbers || []).join(',')}`)
      );
      for (const r of parsedResult.atpcaRules) {
        const sig = `${normalizeText(r.area)}__${r.dayOfWeek}__${r.periods.join(',')}`;
        if (existingAtpcaSig.has(sig)) continue;
        existingAtpcaSig.add(sig);
        nextAtpca.push({
          id: `atpca_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          area: r.area,
          dayOfWeek: r.dayOfWeek,
          periodNumbers: r.periods,
          label: r.label,
        });
      }
    }

    // 4. Matrizes Curriculares
    let nextMatrix: CurriculumMatrixItem[] = [...(workspace.matrix || [])];
    if (importAuxSheets && parsedResult.matrixItems.length > 0) {
      const importedMatrix: CurriculumMatrixItem[] = [];
      for (const m of parsedResult.matrixItems) {
        const clsId = classMapping[m.rawClassName];
        const cls = clsId ? classById.get(clsId) : undefined;
        if (!cls) continue;
        importedMatrix.push({
          id: `mat_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          category: m.category,
          classId: cls.id,
          className: cls.name,
          discipline: m.discipline,
          teacherName: m.teacherName,
          weeklyLessons: m.weeklyLessons,
          hasPlatform: m.category === 'note' || hasPlatformKeyword(m.discipline, criteria),
        });
      }
      if (importedMatrix.length > 0) {
        nextMatrix = importMode === 'replace' ? importedMatrix : [...nextMatrix, ...importedMatrix];
      }
    } else if (generateMatrixFromCells) {
      // Agrega contagem real das aulas regulares importadas por (turma + disciplina + professor)
      const countMap = new Map<
        string,
        {
          category: CurriculumMatrixCategory;
          classId: string;
          className: string;
          discipline: string;
          teacherName: string;
          weeklyLessons: number;
          hasPlatform: boolean;
        }
      >();
      for (const cell of nextCells) {
        if (cell.fixedLabel || !cell.discipline) continue;
        const cat: CurriculumMatrixCategory =
          cell.category === 'note' ? 'note' : cell.category === 'ema' ? 'ema' : 'rest';
        const k = `${cell.classId}__${normalizeText(cell.discipline)}__${normalizeTeacherKey(cell.teacherName || '')}`;
        const prev = countMap.get(k);
        if (prev) {
          prev.weeklyLessons += 1;
        } else {
          countMap.set(k, {
            category: cat,
            classId: cell.classId,
            className: cell.className,
            discipline: cell.discipline,
            teacherName: cell.teacherName || '',
            weeklyLessons: 1,
            hasPlatform: Boolean(cell.hasPlatform),
          });
        }
      }
      const generated: CurriculumMatrixItem[] = Array.from(countMap.values()).map(g => ({
        id: `mat_gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ...g,
      }));
      if (generated.length > 0) {
        nextMatrix = generated;
      }
    }

    const rawWorkspace: TimetableWorkspace = {
      ...workspace,
      cells: nextCells,
      teachers: nextTeachers,
      atpcaRules: nextAtpca,
      matrix: nextMatrix,
      updatedAt: new Date().toISOString(),
    };
    const nextWorkspace = normalizeAndEnrichTimetableCells(rawWorkspace).workspace;

    const parts: string[] = [
      `Importação concluída (${parsedResult.fileName}): ${mappedEntries.length - skippedUnknownPeriods} célula(s) carregadas na grade`,
    ];
    if (skippedUnknownPeriods > 0) {
      parts.push(`${skippedUnknownPeriods} aula(s) fora do intervalo de períodos da escola ignoradas`);
    }
    if (nextMatrix.length > workspace.matrix.length || (generateMatrixFromCells && nextMatrix.length > 0)) {
      parts.push(`${nextMatrix.length} carga(s) na matriz`);
    }

    onConfirmImport(nextWorkspace, parts.join(' • ') + '!');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-400/30">
              <Upload className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm font-black">Importar Horário Atual (Excel ou PDF)</h3>
              <p className="text-[11px] text-slate-300">
                Carregue sua planilha (.xlsx, .xls, .csv) ou PDF do horário atual para testar e gerenciar direto no sistema.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ETAPA 1: UPLOAD DO ARQUIVO */}
          {!parsedResult && !isLoading && (
            <div className="space-y-4">
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/70'
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700">
                    <FileSpreadsheet className="w-7 h-7" />
                  </div>
                  <div className="p-3 rounded-2xl bg-rose-100 text-rose-700">
                    <FileText className="w-7 h-7" />
                  </div>
                </div>
                <p className="text-sm font-black text-slate-900">
                  Clique para selecionar ou arraste o arquivo de horário aqui
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Formatos aceitos: <strong>Excel (.xlsx, .xls)</strong>, <strong>CSV (.csv)</strong> ou <strong>PDF (.pdf)</strong> (até 15 MB)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                  <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <span>Leitura de Planilha Excel / Google Sheets</span>
                  </h4>
                  <p className="text-[11px] text-emerald-900 leading-relaxed">
                    Reconhece automaticamente sua planilha no formato <strong>GRADE COMPLETA</strong> (turmas nas colunas), <strong>Painel por Turma</strong> (dias nas colunas) ou <strong>Lista Tabular</strong>. Se a planilha contiver abas de <strong>Matrizes, DB-PROF ou ATPCA</strong>, também permite importar tudo junto!
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
                  <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-700" />
                    <span>Leitura de Horário em PDF</span>
                  </h4>
                  <p className="text-[11px] text-indigo-900 leading-relaxed">
                    Extrai exatamente as aulas, disciplinas, professores e atividades fixas presentes nas tabelas do PDF, apresentando a prévia completa e o mapeamento de turmas para sua revisão antes de gravar.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  Deseja um arquivo de exemplo já com as turmas cadastradas na sua escola?
                </span>
                <button
                  type="button"
                  onClick={() => downloadTimetableExcelTemplate(classes, workspace.periods || [])}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Modelo Excel (.xlsx)</span>
                </button>
              </div>
            </div>
          )}

          {/* LOADING */}
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <p className="text-sm font-black text-slate-900">{loadingStep || 'Processando arquivo...'}</p>
              <p className="text-xs text-slate-500 max-w-md">
                Aguarde enquanto identificamos os dias da semana, aulas, turmas, disciplinas e docentes exatamente conforme o documento enviado.
              </p>
            </div>
          )}

          {/* ETAPA 2: PRÉVIA & MAPEAMENTO */}
          {parsedResult && !isLoading && (
            <div className="space-y-4">
              {/* Arquivo carregado + botão trocar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  {parsedResult.sourceType === 'excel' ? (
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <FileText className="w-5 h-5 text-rose-600" />
                  )}
                  <div>
                    <p className="text-xs font-black text-slate-900">{parsedResult.fileName}</p>
                    <p className="text-[11px] text-slate-500">
                      Abas/origem: {parsedResult.sheetsDetected.join(', ')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParsedResult(null);
                    setErrorMsg(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Enviar Outro Arquivo</span>
                </button>
              </div>

              {/* Avisos */}
              {parsedResult.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                  <p className="font-black flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Observações da leitura:</span>
                  </p>
                  {parsedResult.warnings.map((w, idx) => (
                    <p key={idx} className="text-[11px]">• {w}</p>
                  ))}
                </div>
              )}

              {/* KPIs da prévia */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <p className="text-[10px] font-bold uppercase text-indigo-700">Aulas Regulares</p>
                  <p className="text-xl font-black text-indigo-950">{regularCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                  <p className="text-[10px] font-bold uppercase text-slate-600">Atividades Fixas</p>
                  <p className="text-xl font-black text-slate-900">{fixedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-[10px] font-bold uppercase text-emerald-700">Turmas Mapeadas</p>
                  <p className="text-xl font-black text-emerald-950">
                    {parsedResult.rawClassNames.length - unmappedCount}/{parsedResult.rawClassNames.length}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
                  <p className="text-[10px] font-bold uppercase text-purple-700">Professores</p>
                  <p className="text-xl font-black text-purple-950">{detectedUniqueTeachers.length}</p>
                </div>
              </div>

              {/* Abas auxiliares encontradas no Excel */}
              {(parsedResult.matrixItems.length > 0 ||
                parsedResult.teachers.length > 0 ||
                parsedResult.atpcaRules.length > 0) && (
                <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 flex flex-wrap items-center justify-between gap-2 text-xs text-teal-950">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-teal-700 shrink-0" />
                    <span>
                      Dados adicionais detectados na planilha:{' '}
                      <strong>{parsedResult.matrixItems.length} itens de matriz</strong>,{' '}
                      <strong>{parsedResult.teachers.length} professores (DB-PROF)</strong> e{' '}
                      <strong>{parsedResult.atpcaRules.length} bloqueios ATPCA</strong>.
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importAuxSheets}
                      onChange={e => setImportAuxSheets(e.target.checked)}
                    />
                    <span>Importar abas auxiliares</span>
                  </label>
                </div>
              )}

              {/* Mapeamento de Turmas */}
              {parsedResult.rawClassNames.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 uppercase">
                      Mapeamento de Turmas (Arquivo → Sistema)
                    </h4>
                    {unmappedCount > 0 ? (
                      <span className="text-[11px] font-bold text-amber-700">
                        {unmappedCount} turma(s) sem vínculo automático
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Todas vinculadas automaticamente
                      </span>
                    )}
                  </div>
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto">
                    {parsedResult.rawClassNames.map(raw => {
                      const mappedId = classMapping[raw] || '';
                      return (
                        <div
                          key={raw}
                          className={`p-2 rounded-lg border flex items-center gap-2 text-xs ${
                            mappedId
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-amber-50/60 border-amber-300'
                          }`}
                        >
                          <span
                            className="font-black text-slate-800 truncate min-w-[68px] max-w-[95px]"
                            title={raw}
                          >
                            {raw}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <select
                            value={mappedId}
                            onChange={e =>
                              setClassMapping(prev => ({ ...prev, [raw]: e.target.value }))
                            }
                            className="flex-1 min-w-0 px-2 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-md"
                          >
                            <option value="">— Ignorar —</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Opções de Importação */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                <p className="font-black text-slate-800 uppercase text-[11px]">
                  Opções de Aplicação na Grade
                </p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span>Substituir a grade atual pelas aulas importadas</span>
                  </label>
                  <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                    />
                    <span>Mesclar (manter células existentes onde o arquivo estiver vazio)</span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-4 pt-1 border-t border-slate-200">
                  <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRegisterTeachers}
                      onChange={e => setAutoRegisterTeachers(e.target.checked)}
                    />
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Cadastrar professores novos no banco de docentes</span>
                  </label>

                  {(!importAuxSheets || parsedResult.matrixItems.length === 0) && (
                    <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={generateMatrixFromCells}
                        onChange={e => setGenerateMatrixFromCells(e.target.checked)}
                      />
                      <span>Gerar cargas semanais nas Matrizes a partir deste horário (ativa Conferências e Dominó)</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Prévia tabular das células */}
              {mappedEntries.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-slate-800 uppercase">
                      Prévia das Aulas ({filteredPreviewEntries.length})
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={previewDayFilter}
                        onChange={e => setPreviewDayFilter(e.target.value)}
                        className="px-2 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="todos">Todos os dias</option>
                        {WEEKDAYS.map(d => (
                          <option key={d.id} value={String(d.id)}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={previewClassFilter}
                        onChange={e => setPreviewClassFilter(e.target.value)}
                        className="px-2 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="todas">Todas as turmas</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Dia</th>
                          <th className="py-2 px-3">Aula</th>
                          <th className="py-2 px-3">Turma</th>
                          <th className="py-2 px-3">Professor (Disciplina)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPreviewEntries.slice(0, 80).map((e, idx) => {
                          const dayLabel = WEEKDAYS.find(d => d.id === e.dayOfWeek)?.short || `Dia ${e.dayOfWeek}`;
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-1.5 px-3 font-bold text-slate-700">{dayLabel}</td>
                              <td className="py-1.5 px-3 font-mono font-bold text-slate-600">{e.periodNumber}ª</td>
                              <td className="py-1.5 px-3 font-bold text-indigo-700">{e.targetClassName}</td>
                              <td className="py-1.5 px-3 font-semibold text-slate-900">
                                {e.fixedLabel ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-black">
                                    FIXA: {e.fixedLabel}
                                  </span>
                                ) : e.teacherName ? (
                                  <span>
                                    <strong>{e.teacherName}</strong>{' '}
                                    <span className="text-slate-600">({e.discipline})</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-600">({e.discipline})</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredPreviewEntries.length > 80 && (
                      <p className="text-center text-[10px] text-slate-400 py-2">
                        Exibindo 80 de {filteredPreviewEntries.length} aulas mapeadas (todas serão importadas ao confirmar).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          {parsedResult && !isLoading && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={mappedEntries.length === 0 && (!importAuxSheets || parsedResult.matrixItems.length === 0)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar e Importar Horário ({mappedEntries.length})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
