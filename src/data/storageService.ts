import {
  UserAccount,
  UserRole,
  AttendanceStatus,
  GateRecord,
  AttendanceRecord,
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase
} from '../types';

const apiCall = async (endpoint: string, method: string = 'GET', body: any = null) => {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(endpoint, options);
  if (!res.ok) throw new Error(`API Error: ${await res.text()}`);
  return res.json();
};

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

export const storageService = {
  // === USUÁRIOS & ACESSOS ===
  getUsers: async (): Promise<UserAccount[]> => apiCall('/api/users'),
  
  createUser: async (data: { name: string; role: UserRole; pin: string; notes?: string }): Promise<UserAccount> => 
    apiCall('/api/users', 'POST', data),

  updateUser: async (id: string, updates: Partial<UserAccount>): Promise<UserAccount> => 
    apiCall(`/api/users/${id}`, 'PUT', updates),

  deleteUser: async (userId: string): Promise<boolean> => {
    await apiCall(`/api/users/${userId}`, 'DELETE');
    return true;
  },

  verifyPin: async (userId: string, pin: string): Promise<{ success: boolean; user?: any; error?: string }> => 
    apiCall('/api/auth/login-pin', 'POST', { userId, pin }),

  // === TURMAS ===
  getClasses: async (): Promise<SchoolClass[]> => apiCall('/api/classes'),
  
  createClass: async (cls: SchoolClass): Promise<SchoolClass> => apiCall('/api/classes', 'POST', cls),

  updateClass: async (clsId: string, updates: Partial<SchoolClass>): Promise<SchoolClass> => 
    apiCall(`/api/classes/${clsId}`, 'PUT', updates),

  deleteClass: async (clsId: string) => apiCall(`/api/classes/${clsId}`, 'DELETE'),

  // === ESTUDANTES ===
  getStudents: async (classId?: string): Promise<Student[]> => 
    apiCall(classId ? `/api/students?classId=${classId}` : '/api/students'),

  updateStudent: async (studentId: string, updates: Partial<Student>): Promise<Student> => 
    apiCall(`/api/students/${studentId}`, 'PUT', updates),

  createStudent: async (data: Partial<Student>): Promise<Student> => apiCall('/api/students', 'POST', data),

  deleteStudent: async (studentId: string) => apiCall(`/api/students/${encodeURIComponent(studentId)}`, 'DELETE'),

  // === FREQUÊNCIA ===
  recordAttendance: async (
    items: any[],
    classId: string,
    recordedBy: string,
    date?: string
  ) => apiCall('/api/attendance', 'POST', { items, classId, recordedBy, date }),

  getAttendanceRecords: async (classId?: string, date?: string): Promise<AttendanceRecord[]> => 
    apiCall(`/api/attendance?classId=${classId || ''}&date=${date || ''}`),

  // === PORTARIA ===
  getGateRecords: async (date?: string, classId?: string): Promise<GateRecord[]> =>
    apiCall(`/api/gate-records?date=${date || ''}&classId=${classId || ''}`),
  
  createGateRecord: async (record: GateRecord) => apiCall('/api/gate-records', 'POST', record),

  deleteGateRecord: async (id: string) => apiCall(`/api/gate-records/${id}`, 'DELETE'),

  // === ALERTAS ===
  getAlerts: async (): Promise<ParentAlert[]> => apiCall('/api/alerts'),

  createAlert: async (alert: ParentAlert) => apiCall('/api/alerts/send', 'POST', alert),

  // === INTERVENÇÕES ===
  getInterventions: async (): Promise<InterventionCase[]> => apiCall('/api/interventions'),
  
  // === RESET E WIPE ===
  wipeAllData: async () => apiCall('/api/wipe-all', 'POST')
};
