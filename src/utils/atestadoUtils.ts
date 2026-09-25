import { AttendanceRecord } from '../types';

/**
 * Soma dias a uma data no formato YYYY-MM-DD sem sofrer com problemas de fuso horário.
 */
export function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day);
  d.setDate(d.getDate() + daysToAdd);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayOut = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayOut}`;
}

/**
 * Gera texto descritivo padronizado do atestado médico com contagem regressiva.
 */
export function formatMedicalDaysInfo(currentDay: number, totalDays: number): string {
  const remaining = Math.max(0, totalDays - currentDay);
  if (remaining === 0) {
    return `Dia ${currentDay} de ${totalDays} • Último dia de atestado (conclui hoje)`;
  }
  if (remaining === 1) {
    return `Dia ${currentDay} de ${totalDays} • Resta 1 dia para finalizar o atestado`;
  }
  return `Dia ${currentDay} de ${totalDays} • Faltam ${remaining} dias para finalizar o atestado`;
}

/**
 * Cria os registros automáticos de chamada para todos os dias compreendidos no período do atestado médico.
 * Se o atestado já estava em vigência antes de recordDate, preserva a data original de início e gera apenas os dias restantes.
 */
export function generateAtestadoRecordsSequence(params: {
  studentId: string;
  studentName: string;
  classId: string;
  className?: string;
  startDate: string;
  recordDate?: string;
  totalDays: number;
  justification?: string;
  medicalCertificateNote?: string;
  recordedBy: string;
}): AttendanceRecord[] {
  const {
    studentId,
    studentName,
    classId,
    className,
    startDate,
    recordDate = startDate,
    totalDays,
    justification,
    medicalCertificateNote,
    recordedBy
  } = params;

  const validDays = Math.max(1, totalDays);
  // Se a data de início original for anterior ou igual a recordDate, usamos a data original de início
  const originalStart = startDate && startDate <= recordDate ? startDate : recordDate;
  const endDate = addDaysToDateStr(originalStart, validDays - 1);
  const records: AttendanceRecord[] = [];

  // Gera registros a partir de recordDate até endDate (nunca ultrapassando o período do atestado)
  const startD = new Date(originalStart + 'T00:00:00');
  const fromD = new Date(recordDate + 'T00:00:00');
  const startOffset = Math.max(0, Math.round((fromD.getTime() - startD.getTime()) / (1000 * 3600 * 24)));

  for (let i = startOffset; i < validDays; i++) {
    const currentRecDate = addDaysToDateStr(originalStart, i);
    const currentDay = i + 1;
    const remainingDays = Math.max(0, validDays - currentDay);
    const infoText = formatMedicalDaysInfo(currentDay, validDays);
    const customNote = medicalCertificateNote ? ` | Motivo: ${medicalCertificateNote}` : '';

    records.push({
      id: `att-med-${studentId}-${currentRecDate}`,
      studentId,
      studentName,
      classId,
      className: className || '',
      date: currentRecDate,
      status: 'atestado_medico',
      durationDays: validDays,
      medicalDays: validDays,
      medicalDayCurrent: currentDay,
      medicalDaysRemaining: remainingDays,
      medicalStartDate: originalStart,
      medicalEndDate: endDate,
      justification: justification || `Atestado Médico de ${validDays} dia(s) (${infoText})${customNote}`,
      medicalCertificate: `${validDays} dia(s) de atestado • ${infoText}${customNote}`,
      isCountedAsAbsence: false,
      recordedBy,
      recordedAt: new Date().toISOString(),
    });
  }

  return records;
}

/**
 * Gera texto descritivo padronizado de falta justificada prévia com contagem regressiva.
 */
export function formatJustificationDaysInfo(currentDay: number, totalDays: number): string {
  const remaining = Math.max(0, totalDays - currentDay);
  if (remaining === 0) {
    return `Dia ${currentDay} de ${totalDays} • Último dia justificado (conclui hoje)`;
  }
  if (remaining === 1) {
    return `Dia ${currentDay} de ${totalDays} • Resta 1 dia de ausência justificada`;
  }
  return `Dia ${currentDay} de ${totalDays} • Faltam ${remaining} dias para finalizar a justificativa`;
}

/**
 * Cria os registros automáticos de chamada para todos os dias compreendidos no período de falta justificada previamente.
 * Se a justificativa já estava em vigência antes de recordDate, preserva a data original de início e gera apenas os dias restantes.
 */
export function generateJustifiedAbsenceSequence(params: {
  studentId: string;
  studentName: string;
  classId: string;
  className?: string;
  startDate: string;
  recordDate?: string;
  totalDays: number;
  justification?: string;
  recordedBy: string;
}): AttendanceRecord[] {
  const {
    studentId,
    studentName,
    classId,
    className,
    startDate,
    recordDate = startDate,
    totalDays,
    justification,
    recordedBy
  } = params;

  const validDays = Math.max(1, totalDays);
  const originalStart = startDate && startDate <= recordDate ? startDate : recordDate;
  const endDate = addDaysToDateStr(originalStart, validDays - 1);
  const records: AttendanceRecord[] = [];

  const startD = new Date(originalStart + 'T00:00:00');
  const fromD = new Date(recordDate + 'T00:00:00');
  const startOffset = Math.max(0, Math.round((fromD.getTime() - startD.getTime()) / (1000 * 3600 * 24)));

  for (let i = startOffset; i < validDays; i++) {
    const currentRecDate = addDaysToDateStr(originalStart, i);
    const currentDay = i + 1;
    const remainingDays = Math.max(0, validDays - currentDay);
    const infoText = formatJustificationDaysInfo(currentDay, validDays);
    const baseJust = justification?.trim() || 'Comunicação familiar prévia homologada';

    records.push({
      id: `att-just-${studentId}-${currentRecDate}`,
      studentId,
      studentName,
      classId,
      className: className || '',
      date: currentRecDate,
      status: 'falta_justificada',
      durationDays: validDays,
      justificationDays: validDays,
      justificationDayCurrent: currentDay,
      justificationDaysRemaining: remainingDays,
      justificationStartDate: originalStart,
      justificationEndDate: endDate,
      justification: validDays > 1 ? `${baseJust} • ${infoText}` : baseJust,
      isCountedAsAbsence: true,
      recordedBy,
      recordedAt: new Date().toISOString(),
    });
  }

  return records;
}

/**
 * Localiza se o estudante possui atestado médico ou falta justificada em vigência na data informada.
 * Suporta busca por data exata ou por intervalo de vigência (startDate até endDate).
 */
export function findActiveAbsenceForDate(
  records: AttendanceRecord[],
  studentId: string,
  targetDate: string
): AttendanceRecord | undefined {
  if (!records || !studentId || !targetDate) return undefined;

  // 1. Prioriza correspondência de data exata
  const exact = records.find(r => 
    r.studentId === studentId &&
    (r.status === 'atestado_medico' || r.status === 'falta_justificada') &&
    r.date === targetDate
  );
  if (exact) {
    if (exact.status === 'atestado_medico') {
      const total = exact.medicalDays || exact.durationDays || 1;
      const start = exact.medicalStartDate || exact.date;
      const startD = new Date(start + 'T00:00:00');
      const targetD = new Date(targetDate + 'T00:00:00');
      const diffDays = Math.max(0, Math.round((targetD.getTime() - startD.getTime()) / (1000 * 3600 * 24)));
      const curDay = Math.min(total, Math.max(1, diffDays + 1));
      const remDays = Math.max(0, total - curDay);
      return {
        ...exact,
        medicalStartDate: start,
        medicalEndDate: exact.medicalEndDate || addDaysToDateStr(start, total - 1),
        medicalDays: total,
        durationDays: total,
        medicalDayCurrent: curDay,
        medicalDaysRemaining: remDays,
      };
    }
    if (exact.status === 'falta_justificada') {
      const total = exact.justificationDays || exact.durationDays || 1;
      const start = exact.justificationStartDate || exact.date;
      const startD = new Date(start + 'T00:00:00');
      const targetD = new Date(targetDate + 'T00:00:00');
      const diffDays = Math.max(0, Math.round((targetD.getTime() - startD.getTime()) / (1000 * 3600 * 24)));
      const curDay = Math.min(total, Math.max(1, diffDays + 1));
      const remDays = Math.max(0, total - curDay);
      return {
        ...exact,
        justificationStartDate: start,
        justificationEndDate: exact.justificationEndDate || addDaysToDateStr(start, total - 1),
        justificationDays: total,
        durationDays: total,
        justificationDayCurrent: curDay,
        justificationDaysRemaining: remDays,
      };
    }
    return exact;
  }

  // 2. Procura em registros com intervalo de vigência que englobem a targetDate
  for (const r of records) {
    if (r.studentId !== studentId) continue;
    
    if (r.status === 'atestado_medico' && r.medicalStartDate && r.medicalEndDate) {
      if (targetDate >= r.medicalStartDate && targetDate <= r.medicalEndDate) {
        const total = r.medicalDays || r.durationDays || 1;
        const startD = new Date(r.medicalStartDate + 'T00:00:00');
        const targetD = new Date(targetDate + 'T00:00:00');
        const diffDays = Math.round((targetD.getTime() - startD.getTime()) / (1000 * 3600 * 24));
        const curDay = Math.min(total, Math.max(1, diffDays + 1));
        const remDays = Math.max(0, total - curDay);
        return {
          ...r,
          date: targetDate,
          medicalDayCurrent: curDay,
          medicalDaysRemaining: remDays,
          medicalDays: total,
          durationDays: total,
        };
      }
    }

    if (r.status === 'falta_justificada' && r.justificationStartDate && r.justificationEndDate) {
      if (targetDate >= r.justificationStartDate && targetDate <= r.justificationEndDate) {
        const total = r.justificationDays || r.durationDays || 1;
        const startD = new Date(r.justificationStartDate + 'T00:00:00');
        const targetD = new Date(targetDate + 'T00:00:00');
        const diffDays = Math.round((targetD.getTime() - startD.getTime()) / (1000 * 3600 * 24));
        const curDay = Math.min(total, Math.max(1, diffDays + 1));
        const remDays = Math.max(0, total - curDay);
        return {
          ...r,
          date: targetDate,
          justificationDayCurrent: curDay,
          justificationDaysRemaining: remDays,
          justificationDays: total,
          durationDays: total,
        };
      }
    }
  }

  return undefined;
}

/**
 * Localiza se o estudante possui atestado médico em vigência na data informada.
 */
export function findActiveAtestadoForDate(
  records: AttendanceRecord[],
  studentId: string,
  targetDate: string
): AttendanceRecord | undefined {
  const abs = findActiveAbsenceForDate(records, studentId, targetDate);
  if (abs && abs.status === 'atestado_medico') {
    return abs;
  }
  return undefined;
}
