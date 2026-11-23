import { GateRecord, Student, TeacherScheduleSlot } from '../types';

export interface SchoolPeriod {
  id: string;
  nome: string;
  inicio: string; // HH:MM
  fim: string; // HH:MM
  tipo: 'aula' | 'intervalo';
}

export const DEFAULT_SCHOOL_PERIODS: SchoolPeriod[] = [
  { id: '1', nome: '1ª Aula', inicio: '07:00', fim: '07:45', tipo: 'aula' },
  { id: '2', nome: '2ª Aula', inicio: '07:45', fim: '08:30', tipo: 'aula' },
  { id: '3', nome: '3ª Aula', inicio: '08:30', fim: '09:15', tipo: 'aula' },
  { id: '4', nome: 'Intervalo / Recreio Manhã', inicio: '09:15', fim: '09:35', tipo: 'intervalo' },
  { id: '5', nome: '4ª Aula', inicio: '09:35', fim: '10:20', tipo: 'aula' },
  { id: '6', nome: '5ª Aula', inicio: '10:20', fim: '11:05', tipo: 'aula' },
  { id: '7', nome: '6ª Aula', inicio: '11:05', fim: '11:50', tipo: 'aula' },
  { id: '8', nome: 'Almoço / Intervalo Intermediário', inicio: '11:50', fim: '12:40', tipo: 'intervalo' },
  { id: '9', nome: '7ª Aula', inicio: '12:40', fim: '13:25', tipo: 'aula' },
  { id: '10', nome: '8ª Aula', inicio: '13:25', fim: '14:10', tipo: 'aula' },
  { id: '11', nome: '9ª Aula', inicio: '14:10', fim: '14:55', tipo: 'aula' },
];

export function timeToMinutes(hhmm: string): number {
  if (!hhmm || !hhmm.includes(':')) return -1;
  const [h, m] = hhmm.trim().split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Carrega a grade de horários configurada para a escola (de CACHE_OCORRENCIAS_APP) ou usa a grade padrão.
 */
export function getSchoolSchedulePeriods(): SchoolPeriod[] {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('CACHE_OCORRENCIAS_APP');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.gradeHorarios) && parsed.gradeHorarios.length > 0) {
          return parsed.gradeHorarios;
        }
      }
    }
  } catch {
    // Fallback silencioso para a grade padrão
  }
  return DEFAULT_SCHOOL_PERIODS;
}

/**
 * Encontra a aula ou intervalo correspondente ao horário informado (HH:MM).
 * Prioriza intervalo exato (inicio <= t < fim); caso esteja fora ou exatamente no limite,
 * seleciona o período mais próximo cronologicamente.
 */
export function findPeriodByTime(
  timeHHMM: string,
  periods: SchoolPeriod[] = getSchoolSchedulePeriods()
): SchoolPeriod | null {
  if (!periods || periods.length === 0) return null;
  const targetMins = timeToMinutes(timeHHMM);
  if (targetMins < 0) return periods[0];

  // 1. Correspondência exata dentro da faixa [inicio, fim)
  const exact = periods.find(p => {
    const start = timeToMinutes(p.inicio);
    const end = timeToMinutes(p.fim);
    return start >= 0 && end >= 0 && targetMins >= start && targetMins < end;
  });
  if (exact) return exact;

  // 2. Se for exatamente igual ao fim do último período ou antes do primeiro / após o último
  const sorted = [...periods].sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
  const firstStart = timeToMinutes(sorted[0].inicio);
  if (targetMins < firstStart) return sorted[0];

  const lastEnd = timeToMinutes(sorted[sorted.length - 1].fim);
  if (targetMins >= lastEnd) return sorted[sorted.length - 1];

  // 3. Caso haja lacuna entre horários, retorna o período com início mais próximo
  let closest = sorted[0];
  let bestDiff = Infinity;
  for (const p of sorted) {
    const mid = (timeToMinutes(p.inicio) + timeToMinutes(p.fim)) / 2;
    const diff = Math.abs(targetMins - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = p;
    }
  }
  return closest;
}

export function formatPeriodLabel(period: SchoolPeriod | null | undefined): string {
  if (!period) return 'Não vinculado';
  return `${period.nome} (${period.inicio} - ${period.fim})`;
}

export function normalizeNameForMatch(value?: string): string {
  return (value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bprof[aª]?\.?\s*/g, '')
    .replace(/\s+/g, ' ');
}

