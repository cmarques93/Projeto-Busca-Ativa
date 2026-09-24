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
 */
export function generateAtestadoRecordsSequence(params: {
  studentId: string;
  studentName: string;
  classId: string;
  className?: string;
  startDate: string;
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
    totalDays,
    justification,
    medicalCertificateNote,
    recordedBy
  } = params;

  const validDays = Math.max(1, totalDays);
  const endDate = addDaysToDateStr(startDate, validDays - 1);
  const records: AttendanceRecord[] = [];

  for (let i = 0; i < validDays; i++) {
    const recordDate = addDaysToDateStr(startDate, i);
    const currentDay = i + 1;
    const remainingDays = validDays - currentDay;
    const infoText = formatMedicalDaysInfo(currentDay, validDays);
    const customNote = medicalCertificateNote ? ` | Motivo: ${medicalCertificateNote}` : '';

    records.push({
      id: `att-med-${studentId}-${recordDate}`,
      studentId,
      studentName,
      classId,
      className: className || '',
      date: recordDate,
      status: 'atestado_medico',
      durationDays: validDays,
      medicalDays: validDays,
      medicalDayCurrent: currentDay,
      medicalDaysRemaining: remainingDays,
      medicalStartDate: startDate,
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
 */
export function generateJustifiedAbsenceSequence(params: {
  studentId: string;
  studentName: string;
  classId: string;
  className?: string;
  startDate: string;
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
    totalDays,
    justification,
    recordedBy
  } = params;

  const validDays = Math.max(1, totalDays);
  const endDate = addDaysToDateStr(startDate, validDays - 1);
  const records: AttendanceRecord[] = [];

  for (let i = 0; i < validDays; i++) {
    const recordDate = addDaysToDateStr(startDate, i);
    const currentDay = i + 1;
    const remainingDays = validDays - currentDay;
    const infoText = formatJustificationDaysInfo(currentDay, validDays);
    const baseJust = justification?.trim() || 'Comunicação familiar prévia homologada';

    records.push({
      id: `att-just-${studentId}-${recordDate}`,
      studentId,
      studentName,
      classId,
      className: className || '',
      date: recordDate,
      status: 'falta_justificada',
      durationDays: validDays,
      justificationDays: validDays,
      justificationDayCurrent: currentDay,
      justificationDaysRemaining: remainingDays,
      justificationStartDate: startDate,
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
  if (exact) return exact;

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
