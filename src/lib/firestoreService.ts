import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase';
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
    const path = `students/${student.id}`;
    try {
      await setDoc(doc(db, 'students', student.id), student, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteStudent(studentId: string): Promise<void> {
    const path = `students/${studentId}`;
    try {
      await deleteDoc(doc(db, 'students', studentId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  async batchSaveStudents(students: Student[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      for (const s of students) {
        batch.set(doc(db, 'students', s.id), s, { merge: true });
      }
      await batch.commit();
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
        list.push({ id: d.id, ...d.data() } as AttendanceRecord);
      });
      return list;
    } catch (e) {
      console.warn('Erro ao buscar chamadas do Firestore:', e);
      return [];
    }
  },

  async batchSaveAttendance(records: AttendanceRecord[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      for (const r of records) {
        batch.set(doc(db, 'attendance_records', r.id), r, { merge: true });
      }
      await batch.commit();
    } catch (e) {
      console.error('Erro ao salvar registros de chamada no Firestore:', e);
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
  }
};