export function isStudentTutorMatch(student: Pick<Student, 'tutor'>, teacherName: string): boolean {
  const tNorm = normalizeNameForMatch(student.tutor);
  const userNorm = normalizeNameForMatch(teacherName);
  if (!tNorm || !userNorm) return false;
  if (tNorm === userNorm) return true;
  if (tNorm.includes(userNorm) || userNorm.includes(tNorm)) return true;

  // Compara primeiro + último nome caso abreviação difira
  const tParts = tNorm.split(' ').filter(Boolean);
  const uParts = userNorm.split(' ').filter(Boolean);
  if (tParts.length >= 2 && uParts.length >= 2) {
    return tParts[0] === uParts[0] && tParts[tParts.length - 1] === uParts[uParts.length - 1];
  }
  return false;
}

export function getDayOfWeekFromDateStr(dateStr: string): number {
  if (!dateStr) return -1;
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-').map(Number);
  if (parts.length !== 3) return -1;
  const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  return d.getDay(); // 0 = Dom, 1 = Seg ... 6 = Sáb
}

export interface AbsenceTeacherMatchResult {
  allowed: boolean;
  isTutorado: boolean;
  hasScheduledClassAbsence: boolean;
  matchedSlots: TeacherScheduleSlot[];
  matchReasonLabel: string;
}

/**
 * Avalia se uma ausência/justificativa deve ser exibida para um professor específico:
 * Regra: Somente aparece para o professor que teve a ausência do estudante na sua aula
 * (de acordo com a sincronia da grade horária) E/OU para seus tutorados.
 */
export function evaluateTeacherAbsenceVisibility(params: {
  student: Pick<Student, 'id' | 'tutor' | 'classId' | 'className'>;
  dateStr: string;
  teacherName: string;
  teacherSchedules: TeacherScheduleSlot[];
  gateRecordsForDate: GateRecord[];
  schoolPeriods?: SchoolPeriod[];
}): AbsenceTeacherMatchResult {
  const {
    student,
    dateStr,
    teacherName,
    teacherSchedules,
    gateRecordsForDate,
    schoolPeriods = getSchoolSchedulePeriods(),
  } = params;

  const isTutorado = isStudentTutorMatch(student, teacherName);
  const teacherNorm = normalizeNameForMatch(teacherName);
  const dayOfWeek = getDayOfWeekFromDateStr(dateStr);

  // Localiza horários do professor nesta turma e dia da semana
  const sClassIdNorm = (student.classId || '').trim().toLowerCase();
  const sClassNameNorm = (student.className || '').trim().toLowerCase();

  const teacherSlotsForClassAndDay = teacherSchedules.filter(slot => {
    const slotTeacherNorm = normalizeNameForMatch(slot.teacherName);
    const sameTeacher =
      slotTeacherNorm === teacherNorm ||
      slotTeacherNorm.includes(teacherNorm) ||
      teacherNorm.includes(slotTeacherNorm);
    if (!sameTeacher) return false;

    if (dayOfWeek >= 0 && slot.dayOfWeek !== dayOfWeek) return false;

    const slotClassIdNorm = (slot.classId || '').trim().toLowerCase();
    const slotClassNameNorm = (slot.className || '').trim().toLowerCase();
    return (
      (sClassIdNorm && (slotClassIdNorm === sClassIdNorm || slotClassNameNorm === sClassIdNorm)) ||
      (sClassNameNorm && (slotClassNameNorm === sClassNameNorm || slotClassIdNorm === sClassNameNorm))
    );
  });

  // Verifica se há movimentação parcial na portaria para este estudante nesta data
  const studentGateToday = gateRecordsForDate.filter(g => g.studentId === student.id);

  let matchedSlots: TeacherScheduleSlot[] = [];
  if (teacherSlotsForClassAndDay.length > 0) {
    if (studentGateToday.length === 0) {
      // Falta no dia inteiro -> esteve ausente em todas as aulas do professor naquele dia
      matchedSlots = teacherSlotsForClassAndDay;
    } else {
      // Se houve registro de portaria (entrada tardia ou saída antecipada), verifica em quais aulas o aluno faltou
      matchedSlots = teacherSlotsForClassAndDay.filter(slot => {
        const period = schoolPeriods.find(
          p => p.id === slot.periodId || p.nome.toLowerCase() === (slot.periodName || '').toLowerCase()
        );
        if (!period) return true;
        const pStart = timeToMinutes(period.inicio);
        const pEnd = timeToMinutes(period.fim);

        return studentGateToday.some(g => {
          const gMins = timeToMinutes(g.time);
          if (gMins < 0) return true;
          if (g.type === 'entrada_tardia') {
            // Chegou após o início da aula -> perdeu toda a aula ou parte dela
            return gMins > pStart;
          }
          if (g.type === 'saida_antecipada') {
            // Saiu antes do término da aula -> perdeu esta aula ou o restante dela
            return gMins < pEnd;
          }
          return true;
        });
      });
    }
  }

  const hasScheduledClassAbsence = matchedSlots.length > 0;
  const allowed = isTutorado || hasScheduledClassAbsence;

  let matchReasonLabel = '';
  if (isTutorado && hasScheduledClassAbsence) {
    matchReasonLabel = `Tutorado + Aula na Grade (${matchedSlots.map(s => s.periodName).join(', ')})`;
  } else if (isTutorado) {
    matchReasonLabel = 'Meu Tutorado';
  } else if (hasScheduledClassAbsence) {
    matchReasonLabel = `Ausência na sua aula (${matchedSlots.map(s => `${s.periodName}${s.subject ? ` • ${s.subject}` : ''}`).join(', ')})`;
  }

  return {
    allowed,
    isTutorado,
    hasScheduledClassAbsence,
    matchedSlots,
    matchReasonLabel,
  };
}

