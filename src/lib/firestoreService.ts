import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  UserAccount,
  SchoolClass,
  Student,
  AttendanceRecord,
  ParentAlert,
  InterventionCase,
  GateRecord
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Remove qualquer campo com valor undefined de objetos para impedir que o Firestore rejeite a gravação.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return null as unknown as T;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleanObj: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanObj[key] = sanitizeForFirestore(value);
      }
    }
    return cleanObj as T;
  }
  return data;
}

/**
 * Normaliza o ID de documento para o Firestore garantindo que não contenha barras ou espaços inválidos.
 */
export function sanitizeDocId(id: string): string {
  if (!id) return `doc-${Date.now()}`;
  return String(id).replace(/\//g, '_').replace(/\s+/g, '_');
}

/**
 * Normaliza datas no formato YYYY-MM-DD para comparação precisa.
 */
export function normalizeDateStr(d?: string): string {
  if (!d) return '';
  const clean = String(d).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    const [day, month, year] = clean.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return clean;
}

export function isSameDay(d1?: string, d2?: string): boolean {
  if (!d1 || !d2) return false;
  return normalizeDateStr(d1) === normalizeDateStr(d2);
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firestoreService = {
  // === USERS ===
  async getUsers(): Promise<UserAccount[]> {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserAccount[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as UserAccount);
      });
      // Sort alphabetically by name
      return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } catch (e) {
      console.warn('Erro ao buscar usuários do Firestore:', e);
      return [];
    }
  },

  async saveUser(user: UserAccount): Promise<void> {
    const path = `users/${user.id}`;
    try {
      await setDoc(doc(db, 'users', user.id), user, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteUser(userId: string): Promise<void> {
    const path = `users/${userId}`;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === CLASSES ===
  async getClasses(): Promise<SchoolClass[]> {
    try {
      const snap = await getDocs(collection(db, 'classes'));
      const list: SchoolClass[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as SchoolClass);
      });
      return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } catch (e) {
      console.warn('Erro ao buscar turmas do Firestore:', e);
      return [];
    }
  },

  async saveClass(cls: SchoolClass): Promise<void> {
    const path = `classes/${cls.id}`;
    try {
      await setDoc(doc(db, 'classes', cls.id), cls, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteClass(clsId: string): Promise<void> {
    const path = `classes/${clsId}`;
    try {
      await deleteDoc(doc(db, 'classes', clsId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === STUDENTS ===
  async getStudents(): Promise<Student[]> {
    try {
      const snap = await getDocs(collection(db, 'students'));
      const list: Student[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Student);
      });
      return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } catch (e) {
      console.warn('Erro ao buscar estudantes do Firestore:', e);
      return [];
    }
  },

  async saveStudent(student: Student): Promise<void> {
    const cleanId = sanitizeDocId(student.id);
    const path = `students/${cleanId}`;
    try {
      const cleanData = sanitizeForFirestore({ ...student, id: cleanId });
      await setDoc(doc(db, 'students', cleanId), cleanData, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteStudent(studentId: string): Promise<void> {
    const cleanId = sanitizeDocId(studentId);
    const path = `students/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'students', cleanId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  async batchSaveStudents(students: Student[]): Promise<void> {
    if (!students || students.length === 0) return;
    try {
      const chunkSize = 450;
      for (let i = 0; i < students.length; i += chunkSize) {
        const chunk = students.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const s of chunk) {
          const cleanId = sanitizeDocId(s.id);
          const cleanData = sanitizeForFirestore({ ...s, id: cleanId });
          batch.set(doc(db, 'students', cleanId), cleanData, { merge: true });
        }
        await batch.commit();
      }
    } catch (e) {
      console.error('Erro ao salvar lote de estudantes no Firestore:', e);
    }
  },

  // === ATTENDANCE RECORDS ===
  async getAttendanceRecords(): Promise<AttendanceRecord[]> {
    try {
      const snap = await getDocs(collection(db, 'attendance_records'));
      const list: AttendanceRecord[] = [];
      snap.forEach(d => {
        const raw = d.data() as AttendanceRecord;
        list.push({
          id: d.id,
          ...raw,
          date: normalizeDateStr(raw.date) || raw.date,
        });
      });
      return list;
    } catch (e) {
      console.warn('Erro ao buscar chamadas do Firestore:', e);
      return [];
    }
  },

  async batchSaveAttendance(records: AttendanceRecord[]): Promise<void> {
    if (!records || records.length === 0) return;
    try {
      const chunkSize = 450;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const r of chunk) {
          const cleanId = sanitizeDocId(r.id);
          const cleanRecord = sanitizeForFirestore({
            ...r,
            id: cleanId,
            date: normalizeDateStr(r.date) || r.date,
          });
          batch.set(doc(db, 'attendance_records', cleanId), cleanRecord, { merge: true });
        }
        await batch.commit();
      }
    } catch (e) {
      console.error('Erro ao salvar registros de chamada no Firestore:', e);
    }
  },

  async deleteAttendanceByDate(dateStr: string, classId?: string): Promise<number> {
    if (!dateStr) return 0;
    try {
      const snap = await getDocs(collection(db, 'attendance_records'));
      const toDelete: string[] = [];
      snap.forEach(d => {
        const data = d.data() as AttendanceRecord;
        const recordDate = normalizeDateStr(data.date) || data.date;
        if (isSameDay(recordDate, dateStr)) {
          if (!classId || data.classId === classId || (data.className && data.className.toLowerCase() === classId.toLowerCase())) {
            toDelete.push(d.id);
          }
        }
      });

      const chunkSize = 450;
      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const id of chunk) {
          batch.delete(doc(db, 'attendance_records', id));
        }
        await batch.commit();
      }
      return toDelete.length;
    } catch (e) {
      console.error('Erro ao excluir registros de chamada do Firestore por data:', e);
      return 0;
    }
  },

  // === ALERTS ===
  async getAlerts(): Promise<ParentAlert[]> {
    try {
      const snap = await getDocs(collection(db, 'alerts'));
      const list: ParentAlert[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as ParentAlert);
      });
      return list.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
    } catch (e) {
      console.warn('Erro ao buscar alertas do Firestore:', e);
      return [];
    }
  },

  async saveAlert(alert: ParentAlert): Promise<void> {
    const path = `alerts/${alert.id}`;
    try {
      await setDoc(doc(db, 'alerts', alert.id), alert, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteAlert(alertId: string): Promise<void> {
    const path = `alerts/${alertId}`;
    try {
      await deleteDoc(doc(db, 'alerts', alertId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === INTERVENTIONS ===
  async getInterventions(): Promise<InterventionCase[]> {
    try {
      const snap = await getDocs(collection(db, 'interventions'));
      const list: InterventionCase[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as InterventionCase);
      });
      return list;
    } catch (e) {
      console.warn('Erro ao buscar intervenções do Firestore:', e);
      return [];
    }
  },

  async saveIntervention(intervention: InterventionCase): Promise<void> {
    const path = `interventions/${intervention.id}`;
    try {
      await setDoc(doc(db, 'interventions', intervention.id), intervention, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  // === GATE RECORDS ===
  async getGateRecords(): Promise<GateRecord[]> {
    try {
      const snap = await getDocs(collection(db, 'gate_records'));
      const list: GateRecord[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as GateRecord);
      });
      return list;
    } catch (e) {
      console.warn('Erro ao buscar registros de portaria do Firestore:', e);
      return [];
    }
  },

  async saveGateRecord(record: GateRecord): Promise<void> {
    const path = `gate_records/${record.id}`;
    try {
      await setDoc(doc(db, 'gate_records', record.id), record, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteGateRecord(id: string): Promise<void> {
    const path = `gate_records/${id}`;
    try {
      await deleteDoc(doc(db, 'gate_records', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === OCORRÊNCIAS & MEDIAÇÃO (Nuvem compartilhada para Google Sites) ===
  async getOcorrencias(): Promise<any | null> {
    try {
      const snap = await getDoc(doc(db, 'system_data', 'ocorrencias'));
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (e) {
      console.warn('Erro ao carregar ocorrências do Firestore:', e);
      return null;
    }
  },

  async saveOcorrencias(data: any): Promise<void> {
    try {
      await setDoc(doc(db, 'system_data', 'ocorrencias'), {
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Erro ao salvar ocorrências no Firestore:', e);
    }
  },

  // === TABLETS & AGENDAMENTOS (Nuvem compartilhada para Google Sites) ===
  async getTablets(): Promise<any | null> {
    try {
      const snap = await getDoc(doc(db, 'system_data', 'tablets'));
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (e) {
      console.warn('Erro ao carregar tablets do Firestore:', e);
      return null;
    }
  },

  async saveTablets(data: any): Promise<void> {
    try {
      await setDoc(doc(db, 'system_data', 'tablets'), {
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Erro ao salvar tablets no Firestore:', e);
    }
  },

  // === TESTE DE CONEXÃO DIRETA COM O SERVIDOR (Validação de Acesso Multi-Navegador) ===
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string; databaseId: string }> {
    const start = performance.now();
    try {
      // getDocFromServer garante teste direto contra o servidor do Google Firestore (sem ler apenas cache local)
      await getDocFromServer(doc(db, 'system_data', 'ocorrencias'));
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        latencyMs,
        databaseId: firebaseConfig.firestoreDatabaseId || 'default'
      };
    } catch (error: any) {
      const latencyMs = Math.round(performance.now() - start);
      console.warn('Teste de conexão com Firestore falhou ou offline:', error);
      return {
        success: false,
        latencyMs,
        error: error?.message || String(error),
        databaseId: firebaseConfig.firestoreDatabaseId || 'default'
      };
    }
  },

  // === CARREGAMENTO TOTAL DIRETO DO FIREBASE (Ao efetuar Login ou Inicializar) ===
  async getAllDataDirectly(): Promise<{
    success: boolean;
    classes: SchoolClass[];
    students: Student[];
    users: UserAccount[];
    alerts: ParentAlert[];
    attendance: AttendanceRecord[];
    interventions: InterventionCase[];
    gate: GateRecord[];
    ocorrencias: any | null;
    tablets: any | null;
    latencyMs: number;
    source: 'firebase_direct';
  }> {
    const start = performance.now();
    try {
      const [
        classes,
        students,
        users,
        alerts,
        attendance,
        interventions,
        gate,
        ocorrencias,
        tablets
      ] = await Promise.all([
        firestoreService.getClasses(),
        firestoreService.getStudents(),
        firestoreService.getUsers(),
        firestoreService.getAlerts(),
        firestoreService.getAttendanceRecords(),
        firestoreService.getInterventions(),
        firestoreService.getGateRecords(),
        firestoreService.getOcorrencias(),
        firestoreService.getTablets()
      ]);

      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        classes,
        students,
        users,
        alerts,
        attendance,
        interventions,
        gate,
        ocorrencias,
        tablets,
        latencyMs,
        source: 'firebase_direct'
      };
    } catch (err) {
      console.error('Falha no carregamento direto do Firebase:', err);
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: false,
        classes: [],
        students: [],
        users: [],
        alerts: [],
        attendance: [],
        interventions: [],
        gate: [],
        ocorrencias: null,
        tablets: null,
        latencyMs,
        source: 'firebase_direct'
      };
    }
  }
};

