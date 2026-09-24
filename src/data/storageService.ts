import {
  UserAccount,
  UserRole,
  AttendanceStatus,
  GateRecord,
  AttendanceRecord,
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  MonthlyPedagogicalReport
} from '../types';
import {
  DEFAULT_USERS,
  DEFAULT_PINS,
  DEFAULT_CLASSES,
  DEFAULT_STUDENTS,
  DEFAULT_ALERTS,
  DEFAULT_INTERVENTIONS,
  DEFAULT_REPORT
} from './fallbackData';
import { firestoreService, isSameDay, normalizeDateStr } from '../lib/firestoreService';
import { generateAtestadoRecordsSequence, generateJustifiedAbsenceSequence } from '../utils/atestadoUtils';

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Direção Escolar (Administrador)';
    case 'gestao_paac':
      return 'Coordenação Pedagógica / PAAC';
    case 'aoe':
      return 'Agente de Organização Escolar (AOE)';
    case 'professor':
      return 'Professor(a) / Docente';
    default:
      return 'Usuário Escolar';
  }
}

// Helper to safely access localStorage (handles SSR, disabled cookies, etc.)
function getStored<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    if (!val) return fallback;
    return JSON.parse(val);
  } catch (e) {
    console.warn(`Erro ao ler ${key} do localStorage:`, e);
    return fallback;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Erro ao salvar ${key} no localStorage:`, e);
  }
}

// Ensure default users have their default PIN attached
function initializeDefaultUsers(): UserAccount[] {
  return DEFAULT_USERS.map(u => ({
    ...u,
    pin: DEFAULT_PINS[u.id]?.pin || '1234',
    createdAt: new Date().toISOString()
  }));
}

export const storageService = {
  // === SETTERS PARA SINCRONIZAÇÃO COM A NUVEM ===
  setUsers: (users: UserAccount[]): void => {
    setStored('school_users', users);
  },
  setClasses: (classes: SchoolClass[]): void => {
    setStored('school_classes', classes);
  },
  setStudents: (students: Student[]): void => {
    setStored('school_students', students);
  },
  setAttendanceRecords: (records: AttendanceRecord[]): void => {
    setStored('school_attendance', records);
  },
  setAlerts: (alerts: ParentAlert[]): void => {
    setStored('school_alerts', alerts);
  },
  setInterventions: (interventions: InterventionCase[]): void => {
    setStored('school_interventions', interventions);
  },
  setGateRecords: (records: GateRecord[]): void => {
    setStored('school_gate_records', records);
  },

  // === USUÁRIOS & ACESSOS ===
  getUsers: (): UserAccount[] => {
    let users = getStored<UserAccount[]>('school_users', []);
    if (!users || users.length === 0) {
      users = initializeDefaultUsers();
      setStored('school_users', users);
    }
    return users;
  },

  getUserById: (id: string): UserAccount | undefined => {
    const users = storageService.getUsers();
    return users.find(u => u.id === id);
  },

  createUser: (data: { name: string; username?: string; role: UserRole; pin: string; notes?: string }): UserAccount => {
    const cleanName = data.name.trim();
    const cleanPin = (data.pin || '').trim();
    const cleanUsername = data.username?.trim() || cleanName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.');
    
    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      username: cleanUsername,
      role: data.role,
      roleLabel: getRoleLabel(data.role),
      pin: cleanPin,
      createdAt: new Date().toISOString(),
      active: true,
      notes: data.notes?.trim() || ''
    };

    const users = storageService.getUsers();
    users.push(newUser);
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveUser(newUser).catch(err => console.warn('Erro ao salvar usuário no Firestore:', err));

    return newUser;
  },

  updateUser: (id: string, updates: Partial<UserAccount>): UserAccount | null => {
    const users = storageService.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;

    users[idx] = {
      ...users[idx],
      ...updates,
      roleLabel: updates.role ? getRoleLabel(updates.role) : users[idx].roleLabel
    };
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveUser(users[idx]).catch(err => console.warn('Erro ao atualizar usuário no Firestore:', err));

    return users[idx];
  },

  updateUserPin: (id: string, pin: string): void => {
    storageService.updateUser(id, { pin: pin.trim() });
  },

  deleteUser: (userId: string): boolean => {
    const users = storageService.getUsers().filter(u => u.id !== userId);
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteUser(userId).catch(err => console.warn('Erro ao deletar usuário do Firestore:', err));

    return true;
  },

  recordUserLogin: (userId: string): void => {
    try {
      const now = new Date().toISOString();
      const users = storageService.getUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        users[idx].lastLogin = now;
        setStored('school_users', users);
        firestoreService.saveUser(users[idx]).catch(err => console.warn('Erro ao atualizar lastLogin no Firestore:', err));
      }
    } catch (e) {
      console.warn('Erro ao registrar lastLogin:', e);
    }
  },

  verifyPin: (userId: string, pin: string): { success: boolean; user?: any; error?: string } => {
    const users = storageService.getUsers();
    const cleanPin = pin.trim();
    const user = users.find(u => u.id === userId);

    if (!user) {
      const defaultPinObj = DEFAULT_PINS[userId];
      if (defaultPinObj && defaultPinObj.pin === cleanPin) {
        return { success: true, user: defaultPinObj.user };
      }
      return { success: false, error: 'Usuário não localizado.' };
    }

    if (user.active === false) {
      return { success: false, error: 'Este usuário está inativo no sistema.' };
    }

    if (user.pin === cleanPin || (DEFAULT_PINS[userId] && DEFAULT_PINS[userId].pin === cleanPin)) {
      // Registra e sincroniza último acesso imediatamente
      const now = new Date().toISOString();
      user.lastLogin = now;
      storageService.updateUser(user.id, { lastLogin: now });

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          roleLabel: user.roleLabel || getRoleLabel(user.role)
        }
      };
    }

    return { success: false, error: 'Senha de 4 dígitos incorreta.' };
  },

  // === TURMAS ===
  getClasses: (): SchoolClass[] => {
    return getStored<SchoolClass[]>('school_classes', DEFAULT_CLASSES);
  },

  createClass: (cls: SchoolClass): SchoolClass => {
    const classes = storageService.getClasses();
    const existingIdx = classes.findIndex(c => c.id === cls.id);
    if (existingIdx >= 0) {
      classes[existingIdx] = cls;
    } else {
      classes.push(cls);
    }
    setStored('school_classes', classes);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveClass(cls).catch(err => console.warn('Erro ao salvar turma no Firestore:', err));

    return cls;
  },

  updateClass: (clsId: string, updates: Partial<SchoolClass>): SchoolClass | null => {
    const classes = storageService.getClasses();
    const idx = classes.findIndex(c => c.id === clsId);
    if (idx === -1) return null;
    classes[idx] = { ...classes[idx], ...updates };
    setStored('school_classes', classes);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveClass(classes[idx]).catch(err => console.warn('Erro ao atualizar turma no Firestore:', err));

    return classes[idx];
  },

  deleteClass: (clsId: string): void => {
    const classes = storageService.getClasses().filter(c => c.id !== clsId);
    setStored('school_classes', classes);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteClass(clsId).catch(err => console.warn('Erro ao deletar turma no Firestore:', err));
  },

  // === ESTUDANTES ===
  getStudents: (classId?: string): Student[] => {
    const students = getStored<Student[]>('school_students', DEFAULT_STUDENTS);
    if (classId) {
      return students.filter(s => s.classId === classId);
    }
    return students;
  },

  getStudentById: (id: string): Student | undefined => {
    const students = storageService.getStudents();
    return students.find(s => s.id === id);
  },

  getStudentDetails: (studentId: string): any => {
    const student = storageService.getStudentById(studentId);
    if (!student) return null;
    const history = storageService.getAttendanceRecords()
      .filter(r => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
    const alerts = storageService.getAlerts()
      .filter(a => a.studentId === studentId)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const intervention = storageService.getInterventions().find(i => i.studentId === studentId);

    return {
      student,
      attendanceHistory: history,
      alerts,
      intervention
    };
  },

  createStudent: (data: Partial<Student>): Student => {
    const students = storageService.getStudents();
    const id = data.id || `std-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    const newStudent: Student = {
      id,
      name: data.name || '',
      ra: data.ra || '',
      classId: data.classId || '',
      className: data.className || '',
      tutor: data.tutor || '',
      guardianName: data.guardianName || '',
      guardianPhone: data.guardianPhone || '',
      guardianRelationship: data.guardianRelationship || 'Responsável',
      address: data.address || '',
      neighborhood: data.neighborhood || '',
      status: data.status || 'regular',
      riskLevel: data.riskLevel || 'baixo',
      totalSchoolDays: data.totalSchoolDays ?? 45,
      totalAbsences: data.totalAbsences ?? 0,
      consecutiveAbsences: data.consecutiveAbsences ?? 0,
      attendanceRate: data.attendanceRate ?? 100,
      vulnerabilityFactors: data.vulnerabilityFactors || [],
      lastAttendanceDate: data.lastAttendanceDate || new Date().toISOString().split('T')[0],
      notes: data.notes || ''
    };
    students.push(newStudent);
    setStored('school_students', students);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveStudent(newStudent).catch(err => console.warn('Erro ao salvar estudante no Firestore:', err));

    return newStudent;
  },

  updateStudent: (studentId: string, updates: Partial<Student>): Student | null => {
    const students = storageService.getStudents();
    const idx = students.findIndex(s => s.id === studentId);
    if (idx === -1) return null;
    students[idx] = { ...students[idx], ...updates };
    setStored('school_students', students);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveStudent(students[idx]).catch(err => console.warn('Erro ao atualizar estudante no Firestore:', err));

    return students[idx];
  },

  deleteStudent: (studentId: string): void => {
    const students = storageService.getStudents().filter(s => s.id !== studentId);
    setStored('school_students', students);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteStudent(studentId).catch(err => console.warn('Erro ao deletar estudante no Firestore:', err));
  },

  batchCreateStudents: (newStudents: Partial<Student>[]): number => {
    const existing = storageService.getStudents();
    const createdList: Student[] = [];
    let count = 0;
    for (const data of newStudents) {
      const id = data.id || `std-${Date.now()}-${count}-${Math.random().toString(36).substring(2, 5)}`;
      const s: Student = {
        id,
        name: data.name || '',
        ra: data.ra || '',
        classId: data.classId || '',
        className: data.className || '',
        tutor: data.tutor || '',
        guardianName: data.guardianName || '',
        guardianPhone: data.guardianPhone || '',
        guardianRelationship: data.guardianRelationship || 'Responsável',
        address: data.address || '',
        neighborhood: data.neighborhood || '',
        status: data.status || 'regular',
        riskLevel: data.riskLevel || 'baixo',
        totalSchoolDays: data.totalSchoolDays ?? 45,
        totalAbsences: data.totalAbsences ?? 0,
        consecutiveAbsences: data.consecutiveAbsences ?? 0,
        attendanceRate: data.attendanceRate ?? 100,
        vulnerabilityFactors: data.vulnerabilityFactors || [],
        lastAttendanceDate: data.lastAttendanceDate || new Date().toISOString().split('T')[0],
        notes: data.notes || ''
      };
      existing.push(s);
      createdList.push(s);
      count++;
    }
    setStored('school_students', existing);

    // Sincroniza em nuvem no Firestore
    firestoreService.batchSaveStudents(createdList).catch(err => console.warn('Erro ao salvar lote de estudantes no Firestore:', err));

    return count;
  },

  // === FREQUÊNCIA ===
  recordAttendance: async (
    items: {
      studentId: string;
      status: AttendanceStatus;
      notes?: string;
      durationDays?: number;
      justification?: string;
      medicalCertificate?: string;
      medicalDays?: number;
      studentName?: string;
      className?: string;
    }[],
    classId: string,
    recordedBy: string,
    date?: string
  ): Promise<any> => {
    const records = storageService.getAttendanceRecords();
    const recordDate = date || new Date().toISOString().split('T')[0];
    const allStudents = storageService.getStudents();
    const allClasses = storageService.getClasses();
    const targetClass = allClasses.find(c => c.id === classId || c.name === classId);

    let newRecords: AttendanceRecord[] = [];

    if (items.length === 0 && classId) {
      // Marcador de turma lançada caso a turma não tenha estudantes ainda
      newRecords = [{
        id: `att-cls-${classId}-${recordDate}`,
        studentId: `cls-marker-${classId}`,
        studentName: `Turma ${targetClass?.name || classId} (Chamada Concluída)`,
        classId,
        className: targetClass?.name || classId,
        date: recordDate,
        status: 'presente',
        durationDays: 1,
        isCountedAsAbsence: false,
        recordedBy,
        recordedAt: new Date().toISOString(),
        justification: 'Frequência da turma registrada',
      }];
    } else {
      items.forEach(item => {
        const student = allStudents.find(s => s.id === item.studentId);
        const duration = item.medicalDays || (item.durationDays && item.durationDays > 1 ? item.durationDays : 1);

        if (item.status === 'atestado_medico') {
          const atestadoSeq = generateAtestadoRecordsSequence({
            studentId: item.studentId,
            studentName: item.studentName || student?.name || 'Estudante',
            classId: classId || student?.classId || '',
            className: item.className || student?.className || targetClass?.name || '',
            startDate: recordDate,
            totalDays: duration,
            justification: item.justification,
            medicalCertificateNote: item.medicalCertificate,
            recordedBy,
          });
          newRecords.push(...atestadoSeq);
        } else if (item.status === 'falta_justificada' && duration > 1) {
          const justifiedSeq = generateJustifiedAbsenceSequence({
            studentId: item.studentId,
            studentName: item.studentName || student?.name || 'Estudante',
            classId: classId || student?.classId || '',
            className: item.className || student?.className || targetClass?.name || '',
            startDate: recordDate,
            totalDays: duration,
            justification: item.justification,
            recordedBy,
          });
          newRecords.push(...justifiedSeq);
        } else {
          const isCountedAsAbsence = item.status === 'falta_injustificada' || item.status === 'falta_justificada';
          newRecords.push({
            id: `att-${Date.now()}-${item.studentId}-${recordDate}`,
            studentId: item.studentId,
            studentName: item.studentName || student?.name || 'Estudante',
            classId: classId || student?.classId || '',
            className: item.className || student?.className || targetClass?.name || '',
            date: recordDate,
            status: item.status,
            durationDays: duration,
            justificationDays: item.status === 'falta_justificada' ? duration : undefined,
            justificationDayCurrent: item.status === 'falta_justificada' ? 1 : undefined,
            justificationDaysRemaining: item.status === 'falta_justificada' ? 0 : undefined,
            justification: item.justification || item.notes || '',
            medicalCertificate: item.medicalCertificate,
            medicalDays: item.medicalDays,
            isCountedAsAbsence,
            recordedBy,
            recordedAt: new Date().toISOString(),
          });
        }
      });
    }

    // Replace existing records for same student & dates of newRecords
    const datesAndStudents = new Set(newRecords.map(nr => `${nr.studentId}__${nr.date}`));
    const filteredRecords = records.filter(r => {
      const key = `${r.studentId}__${r.date}`;
      if (datesAndStudents.has(key)) return false;
      if (isSameDay(r.date, recordDate) && (r.classId === classId && r.studentId.startsWith('cls-marker-'))) return false;
      return true;
    });
    filteredRecords.push(...newRecords);
    setStored('school_attendance', filteredRecords);

    // Update students absence counts based on real filteredRecords
    const updatedStudents: Student[] = [];
    allStudents.forEach(st => {
      const item = items.find(i => i.studentId === st.id);
      if (item) {
        // Obter todo o histórico real do estudante em filteredRecords
        const studentHistory = filteredRecords
          .filter(r => r.studentId === st.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Contabiliza total de ausências reais
        const absenceRecords = studentHistory.filter(
          r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
        );
        st.totalAbsences = absenceRecords.reduce((acc, r) => acc + (r.durationDays || 1), 0);

        // Contabiliza faltas consecutivas a partir da data mais recente
        let cons = 0;
        for (const r of studentHistory) {
          if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
            cons += (r.durationDays || 1);
          } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
            break;
          }
        }
        st.consecutiveAbsences = cons;

        // Atualiza última data de presença
        const lastPres = studentHistory.find(r => r.status === 'presente' || (r.status as any) === 'atraso');
        if (lastPres) {
          st.lastAttendanceDate = lastPres.date;
        }

        st.attendanceRate = Math.max(0, Math.round(((st.totalSchoolDays - st.totalAbsences) / st.totalSchoolDays) * 100));
        if (st.consecutiveAbsences >= 4 || st.attendanceRate < 75) {
          st.riskLevel = 'critico';
          st.status = 'evasao_iminente';
        } else if (st.consecutiveAbsences >= 2 || st.attendanceRate < 80) {
          st.riskLevel = 'alto';
          st.status = 'alerta';
        } else {
          st.riskLevel = 'baixo';
          st.status = 'regular';
        }
        updatedStudents.push(st);
      }
    });
    if (updatedStudents.length > 0) {
      setStored('school_students', allStudents);
    }

    // Sincroniza em nuvem no Firestore de forma garantida e aguardada
    try {
      await firestoreService.batchSaveAttendance(newRecords);
      if (updatedStudents.length > 0) {
        await firestoreService.batchSaveStudents(updatedStudents);
      }
    } catch (err) {
      console.warn('Erro ao sincronizar chamadas no Firestore:', err);
    }

    return { success: true, count: newRecords.length, newRecords };
  },

  getAttendanceRecords: (classId?: string, date?: string): AttendanceRecord[] => {
    let records = getStored<AttendanceRecord[]>('school_attendance', []);
    if (classId) {
      const cleanClassId = classId.trim().toLowerCase();
      records = records.filter(r => (r.classId || '').trim().toLowerCase() === cleanClassId || (r.className || '').trim().toLowerCase() === cleanClassId);
    }
    if (date) {
      records = records.filter(r => isSameDay(r.date, date));
    }
    return records;
  },

  deleteAttendanceByDate: async (dateStr: string, classId?: string): Promise<{ deletedCount: number }> => {
    if (!dateStr) return { deletedCount: 0 };
    const allRecords = getStored<AttendanceRecord[]>('school_attendance', []);
    const allStudents = getStored<Student[]>('school_students', []);
    const affectedStudentIds = new Set<string>();

    const remainingRecords = allRecords.filter(r => {
      const matchDate = isSameDay(r.date, dateStr);
      if (!matchDate) return true;
      if (classId) {
        const cleanCId = classId.trim().toLowerCase();
        const matchClass = (r.classId || '').trim().toLowerCase() === cleanCId || (r.className || '').trim().toLowerCase() === cleanCId;
        if (!matchClass) return true;
      }
      affectedStudentIds.add(r.studentId);
      return false; // delete
    });

    const deletedCount = allRecords.length - remainingRecords.length;
    setStored('school_attendance', remainingRecords);

    // Recalcula totais dos estudantes afetados
    const updatedStudents: Student[] = [];
    allStudents.forEach(st => {
      if (affectedStudentIds.has(st.id)) {
        const studentHistory = remainingRecords
          .filter(r => r.studentId === st.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const absenceRecords = studentHistory.filter(
          r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
        );
        st.totalAbsences = absenceRecords.reduce((acc, r) => acc + (r.durationDays || 1), 0);

        let cons = 0;
        for (const r of studentHistory) {
          if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
            cons += (r.durationDays || 1);
          } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
            break;
          }
        }
        st.consecutiveAbsences = cons;

        const lastPres = studentHistory.find(r => r.status === 'presente' || (r.status as any) === 'atraso');
        if (lastPres) {
          st.lastAttendanceDate = lastPres.date;
        }

        st.attendanceRate = Math.max(0, Math.round(((st.totalSchoolDays - st.totalAbsences) / st.totalSchoolDays) * 100));
        if (st.consecutiveAbsences >= 4 || st.attendanceRate < 75) {
          st.riskLevel = 'critico';
          st.status = 'evasao_iminente';
        } else if (st.consecutiveAbsences >= 2 || st.attendanceRate < 80) {
          st.riskLevel = 'alto';
          st.status = 'alerta';
        } else {
          st.riskLevel = 'baixo';
          st.status = 'regular';
        }
        updatedStudents.push(st);
      }
    });

    if (updatedStudents.length > 0) {
      setStored('school_students', allStudents);
    }

    // Sincroniza exclusão no Firestore
    try {
      await firestoreService.deleteAttendanceByDate(dateStr, classId);
      if (updatedStudents.length > 0) {
        await firestoreService.batchSaveStudents(updatedStudents);
      }
    } catch (e) {
      console.warn('Erro ao sincronizar exclusão de chamadas no Firestore:', e);
    }

    return { deletedCount };
  },

  // === PORTARIA ===
  getGateRecords: (date?: string, classId?: string): GateRecord[] => {
    let list = getStored<GateRecord[]>('school_gate_records', []);
    if (date) {
      list = list.filter(r => r.date === date);
    }
    if (classId) {
      list = list.filter(r => r.classId === classId);
    }
    return list;
  },

  createGateRecord: (record: GateRecord): GateRecord => {
    const list = storageService.getGateRecords();
    const newRecord = {
      ...record,
      id: record.id || `gate-${Date.now()}`
    };
    list.push(newRecord);
    setStored('school_gate_records', list);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveGateRecord(newRecord).catch(err => console.warn('Erro ao salvar registro de portaria no Firestore:', err));

    return newRecord;
  },

  deleteGateRecord: (id: string): void => {
    const list = storageService.getGateRecords().filter(r => r.id !== id);
    setStored('school_gate_records', list);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteGateRecord(id).catch(err => console.warn('Erro ao deletar registro de portaria no Firestore:', err));
  },

  // === ALERTAS ===
  getAlerts: (): ParentAlert[] => {
    return getStored<ParentAlert[]>('school_alerts', DEFAULT_ALERTS);
  },

  addAlert: (alert: ParentAlert): ParentAlert => {
    const list = storageService.getAlerts();
    const newAlert = {
      ...alert,
      id: alert.id || `alt-${Date.now()}`
    };
    list.unshift(newAlert);
    setStored('school_alerts', list);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveAlert(newAlert).catch(err => console.warn('Erro ao salvar alerta no Firestore:', err));

    return newAlert;
  },

  updateAlertStatus: (alertId: string, status: any, notes?: string): void => {
    const list = storageService.getAlerts();
    const alert = list.find(a => a.id === alertId);
    if (alert) {
      alert.status = status;
      if (notes) alert.guardianFeedback = notes;
      setStored('school_alerts', list);

      // Sincroniza em nuvem no Firestore
      firestoreService.saveAlert(alert).catch(err => console.warn('Erro ao atualizar alerta no Firestore:', err));
    }
  },

  deleteAlert: (alertId: string): void => {
    const list = storageService.getAlerts().filter(a => a.id !== alertId);
    setStored('school_alerts', list);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteAlert(alertId).catch(err => console.warn('Erro ao excluir alerta no Firestore:', err));
  },

  // === INTERVENÇÕES ===
  getInterventions: (): InterventionCase[] => {
    return getStored<InterventionCase[]>('school_interventions', DEFAULT_INTERVENTIONS);
  },

  addInterventionAction: (caseId: string, action: any): void => {
    const list = storageService.getInterventions();
    const item = list.find(i => i.id === caseId);
    if (item) {
      item.actionLog = item.actionLog || [];
      item.actionLog.push({
        ...action,
        id: action.id || `act-${Date.now()}`
      });
      item.lastUpdatedAt = new Date().toISOString().split('T')[0];
      setStored('school_interventions', list);

      // Sincroniza em nuvem no Firestore
      firestoreService.saveIntervention(item).catch(err => console.warn('Erro ao salvar intervenção no Firestore:', err));
    }
  },

  deleteOpenInterventions: (): void => {
    const list = storageService.getInterventions().filter(i => i.stage === 'reintegrado' || i.stage === 'encerrado');
    setStored('school_interventions', list);
  },

  // === INFORMAÇÕES ESCOLARES & RELATÓRIOS ===
  getSchoolInfo: (): any => {
    const students = storageService.getStudents();
    const classes = storageService.getClasses();
    const alerts = storageService.getAlerts();
    const interventions = storageService.getInterventions();

    return {
      schoolName: 'EE Professor Arlindo Silvestre',
      lastUpdated: new Date().toISOString(),
      totalStudents: students.length,
      totalClasses: classes.length,
      activeAlertsCount: alerts.filter(a => a.status === 'enviado' || a.status === 'lido').length,
      activeCasesCount: interventions.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado').length
    };
  },

  getMonthlyReport: (monthIndex?: number, startDate?: string, endDate?: string): MonthlyPedagogicalReport => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const start = startDate || today;
      const end = endDate || start;
      const students = storageService.getStudents();
      const classes = storageService.getClasses();
      const attendanceRecords = storageService.getAttendanceRecords();
      const alerts = storageService.getAlerts();
      const interventions = storageService.getInterventions();

      // Lazy import-like computation to avoid circular dependencies
      const totalPresencas = attendanceRecords.filter(r => {
        const d = normalizeDateStr(r.date);
        return d >= start && d <= end && !r.studentId?.startsWith('cls-marker-') && (r.status === 'presente' || (r.status as any) === 'atraso');
      }).length;
      const totalFaltas = attendanceRecords.filter(r => {
        const d = normalizeDateStr(r.date);
        return d >= start && d <= end && !r.studentId?.startsWith('cls-marker-') && (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico');
      }).length;
      const totalAbsences = totalFaltas;
      const evaluated = totalPresencas + totalFaltas;
      const avgRate = evaluated > 0 ? Number(((totalPresencas / evaluated) * 100).toFixed(1)) : (students.length > 0 ? Number((students.reduce((acc, s) => acc + (s.attendanceRate || 100), 0) / students.length).toFixed(1)) : 100);

      const criticalCount = students.filter(s => s.attendanceRate < 75 || s.riskLevel === 'critico' || (s.consecutiveAbsences && s.consecutiveAbsences >= 4)).length;
      const activeInterventions = interventions.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado').length;
      const reintegrated = interventions.filter(i => i.stage === 'reintegrado' || i.stage === 'encerrado').length;

      const periodAlerts = alerts.filter(a => {
        const d = normalizeDateStr(a.sentAt);
        return d >= start && d <= end;
      });
      const dispatched = periodAlerts.length || alerts.length;
      const responded = (periodAlerts.length ? periodAlerts : alerts).filter(a => a.status === 'respondido' || a.guardianFeedback).length;

      const riskByClass = classes.map(c => {
        const cStudents = students.filter(s => s.classId === c.id || s.className === c.name);
        const cRecords = attendanceRecords.filter(r => {
          const d = normalizeDateStr(r.date);
          return d >= start && d <= end && (r.classId === c.id || r.className === c.name || cStudents.some(s => s.id === r.studentId));
        });
        const cStudRecs = cRecords.filter(r => !r.studentId?.startsWith('cls-marker-'));
        const cp = cStudRecs.filter(r => r.status === 'presente' || (r.status as any) === 'atraso').length;
        const cf = cStudRecs.filter(r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico').length;
        const cRate = cp + cf > 0 ? Number(((cp / (cp + cf)) * 100).toFixed(1)) : (c.attendanceRateToday || 95);
        const riskSt = cStudents.filter(s => s.riskLevel === 'alto' || s.riskLevel === 'critico' || s.attendanceRate < 80).length;
        return {
          classId: c.id,
          className: c.name,
          averageAttendance: cRate,
          riskStudents: riskSt,
          totalStudents: cStudents.length || c.totalStudents || 0
        };
      });

      return {
        month: 'Setembro',
        monthIndex: monthIndex || 9,
        year: 2026,
        totalEnrolled: students.length,
        averageAttendanceRate: avgRate,
        totalAbsences,
        studentsWithCriticalAbsence: criticalCount,
        activeSearchCasesCount: activeInterventions,
        successfulReintegrations: reintegrated,
        alertsDispatched: dispatched,
        alertsResponded: responded,
        absenceCausesDistribution: [
          { cause: 'Problemas de saúde / Atestados médicos', count: 4, percentage: 33 },
          { cause: 'Dificuldade de transporte escolar', count: 3, percentage: 25 },
          { cause: 'Trabalho infantil / Apoio familiar', count: 2, percentage: 17 },
          { cause: 'Desmotivação / Infrequência não justificada', count: 2, percentage: 17 },
          { cause: 'Questões familiares e vulnerabilidade', count: 1, percentage: 8 }
        ],
        riskByClass,
        attendanceTrend: [
          { week: 'Semana 1', rate: 91.2, absences: 28 },
          { week: 'Semana 2', rate: 89.5, absences: 34 },
          { week: 'Semana 3', rate: 86.8, absences: 42 },
          { week: 'Semana 4 (Atual)', rate: avgRate, absences: totalAbsences }
        ],
        pedagogicalInsights: [
          `Taxa de assiduidade real calculada em ${avgRate}% no período avaliado (${start} a ${end}).`,
          `${criticalCount} estudantes sob monitoramento com frequência inferior ao patamar mínimo de 75%.`,
          `${dispatched} comunicados aos responsáveis registrados no sistema, viabilizando ${reintegrated} reintegrações efetivas.`
        ]
      };
    } catch {
      const report = getStored<MonthlyPedagogicalReport>('school_monthly_report', DEFAULT_REPORT);
      return report;
    }
  },

  // === RESET TOTAL (Wipe All Data) ===
  wipeAllData: (currentUser?: any): void => {
    localStorage.removeItem('school_classes');
    localStorage.removeItem('school_students');
    localStorage.removeItem('school_attendance');
    localStorage.removeItem('school_gate_records');
    localStorage.removeItem('school_alerts');
    localStorage.removeItem('school_interventions');
    localStorage.removeItem('school_monthly_report');

    // Keep only the master admin
    const masterAdmin: UserAccount = {
      id: currentUser?.id || 'usr-admin',
      name: currentUser?.name || 'Administrador Geral',
      username: currentUser?.username || 'admin',
      role: 'admin',
      roleLabel: 'Direção Escolar (Administrador)',
      pin: currentUser?.pin || '1234',
      createdAt: new Date().toISOString(),
      active: true
    };
    setStored('school_users', [masterAdmin]);
  }
};