/**
 * Extrai um identificador comparável de período/aula (ex: "1ª Aula - (07h as 7h50)" -> "1a aula")
 */
export function normalizePeriodForMatch(periodLabelOrId?: string): string {
  const raw = (periodLabelOrId || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!raw) return '';
  const aulaMatch = raw.match(/(\d+)\s*[ªa°]?\s*aula/);
  if (aulaMatch) return `${aulaMatch[1]}a aula`;
  const beforeDash = raw.split(/\s*[-–]\s*/)[0].trim();
  return beforeDash || raw;
}

export function isSamePeriodLabel(a?: string, b?: string): boolean {
  const na = normalizePeriodForMatch(a);
  const nb = normalizePeriodForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Retorna todos os slots da Grade Horária que possuem plataforma digital para uma data (dia da semana) e aula.
 */
export function findPlatformSlotsForDateAndPeriod(params: {
  dateStr: string;
  aulaLabel: string;
  teacherSchedules: TeacherScheduleSlot[];
}): TeacherScheduleSlot[] {
  const { dateStr, aulaLabel, teacherSchedules } = params;
  if (!dateStr || !aulaLabel || !teacherSchedules || teacherSchedules.length === 0) return [];
  const dayOfWeek = getDayOfWeekFromDateStr(dateStr);
  if (dayOfWeek < 0) return [];

  return teacherSchedules.filter(slot => {
    if (!slot.hasPlatform) return false;
    if (slot.dayOfWeek !== dayOfWeek) return false;
    return isSamePeriodLabel(slot.periodName || slot.periodId, aulaLabel);
  });
}

/**
 * Verifica se há trava de uso por plataforma digital para um agendamento específico (data, aula, turma e/ou professor).
 */
export function findPlatformLockForBooking(params: {
  dateStr: string;
  aulaLabel: string;
  className?: string;
  teacherName?: string;
  teacherSchedules: TeacherScheduleSlot[];
}): TeacherScheduleSlot | null {
  const { dateStr, aulaLabel, className, teacherName, teacherSchedules } = params;
  const dayPlatformSlots = findPlatformSlotsForDateAndPeriod({
    dateStr,
    aulaLabel,
    teacherSchedules,
  });
  if (dayPlatformSlots.length === 0) return null;

  const targetClassNorm = normalizeNameForMatch(className);
  const targetTeacherNorm = normalizeNameForMatch(teacherName);

  // 1. Prioriza correspondência exata com a turma selecionada
  if (targetClassNorm) {
    const classMatch = dayPlatformSlots.find(slot => {
      const sClassNorm = normalizeNameForMatch(slot.className);
      const sClassIdNorm = normalizeNameForMatch(slot.classId);
      return (
        (sClassNorm && (sClassNorm === targetClassNorm || sClassNorm.includes(targetClassNorm) || targetClassNorm.includes(sClassNorm))) ||
        (sClassIdNorm && sClassIdNorm === targetClassNorm)
      );
    });
    if (classMatch) return classMatch;
  }

  // 2. Caso a turma ainda não tenha sido escolhida, verifica se o professor selecionado tem aula com plataforma nesse horário
  if (!targetClassNorm && targetTeacherNorm) {
    const teacherMatch = dayPlatformSlots.find(slot => {
      const sTeacherNorm = normalizeNameForMatch(slot.teacherName);
      return (
        sTeacherNorm &&
        (sTeacherNorm === targetTeacherNorm || sTeacherNorm.includes(targetTeacherNorm) || targetTeacherNorm.includes(sTeacherNorm))
      );
    });
    if (teacherMatch) return teacherMatch;
  }

  return null;
}

