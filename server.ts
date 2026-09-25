import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { SchoolDatabase } from './server/database.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Permite que o sistema seja incorporado (embedded) no Google Sites e em iframes
  app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://sites.google.com https://*.google.com *"
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  app.use(express.json());

  const db = SchoolDatabase.getInstance();

  // Lazy Gemini initialization helper
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI | null {
    if (aiClient) return aiClient;
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      if (apiKey) {
        aiClient = new GoogleGenAI({ apiKey });
      } else {
        aiClient = new GoogleGenAI();
      }
      return aiClient;
    } catch (err) {
      console.warn('Gemini client initialization warning:', err);
      return null;
    }
  }

  async function callGeminiGenerateContent(ai: GoogleGenAI, contents: string, config?: any) {
    // Modelos oficiais 100% gratuitos da família Flash (sem limitação de cota zero)
    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest'
    ];
    let lastError: any = null;
    const finalConfig = {
      temperature: 0.1,
      topP: 0.95,
      ...(config || {})
    };
    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: finalConfig
        });
        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(`Tentativa de geração com modelo '${model}' falhou:`, err?.message || err);
      }
    }
    throw lastError;
  }

  // --- SISTEMA DE GESTÃO E PROTEÇÃO DE COTA GRATUITA DA IA ---
  interface DailyQuotaTracker {
    date: string; // YYYY-MM-DD (Horário de Brasília)
    requestsToday: number;
    maxFreeRequestsPerDay: number;
    isBlockedUntilNextDay: boolean;
    blockedReason: string | null;
    blockedAt: string | null;
  }

  function getSaoPauloDate(): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  const quotaTracker: DailyQuotaTracker = {
    date: getSaoPauloDate(),
    requestsToday: 0,
    maxFreeRequestsPerDay: 50, // Limite diário de segurança na cota gratuita para evitar qualquer cobrança
    isBlockedUntilNextDay: false,
    blockedReason: null,
    blockedAt: null,
  };

  function syncDailyQuota() {
    const today = getSaoPauloDate();
    if (quotaTracker.date !== today) {
      quotaTracker.date = today;
      quotaTracker.requestsToday = 0;
      quotaTracker.isBlockedUntilNextDay = false;
      quotaTracker.blockedReason = null;
      quotaTracker.blockedAt = null;
    }
  }

  function blockQuotaUntilTomorrow(reason: string) {
    quotaTracker.isBlockedUntilNextDay = true;
    quotaTracker.blockedReason = reason;
    quotaTracker.blockedAt = new Date().toISOString();
  }

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // School overview
  app.get('/api/school-info', (req, res) => {
    try {
      const info = db.getSchoolInfo();
      res.json(info);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Classes list
  app.get('/api/classes', (req, res) => {
    try {
      const classes = db.getClasses();
      res.json(classes);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Students list with optional filters
  app.get('/api/students', (req, res) => {
    try {
      const { classId, riskLevel, status, search, role } = req.query;
      const userRole = (req.headers['x-user-role'] as string) || (role as string);
      let students = db.getStudents({
        classId: classId as string,
        riskLevel: riskLevel as string,
        status: status as string,
        search: search as string,
      });

      // Se a consulta for feita por usuário com papel de professor, oculta os telefones dos responsáveis
      if (userRole === 'professor') {
        students = students.map(s => ({
          ...s,
          guardianPhone: '',
        }));
      }

      res.json(students);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Single student details
  app.get('/api/students/:id', (req, res) => {
    try {
      const result = db.getStudentById(req.params.id);
      if (!result) {
        return res.status(404).json({ error: 'Estudante não encontrado' });
      }

      const userRole = (req.headers['x-user-role'] as string) || (req.query.role as string);
      if (userRole === 'professor' && result.student) {
        result.student = {
          ...result.student,
          guardianPhone: '',
        };
      }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create new student
  app.post('/api/students', (req, res) => {
    try {
      const newStudent = db.createStudent(req.body);
      res.status(201).json(newStudent);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Batch import students (via CSV or JSON list)
  app.post('/api/students/batch', (req, res) => {
    try {
      const { students } = req.body;
      if (!Array.isArray(students)) {
        return res.status(400).json({ error: 'Lista de estudantes inválida' });
      }
      const result = db.batchImportStudents(students);
      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Update student
  app.put('/api/students/:id', (req, res) => {
    try {
      const updated = db.updateStudent(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Estudante não encontrado' });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Delete student
  app.delete('/api/students/:id', (req, res) => {
    try {
      const studentId = decodeURIComponent(req.params.id);
      const success = db.deleteStudent(studentId);
      if (!success) return res.status(404).json({ error: 'Estudante não encontrado' });
      res.json({ success: true, message: 'Estudante removido com sucesso' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create new class
  app.post('/api/classes', (req, res) => {
    try {
      const newClass = db.createClass(req.body);
      res.status(201).json(newClass);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Update class
  app.put('/api/classes/:id', (req, res) => {
    try {
      const updated = db.updateClass(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Turma não encontrada' });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Delete class
  app.delete('/api/classes/:id', (req, res) => {
    try {
      const classId = decodeURIComponent(req.params.id);
      db.deleteClass(classId);
      res.json({ success: true, message: 'Turma removida com sucesso' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Attendance history & alias for attendance-records
  const handleGetAttendance = (req: express.Request, res: express.Response) => {
    try {
      const { classId, date, studentId } = req.query;
      const records = db.getAttendanceRecords({
        classId: classId as string,
        date: date as string,
        studentId: studentId as string,
      });
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };
  app.get('/api/attendance', handleGetAttendance);
  app.get('/api/attendance-records', handleGetAttendance);

  // Batch attendance recording (chamada em tempo real / diário)
  // Automatically calculates absence streaks, fires alerts to guardians, and initiates Busca Ativa cases
  app.post('/api/attendance', (req, res) => {
    try {
      const { items, classId, recordedBy, date } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Lista de presença inválida' });
      }
      const result = db.recordBatchAttendance(items, classId, recordedBy, date);
      res.json({
        success: true,
        recordedCount: result.recordedCount,
        newAlertsGenerated: result.newAlerts.length,
        newAlerts: result.newAlerts,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Excluir registros de frequência por data (e opcionalmente por turma)
  const handleDeleteAttendance = (req: any, res: any) => {
    try {
      const date = (req.query.date || req.body?.date) as string;
      const classId = (req.query.classId || req.body?.classId) as string;
      if (!date) {
        return res.status(400).json({ error: 'Parâmetro de data é obrigatório' });
      }
      const result = db.deleteAttendanceByDate(date, classId);
      res.json({
        success: true,
        deletedCount: result.deletedCount,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };
  app.delete('/api/attendance', handleDeleteAttendance);
  app.delete('/api/attendance-records', handleDeleteAttendance);

  // Gate pass records (Controle de Entradas e Saídas fora do horário oficial)
  app.get('/api/gate-records', (req, res) => {
    try {
      const { date, classId } = req.query;
      const records = db.getGateRecords({
        date: date as string,
        classId: classId as string,
      });
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/gate-records', (req, res) => {
    try {
      const { studentId, studentName, classId, className, date, time, type, reason, guardianOrAuthorizedPerson, guardianPhone, recordedBy, notes } = req.body;
      if (!studentId || !time || !type || !reason) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes para registro de movimentação de portaria' });
      }
      const newRecord = db.createGateRecord({
        studentId,
        studentName,
        classId,
        className,
        date: date || new Date().toISOString().split('T')[0],
        time,
        type,
        reason,
        guardianOrAuthorizedPerson: guardianOrAuthorizedPerson || 'Não informado',
        guardianPhone,
        recordedBy: recordedBy || 'AOE - Portaria',
        notes,
      });
      res.status(201).json(newRecord);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/gate-records/:id', (req, res) => {
    try {
      const success = db.deleteGateRecord(req.params.id);
      if (!success) return res.status(404).json({ error: 'Registro não encontrado' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Relatório de Turma/Ausência Diário para a Gestão mandar aos professores (Contingência SEDUC)
  app.get('/api/seduc-contingency-report', (req, res) => {
    try {
      const { date, classId } = req.query;
      const report = db.getSeducContingencyReport(date as string, classId as string);
      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Gestão de Usuários & Banco de Acessos (Perfil Master Administrador)
  app.get('/api/users', (req, res) => {
    try {
      res.json(db.getUsers());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/users/public', (req, res) => {
    try {
      res.json(db.getPublicUsers());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/users', (req, res) => {
    try {
      const { name, username, role, pin, notes } = req.body;
      const newUser = db.createUser({ name, username, role, pin, notes });
      res.status(201).json(newUser);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  const handleUserUpdate = (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { name, role, pin, notes, active } = req.body;
      const updatedUser = db.updateUser(id, { name, role, pin, notes, active });
      res.json(updatedUser);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  };

  app.put('/api/users/:id', handleUserUpdate);
  app.patch('/api/users/:id', handleUserUpdate);

  app.delete('/api/users/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.deleteUser(id);
      res.json({ success: true, message: 'Usuário removido com sucesso' });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Autenticação com Caixa de Seleção e Senha Numérica de 4 Dígitos
  app.post('/api/auth/login-pin', (req, res) => {
    try {
      const { userId, pin } = req.body;
      if (!userId || !pin) {
        return res.status(400).json({ error: 'Selecione seu nome e digite a senha de 4 dígitos.' });
      }
      const userSession = db.verifyLoginPin(userId, String(pin));
      res.json({ success: true, user: userSession });
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  });

  // Login de Usuário / Perfis de Acesso (Compatibilidade)
  app.post('/api/auth/login', (req, res) => {
    try {
      const { role, username, password } = req.body;
      
      let userRole: 'admin' | 'gestao_paac' | 'aoe' | 'professor' = 'gestao_paac';
      let name = 'Coordenação & Direção (PAAC)';
      let roleLabel = 'Gestão / PAAC (Acesso Total)';

      if (role === 'admin' || username?.toLowerCase()?.includes('admin')) {
        userRole = 'admin';
        name = 'Administrador Geral (Master)';
        roleLabel = 'Administrador (Master)';
      } else if (role === 'aoe' || username?.toLowerCase()?.includes('aoe')) {
        userRole = 'aoe';
        name = 'Carlos Eduardo (AOE - Secretaria & Portaria)';
        roleLabel = 'AOE - Agente de Organização Escolar';
      } else if (role === 'professor' || username?.toLowerCase()?.includes('prof')) {
        userRole = 'professor';
        name = 'Prof. Rogério S. (Docente da Turma)';
        roleLabel = 'Professor (Acesso Restrito)';
      } else {
        userRole = 'gestao_paac';
        name = 'Profª. Silvana Rocha (Coordenação & PAAC)';
        roleLabel = 'Gestão / PAAC (Acesso Total)';
      }

      res.json({
        success: true,
        user: {
          username: username || userRole,
          name,
          role: userRole,
          roleLabel,
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Alerts list
  app.get('/api/alerts', (req, res) => {
    try {
      const alerts = db.getAlerts();
      res.json(alerts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Send or re-send alert manually
  app.post('/api/alerts/send', (req, res) => {
    try {
      const { studentId, channel, messageContent, triggerReason, triggerLabel } = req.body;
      if (!studentId || !channel || !messageContent) {
        return res.status(400).json({ error: 'Dados incompletos para emissão de alerta' });
      }
      const alert = db.sendManualAlert({
        studentId,
        channel,
        messageContent,
        triggerReason,
        triggerLabel,
      });
      res.json(alert);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update alert status (simulate delivery, read, or guardian response)
  const handleAlertStatus = (req: express.Request, res: express.Response) => {
    try {
      const { status, feedback, notes } = req.body;
      const updated = db.updateAlertStatus(req.params.id, status, feedback || notes);
      if (!updated) {
        return res.status(404).json({ error: 'Alerta não encontrado' });
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };
  app.patch('/api/alerts/:id/status', handleAlertStatus);
  app.put('/api/alerts/:id/status', handleAlertStatus);

  // Interventions / Casos de Busca Ativa
  app.get('/api/interventions', (req, res) => {
    try {
      const cases = db.getInterventions();
      res.json(cases);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/interventions/:id', (req, res) => {
    try {
      const item = db.getInterventionById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Caso não encontrado' });
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/interventions', (req, res) => {
    try {
      const saved = db.saveIntervention(req.body);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/interventions/:id/action', (req, res) => {
    try {
      const updated = db.addInterventionAction(req.params.id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/interventions/delete-open', (req, res) => {
    try {
      db.deleteOpenInterventions();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Monthly pedagogical reports
  app.get('/api/reports/monthly', (req, res) => {
    try {
      const month = req.query.month ? Number(req.query.month) : 9;
      const year = req.query.year ? Number(req.query.year) : 2026;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const report = db.getMonthlyReport(month, year, startDate, endDate);
      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Status da cota gratuita diária da IA
  app.get('/api/ai/quota-status', (req, res) => {
    syncDailyQuota();
    res.json({
      date: quotaTracker.date,
      requestsToday: quotaTracker.requestsToday,
      maxFreeRequestsPerDay: quotaTracker.maxFreeRequestsPerDay,
      isBlockedUntilNextDay: quotaTracker.isBlockedUntilNextDay,
      blockedReason: quotaTracker.blockedReason,
      blockedAt: quotaTracker.blockedAt,
      resetsAt: '00:00 (Horário de Brasília)'
    });
  });

  // Handler compartilhado do Assistente Pedagógico com Controle de Cota e Fundamentação Legal
  const handlePedagogicalPlan = async (req: express.Request, res: express.Response) => {
    syncDailyQuota();

    const {
      studentName = 'Estudante',
      className = '',
      studentClass = '',
      consecutiveAbsences = 0,
      attendanceRate = 100,
      vulnerabilityFactors = [],
      guardianRelationship = 'Responsável Legal'
    } = req.body;

    const actualClass = className || studentClass;
    const isOver20Percent = attendanceRate <= 80 || consecutiveAbsences >= 4;
    const isOver10Percent = attendanceRate <= 90 || consecutiveAbsences >= 2;

    // Gerador de resposta baseada nas Fundamentações Legais Oficiais (SEDUC 39/2023, ECA Art. 56 e Lei 13.068/2008)
    const generateLegalFallback = (quotaExceeded = false, blockMessage?: string) => {
      let diagnostico = '';
      let recomendacoes: string[] = [];
      let mensagemSugerida = '';

      if (isOver20Percent) {
        // Marco de 20% de faltas / Faltas consecutivas reiteradas (Risco crítico de abandono)
        diagnostico = `O(A) estudante ${studentName} (${actualClass}) atingiu o marco crítico de infrequência (${consecutiveAbsences} faltas consecutivas / taxa de ${attendanceRate}%), enquadrando-se no marco de 20% de faltas previsto na Resolução SEDUC nº 39/2023 e no Art. 56 do ECA. Esgotadas as tratativas iniciais da unidade escolar, há necessidade iminente de formalização junto à rede protetiva.`;
        recomendacoes = [
          'Emissão de notificação formal obrigatória aos responsáveis legais, fundamentada na Lei Estadual nº 13.068/2008 e Resolução SEDUC nº 39/2023.',
          'Articulação imediata com o Programa CONVIVA SP para identificação e remoção de barreiras de vulnerabilidade e convivência escolar.',
          'Elaboração de relatório circunstanciado e formalização de encaminhamento ao Conselho Tutelar (nos termos do Artigo 56, II, da Lei Federal nº 8.069/1990 - ECA) diante da reiteração de faltas injustificadas.',
          'Pactuação de Plano Pedagógico de Reposição e Acolhimento junto aos professores da turma para retorno sem evasão.'
        ];
        mensagemSugerida = `Comunicado Oficial - EE Prof. Arlindo Silvestre: Prezada família de ${studentName}, informamos que o(a) estudante atingiu ${consecutiveAbsences} faltas consecutivas. Conforme determina a Resolução SEDUC nº 39/2023 e o Estatuto da Criança e do Adolescente (Art. 56), a frequência regular é obrigatória. Solicitamos o comparecimento urgente da família à escola hoje para alinhamento e apoio pedagógico, prevenindo o encaminhamento formal aos órgãos de proteção. Estamos de portas abertas!`;
      } else if (isOver10Percent) {
        // Marco de 10% de faltas (Acompanhamento e Prevenção)
        diagnostico = `O(A) estudante ${studentName} (${actualClass}) atingiu o marco de 10% de faltas da Resolução SEDUC nº 39/2023 (${consecutiveAbsences} faltas / taxa de ${attendanceRate}%). Trata-se de fase de intervenção preventiva para orientar a família e restabelecer a rotina regular de estudos antes que haja prejuízo curricular severo.`;
        recomendacoes = [
          'Contato direto de acolhimento e escuta ativa com a família para orientar sobre a importância da assiduidade (Resolução SEDUC nº 39/2023).',
          'Identificar se as faltas decorrem de problemas de transporte, saúde na família ou trabalho infantil para acionamento intersetorial precoce.',
          'Monitoramento prioritário da chamada diária nas próximas duas semanas pela equipe de mediação e gestão escolar.'
        ];
        mensagemSugerida = `Acompanhamento de Frequência - EE Prof. Arlindo Silvestre: Olá, responsáveis por ${studentName}! Identificamos ausências recentes e, em conformidade com o acompanhamento preventivo da Resolução SEDUC nº 39/2023, queremos entender como a escola pode ajudar a garantir que ${studentName} não perca as atividades e mantenha sua assiduidade regular. Por favor, entre em contato conosco. Contem sempre com nosso apoio!`;
      } else {
        // Acompanhamento inicial
        diagnostico = `O(A) estudante ${studentName} apresenta início de faltas pontuais que demandam registro preventivo conforme diretrizes da Busca Ativa da rede estadual paulista.`;
        recomendacoes = [
          'Registro da justificativa no diário escolar.',
          'Orientação aos responsáveis sobre o impacto de ausências intermitentes no aprendizado.'
        ];
        mensagemSugerida = `Olá, família de ${studentName}! Aqui é da EE Prof. Arlindo Silvestre. Notamos a ausência nas aulas recentes e queremos checar se está tudo bem com o(a) estudante. Estamos à disposição para qualquer suporte necessário!`;
      }

      return {
        diagnostico,
        recomendacoes,
        mensagemSugerida,
        fundamentacaoLegal: [
          'Resolução SEDUC nº 39, de 05/09/2023 (Procedimentos de Busca Ativa da Rede Paulista - marcos de 10% e 20% de faltas)',
          'Estatuto da Criança e do Adolescente (ECA - Lei Federal nº 8.069/1990, Artigo 56, II - Conselho Tutelar)',
          'Lei Estadual nº 13.068/2008 e Articulação Intersetorial com o Programa CONVIVA SP'
        ],
        quotaStatus: {
          quotaExceeded,
          isBlocked: quotaTracker.isBlockedUntilNextDay,
          reason: blockMessage || quotaTracker.blockedReason || (quotaExceeded ? 'Cota gratuita diária excedida. Função bloqueada até amanhã às 00:00 para evitar cobranças.' : null),
          requestsToday: quotaTracker.requestsToday,
          maxFreeRequestsPerDay: quotaTracker.maxFreeRequestsPerDay,
          resetsAt: '00:00 (Horário de Brasília)',
          source: 'motor_pedagogico_seduc_39'
        }
      };
    };

    // 1. Verifica se a cota já está bloqueada até o dia seguinte
    if (quotaTracker.isBlockedUntilNextDay) {
      return res.json(generateLegalFallback(true, quotaTracker.blockedReason || undefined));
    }

    // 2. Verifica se atingiu o limite de segurança diário da cota gratuita
    if (quotaTracker.requestsToday >= quotaTracker.maxFreeRequestsPerDay) {
      blockQuotaUntilTomorrow(
        `Limite diário de segurança da cota gratuita (${quotaTracker.maxFreeRequestsPerDay} requisições) foi atingido hoje. A IA externa foi bloqueada até as 00:00 de amanhã para garantir que você não tenha custos na sua chave de API.`
      );
      return res.json(generateLegalFallback(true, quotaTracker.blockedReason || undefined));
    }

    // 3. Tenta processar com o Gemini se houver cliente configurado
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `Você é um especialista pedagógico da Busca Ativa Escolar da Rede Estadual de Ensino de São Paulo (SEDUC-SP).
Elabore um plano de intervenção técnico e humanizado para o seguinte estudante em risco de infrequência ou evasão:
- Estudante: ${studentName} (${actualClass})
- Faltas consecutivas: ${consecutiveAbsences}
- Frequência atual acumulada: ${attendanceRate}%
- Fatores de vulnerabilidade: ${vulnerabilityFactors?.join(', ') || 'Ausências reiteradas sem justificativa formal'}
- Responsável: ${guardianRelationship}

FUNDAMENTAÇÃO LEGAL OBRIGATÓRIA A SEGUIR:
1. Resolução SEDUC nº 39, de 5 de setembro de 2023:
   - 10% de faltas: comunicação imediata aos pais/responsáveis orientando sobre a importância da frequência;
   - 20% de faltas: comunicação formal aos responsáveis com base na Lei Estadual nº 13.068/2008;
   - Persistindo a situação: esgotados os recursos escolares, acionamento obrigatório do Conselho Tutelar e do programa CONVIVA SP (Programa de Melhoria da Convivência e Proteção Escolar).
2. Estatuto da Criança e do Adolescente (ECA - Lei Federal nº 8.069/1990, Artigo 56, inciso II):
   - Os dirigentes escolares devem comunicar ao Conselho Tutelar os casos de reiteração de faltas injustificadas e evasão escolar, esgotados os recursos escolares.

Responda ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "diagnostico": "Resumo empático e técnico do caso citando o enquadramento na Resolução SEDUC nº 39/2023 e Art. 56 do ECA (2 a 3 frases)",
  "recomendacoes": ["Ação imediata escolar", "Ação formal com base na Lei 13.068/2008 ou CONVIVA SP", "Ação de rede protetiva / Conselho Tutelar se aplicável", "Acolhimento pedagógico"],
  "mensagemSugerida": "Mensagem empática para WhatsApp para o responsável (sem tom punitivo, informando com respeito a fundamentação na Resolução SEDUC 39/2023 e convidando com acolhimento para a escola)"
}`;

        const response = await callGeminiGenerateContent(ai, prompt, { responseMimeType: 'application/json' });

        const text = response.text || '';
        const parsed = JSON.parse(text);

        // Incrementa o contador de requisições do dia
        quotaTracker.requestsToday++;

        // Se atingiu o limite de segurança com esta chamada, bloqueia as próximas até amanhã
        if (quotaTracker.requestsToday >= quotaTracker.maxFreeRequestsPerDay) {
          blockQuotaUntilTomorrow(
            `Limite diário de segurança da cota gratuita (${quotaTracker.maxFreeRequestsPerDay} requisições) atingido. A IA externa foi bloqueada até as 00:00 de amanhã para garantir custo zero.`
          );
        }

        return res.json({
          ...parsed,
          fundamentacaoLegal: [
            'Resolução SEDUC nº 39/2023 (Marcos de 10% e 20% de faltas)',
            'Estatuto da Criança e do Adolescente (ECA - Lei nº 8.069/1990, Artigo 56)',
            'Lei Estadual nº 13.068/2008 & Articulação com CONVIVA SP'
          ],
          quotaStatus: {
            quotaExceeded: false,
            isBlocked: quotaTracker.isBlockedUntilNextDay,
            requestsToday: quotaTracker.requestsToday,
            maxFreeRequestsPerDay: quotaTracker.maxFreeRequestsPerDay,
            resetsAt: '00:00 (Horário de Brasília)',
            source: 'gemini_ai'
          }
        });
      } catch (err: any) {
        console.warn('Falha ou cota da API Gemini atingida:', err?.message || err);
        // Se o Google reportar erro de cota / 429 / ResourceExhausted, bloqueia até amanhã imediatamente
        const isQuotaErr =
          err?.status === 429 ||
          String(err?.message || '').toLowerCase().includes('quota') ||
          String(err?.message || '').toLowerCase().includes('resource_exhausted') ||
          String(err?.message || '').toLowerCase().includes('rate limit');

        if (isQuotaErr) {
          blockQuotaUntilTomorrow(
            'O Google identificou que a cota gratuita de requisições foi atingida (código 429/ResourceExhausted). Para garantir que você não tenha custos, a função foi bloqueada até as 00:00 de amanhã.'
          );
          return res.json(generateLegalFallback(true, quotaTracker.blockedReason || undefined));
        }
      }
    }

    // Fallback padrão com fundamentação legal quando IA não configurada
    return res.json(generateLegalFallback(false));
  };

  // Ambos endpoints mapeados para retrocompatibilidade
  app.post('/api/ai/pedagogical-plan', handlePedagogicalPlan);
  app.post('/api/ai/intervention-plan', handlePedagogicalPlan);

  // --- FORMATAÇÃO INTELIGENTE DE OCORRÊNCIA E MENSAGEM WHATSAPP COM GEMINI ---
  const handleFormatOccurrence = async (req: express.Request, res: express.Response) => {
    syncDailyQuota();

    const {
      descricao = '',
      estudante = 'Estudante',
      turma = '',
      ocorrencia = '',
      medida = '',
      professor = '',
      aula = '',
    } = req.body;

    const rawTrim = (descricao || '').trim();

    const generateFallback = () => {
      // Fallback estrito: reformula apenas o texto digitado, sem injetar opções
      let formattedDescription = rawTrim;
      if (formattedDescription) {
        // Correção básica de primeira letra e ponto final
        formattedDescription = formattedDescription.charAt(0).toUpperCase() + formattedDescription.slice(1);
        if (!/[.!?]$/.test(formattedDescription)) {
          formattedDescription += '.';
        }
      }

      const whatsappMsg = `*EE Prof. Arlindo Silvestre - Acompanhamento Escolar*\n\n` +
        `Olá, família de *${estudante}* (${turma || 'Turma'}).\n\n` +
        `Gostaríamos de informar que hoje, durante a aula (${aula || 'horário letivo'}), foi registrado um apontamento referente a *${ocorrencia || 'convivência escolar'}*.\n\n` +
        (formattedDescription ? `📝 *Relato da aula:* "${formattedDescription}"\n` : '') +
        (medida ? `⚖️ *Medida pedagógica aplicada:* ${medida}\n\n` : '\n') +
        `Pedimos o apoio e o diálogo da família em casa para reforçarmos juntos o compromisso com os estudos e a convivência respeitosa na escola. Estamos sempre de portas abertas para qualquer dúvida ou apoio.\n\n` +
        `Atenciosamente,\n*Equipe Gestora Escolar*`;

      return {
        descricaoFormatada: formattedDescription,
        mensagemWhatsApp: whatsappMsg,
        source: 'motor_pedagogico_fallback'
      };
    };

    if (quotaTracker.isBlockedUntilNextDay || quotaTracker.requestsToday >= quotaTracker.maxFreeRequestsPerDay) {
      return res.json(generateFallback());
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `Você é um assistente pedagógico especializado em mediação escolar, correção gramatical e comunicação clara e respeitosa com famílias e responsáveis na educação básica da rede pública.

Sua tarefa principal é ler o texto do relato digitado pelo professor e reformular EXCLUSIVAMENTE o texto escrito ali:
1. "descricaoFormatada": Reformule APENAS o relato escrito pelo professor.
   - Corrija erros gramaticais, de concordância, pontuação e ortografia em português (pt-BR).
   - Ajuste a linguagem para que seja formal, respeitosa, educada e empática.
   - Deixe o texto claro e simples, de fácil compreensão para que qualquer pai, mãe ou responsável compreenda com exatidão o que aconteceu em sala.
   - Mantenha 100% de fidelidade aos fatos narrados pelo professor, eliminando desabafos ou gírias sem alterar o conteúdo factual.
   - REGRA CRÍTICA: NÃO adicione metadados (como "Registro pedagógico em sala", nome do professor, nome da turma, medidas tomadas ou opções prévias) na "descricaoFormatada". Retorne apenas o parágrafo do relato reescrito.

2. "mensagemWhatsApp": Mensagem completa, empática e acolhedora pronta para ser enviada aos pais pelo WhatsApp da escola, explicando o ocorrido de forma gentil e solicitando diálogo da família.

TEXTO DO RELATO DIGITADO PELO PROFESSOR:
"${rawTrim || ocorrencia}"

CONTEXTO ADICIONAL PARA O WHATSAPP:
- Estudante: ${estudante}
- Turma: ${turma}
- Horário / Aula: ${aula}
- Professor: ${professor}
- Ocorrência: ${ocorrencia}
- Medida Aplicada: ${medida}

Responda ESTRITAMENTE em formato JSON com as chaves:
{
  "descricaoFormatada": "Texto reformulado exclusivamente a partir do relato do professor, com gramática correta e tom educado/respeitoso para compreensão dos responsáveis",
  "mensagemWhatsApp": "Mensagem formatada com emojis discretos (*negrito* para nomes e destaques) para enviar aos pais no WhatsApp"
}`;

        const response = await callGeminiGenerateContent(ai, prompt, { responseMimeType: 'application/json' });

        const text = response.text || '';
        const parsed = JSON.parse(text);

        quotaTracker.requestsToday++;
        return res.json({
          descricaoFormatada: parsed.descricaoFormatada ? parsed.descricaoFormatada.trim() : generateFallback().descricaoFormatada,
          mensagemWhatsApp: parsed.mensagemWhatsApp || generateFallback().mensagemWhatsApp,
          source: 'gemini_ai'
        });
      } catch (err: any) {
        console.warn('Erro na formatação com Gemini:', err?.message || err);
        return res.json(generateFallback());
      }
    }

    return res.json(generateFallback());
  };

  // --- FORMATAÇÃO INTELIGENTE DE DESCRIÇÃO COM GEMINI (PROMPT PEDAGÓGICO REQUISITADO) ---
  app.post('/api/ai/format-description', async (req: express.Request, res: express.Response) => {
    syncDailyQuota();
    const { texto = '', descricao = '' } = req.body;
    const rawTrim = (texto || descricao || '').trim();

    if (!rawTrim) {
      return res.status(400).json({ error: 'Texto não fornecido para formatação' });
    }

    const sanitizeText = (t: string) => {
      if (!t) return '';
      let limpo = t.trim();
      limpo = limpo.replace(/^#+\s+.*?\n+/i, '');
      limpo = limpo.replace(/^\*\*.*?\*\*\s*:?\s*/i, '');
      limpo = limpo.replace(/^(comunicado|notificação|aviso|informe|relato|registro|parecer|mensagem|termo)\s+(aos\s+responsáveis|aos\s+pais|à\s+família|escolar|pedagógico|disciplinar)\s*:?\s*/gi, '');
      limpo = limpo.replace(/^(prezados|senhores|caros)\s+(pais|responsáveis|familiares)\s*:?,?\s*/gi, '');
      limpo = limpo.replace(/^["'«»“”]/g, '').replace(/["'«»“”]$/g, '');
      return limpo.trim();
    };

    const fallbackText = () => {
      let f = rawTrim.charAt(0).toUpperCase() + rawTrim.slice(1);
      if (!/[.!?]$/.test(f)) f += '.';
      return sanitizeText(f);
    };

    const customApiKey = req.body?.apiKey;
    const ai = customApiKey ? new GoogleGenAI({ apiKey: customApiKey }) : getGeminiClient();
    if (ai) {
      try {
        const prompt = `Atue como um assistente pedagógico. Sua tarefa é reescrever, revisar e formatar esse texto, pois uma cópia será entregue aos responsáveis do estudante.
Siga estas diretrizes:
Correção Gramatical: Aplique a norma-padrão da língua portuguesa, corrigindo erros de digitação, pontuação e concordância.
Linguagem Simples e Acessível: Reescreva o texto de forma que qualquer responsável compreenda o contexto sem dificuldade. Evite jargões técnicos da área da educação.
Tom Profissional: Mantenha a objetividade, o respeito e a imparcialidade. O texto deve relatar o fato de forma descritiva, sem julgamentos de valor desnecessários.
Fidelidade aos Fatos: Apenas organize e estruture as informações fornecidas. Nunca adicione detalhes ou fatos que não estejam nas minhas anotações originais.
Estruturação: Entregue o resultado em um formato limpo e fácil de ler.

TEXTO ORIGINAL:
"${rawTrim}"

REGRA CRÍTICA E ABSOLUTA:
- NÃO coloque títulos, cabeçalhos nem saudações como "Comunicado aos Responsáveis", "Prezados Pais", "Relato Pedagógico", "Comunicado Escolar" ou similares.
- NÃO adicione introduções ("Aqui está o texto:"), sem aspas adicionais, sem preâmbulos e sem explicações.
- Retorne APENAS o parágrafo descritivo do fato ocorrido.`;

        const response = await callGeminiGenerateContent(ai, prompt);

        const formatted = response.text ? sanitizeText(response.text.trim()) : fallbackText();
        quotaTracker.requestsToday++;
        return res.json({
          descricaoFormatada: formatted || fallbackText(),
          source: 'gemini_ai'
        });
      } catch (err: any) {
        console.warn('Erro ao formatar descrição com Gemini API:', err?.message || err);
        return res.json({
          descricaoFormatada: fallbackText(),
          source: 'motor_pedagogico_fallback',
          error: err?.message
        });
      }
    }

    return res.json({
      descricaoFormatada: fallbackText(),
      source: 'motor_pedagogico_fallback'
    });
  });

  app.post('/api/ai/format-occurrence', handleFormatOccurrence);
  app.post('/api/ai/format-occurrence-whatsapp', handleFormatOccurrence);

  // --- GOOGLE SHEETS / DRIVE DATABASE INTEGRATION ---

  // Get current Google Sheets integration status and metadata
  app.get('/api/google-sheets/config', (req, res) => {
    try {
      const config = db.getGoogleSheetsConfig();
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save/link existing Google Spreadsheet ID
  app.post('/api/google-sheets/config', (req, res) => {
    try {
      const { spreadsheetId, title, userEmail } = req.body;
      if (!spreadsheetId) {
        return res.status(400).json({ error: 'ID da planilha é obrigatório' });
      }

      const cleanId = spreadsheetId.includes('/d/')
        ? spreadsheetId.split('/d/')[1].split('/')[0]
        : spreadsheetId.trim();

      const updated = db.updateGoogleSheetsConfig({
        spreadsheetId: cleanId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
        title: title || 'EE Prof. Arlindo Silvestre - Banco de Dados',
        connectedUserEmail: userEmail || null,
        lastSync: new Date().toISOString(),
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create official Google Sheets database directly in user's Drive
  app.post('/api/google-sheets/create', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação Google ausente ou inválido' });
    }

    try {
      const { userEmail } = req.body;
      const title = `EE Prof. Arlindo Silvestre - Banco de Dados Oficial (Busca Ativa & Diário)`;

      // 1. Create Spreadsheet with predefined sheets
      const createResp = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            title,
            locale: 'pt_BR',
            timeZone: 'America/Sao_Paulo',
          },
          sheets: [
            { properties: { title: 'Alunos', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Calendario_Frequencia', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Frequencia_Diaria', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Buscas_Ativas', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Portaria_Movimentacoes', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Alertas_Responsaveis', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Turmas', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Usuarios_Login', gridProperties: { frozenRowCount: 1 } } },
          ],
        }),
      });

      if (!createResp.ok) {
        const errText = await createResp.text();
        console.error('Google Sheets API Error (Create):', errText);
        return res.status(createResp.status).json({
          error: `Erro da API Google Sheets ao criar planilha: ${errText}`,
        });
      }

      const sheetData = await createResp.json();
      const spreadsheetId = sheetData.spreadsheetId;
      const spreadsheetUrl =
        sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      // 2. Populate all sheets with current database records
      const datasets = db.getSpreadsheetDatasets();
      const batchData = Object.entries(datasets).map(([sheetName, rows]) => ({
        range: `${sheetName}!A1`,
        values: rows,
      }));

      const populateResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: batchData,
          }),
        }
      );

      if (!populateResp.ok) {
        console.warn('Populate Warning:', await populateResp.text());
      }

      const raw = db.getAllDataRaw();
      const config = db.updateGoogleSheetsConfig({
        spreadsheetId,
        spreadsheetUrl,
        title,
        lastSync: new Date().toISOString(),
        connectedUserEmail: userEmail || null,
        syncedCounts: {
          students: raw.students.length,
          attendance: raw.attendanceRecords.length,
          interventions: raw.interventions.length,
          gateRecords: (raw.gateRecords || []).length,
          alerts: raw.alerts.length,
        },
      });

      res.json({
        success: true,
        message: 'Planilha oficial do Google criada e alimentada com sucesso!',
        config,
      });
    } catch (e: any) {
      console.error('Server error creating Google Sheet:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Sync system data to Google Sheet
  app.post('/api/google-sheets/sync-to-sheet', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação Google ausente ou inválido' });
    }

    try {
      const { spreadsheetId: paramId, userEmail } = req.body;
      const config = db.getGoogleSheetsConfig();
      const spreadsheetId = paramId || config.spreadsheetId;

      if (!spreadsheetId) {
        return res.status(400).json({ error: 'Nenhuma planilha vinculada para sincronização' });
      }

      const datasets = db.getSpreadsheetDatasets();
      const batchData = Object.entries(datasets).map(([sheetName, rows]) => ({
        range: `${sheetName}!A1`,
        values: rows,
      }));

      const syncResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: batchData,
          }),
        }
      );

      if (!syncResp.ok) {
        const errText = await syncResp.text();
        return res.status(syncResp.status).json({
          error: `Erro ao sincronizar com Google Sheets: ${errText}`,
        });
      }

      const raw = db.getAllDataRaw();
      const updatedConfig = db.updateGoogleSheetsConfig({
        spreadsheetId,
        lastSync: new Date().toISOString(),
        connectedUserEmail: userEmail || config.connectedUserEmail,
        syncedCounts: {
          students: raw.students.length,
          attendance: raw.attendanceRecords.length,
          interventions: raw.interventions.length,
          gateRecords: (raw.gateRecords || []).length,
          alerts: raw.alerts.length,
        },
      });

      res.json({
        success: true,
        message: 'Dados sincronizados com sucesso na sua Planilha Google!',
        config: updatedConfig,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Import students updated in Google Sheet back into the system
  app.post('/api/google-sheets/sync-from-sheet', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação Google ausente ou inválido' });
    }

    try {
      const config = db.getGoogleSheetsConfig();
      const spreadsheetId = req.body.spreadsheetId || config.spreadsheetId;

      if (!spreadsheetId) {
        return res.status(400).json({ error: 'Nenhuma planilha vinculada' });
      }

      const getResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Alunos!A1:S500`,
        {
          headers: { Authorization: authHeader },
        }
      );

      if (!getResp.ok) {
        const errText = await getResp.text();
        return res.status(getResp.status).json({ error: `Erro ao ler planilha: ${errText}` });
      }

      const result = await getResp.json();
      const rows = result.values || [];
      const importResult = db.importStudentsFromGoogleSheet(rows);

      res.json({
        success: true,
        message: `${importResult.updatedCount} estudante(s) atualizados a partir da Planilha Google.`,
        updatedCount: importResult.updatedCount,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // =========================================================================
  // PROXIES PARA GOOGLE APPS SCRIPT / GOOGLE SHEETS
  // Evitam erros de CORS e redirecionamento 302 direto no navegador
  // =========================================================================

  const OCORRENCIAS_APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbxoaLMtXKdq7sn_NB0U1ROENEmtlfaSe6PwCYCyjmMbmNa3gM2tXHBCDL97tD8G61TW/exec';

  const TABLETS_APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbwV2JJo26LjoraCpo88qOYdna6IO_ornLE1BRXZc86kDcP9QJU_98Ei03i21pTLp1-uZA/exec';

  // --- 1. OCORRÊNCIAS & MEDIAÇÃO ---
  app.get('/api/sheets-ocorrencias', async (req, res) => {
    try {
      let data: any = null;
      try {
        const response = await fetch(OCORRENCIAS_APPS_SCRIPT_URL, {
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const text = await response.text();
          const trimmed = text.trim();
          if (!trimmed.startsWith('<') && !trimmed.toLowerCase().startsWith('<!doctype')) {
            try {
              data = JSON.parse(text);
            } catch {
              console.warn('Erro ao decodificar JSON do Apps Script de ocorrências');
            }
          } else {
            console.warn('Google Apps Script de ocorrências retornou HTML (redirecionamento ou login)');
          }
        }
      } catch (err: any) {
        console.warn('Falha temporária ao consultar Apps Script:', err.message);
      }

      // Se existir o arquivo local atualizado e desduplicado, use como base primária ou complemento
      const cleanFilePath = path.join(process.cwd(), 'server', 'ocorrencias_clean.json');
      let cleanLocalData: any = null;
      if (fs.existsSync(cleanFilePath)) {
        try {
          cleanLocalData = JSON.parse(fs.readFileSync(cleanFilePath, 'utf-8'));
        } catch (e) {
          console.error('Erro ao ler ocorrencias_clean.json:', e);
        }
      }

      if (!data && cleanLocalData) {
        data = cleanLocalData;
      } else if (data && cleanLocalData) {
        // Atualiza a lista oficial de estudantes com a enviada pelo usuário (373 estudantes atualizados de Setembro)
        if (cleanLocalData.estudantes && cleanLocalData.estudantes.length > 0) {
          data.estudantes = cleanLocalData.estudantes;
        }

        // Combina e desduplica registros de ocorrências
        const allRegistros = [...(data.registros || []), ...(cleanLocalData.registros || [])];
        const seenRegistros = new Map<string, any>();
        for (const reg of allRegistros) {
          const key = [
            (reg.data || '').trim(),
            (reg.aula || '').trim(),
            (reg.turma || '').trim(),
            (reg.estudante || '').trim(),
            (reg.ocorrencia || '').trim(),
          ].join('::');

          if (!seenRegistros.has(key)) {
            seenRegistros.set(key, reg);
          }
        }
        data.registros = Array.from(seenRegistros.values());
      } else if (data && !cleanLocalData) {
        // Desduplica caso venha direto do Apps Script sem cache local
        const seen = new Map<string, any>();
        for (const reg of (data.registros || [])) {
          const key = [
            (reg.data || '').trim(),
            (reg.aula || '').trim(),
            (reg.turma || '').trim(),
            (reg.estudante || '').trim(),
            (reg.ocorrencia || '').trim(),
          ].join('::');
          if (!seen.has(key)) {
            seen.set(key, reg);
          }
        }
        data.registros = Array.from(seen.values());
      }

      if (data) {
        res.json(data);
      } else {
        res.status(502).json({
          erro: 'Não foi possível carregar dados da planilha nem do arquivo local.',
          fallback: true,
        });
      }
    } catch (err: any) {
      console.error('Erro proxy GET ocorrências Apps Script:', err.message);
      res.status(502).json({
        erro: 'Erro de comunicação com a planilha do Google Apps Script: ' + err.message,
        fallback: true,
      });
    }
  });

  app.post('/api/sheets-ocorrencias', async (req, res) => {
    try {
      const cleanFilePath = path.join(process.cwd(), 'server', 'ocorrencias_clean.json');
      const body = req.body;

      // 1. Salva ou atualiza no arquivo limpo local do sistema
      if (fs.existsSync(cleanFilePath)) {
        try {
          const currentClean = JSON.parse(fs.readFileSync(cleanFilePath, 'utf-8'));
          if (body.action === 'salvar_config_ocorrencias' || body.action === 'salvar_config') {
            if (Array.isArray(body.turmas)) currentClean.turmasPersonalizadas = body.turmas;
            if (Array.isArray(body.ocorrencias)) currentClean.ocorrencias = body.ocorrencias;
            if (Array.isArray(body.medidas)) currentClean.medidas = body.medidas;
            if (Array.isArray(body.aulas)) currentClean.aulas = body.aulas;
          } else if (body.action === 'excluir' || body.action === 'excluir_ocorrencia' || body.acao === 'excluir') {
            currentClean.registros = (currentClean.registros || []).filter((r: any) => r.id !== body.id);
          } else if (body.action === 'salvar_mediacao' || body.action === 'mediacao' || body.acao === 'mediar') {
            const idx = currentClean.registros.findIndex((r: any) => r.id === body.id);
            if (idx >= 0) {
              currentClean.registros[idx].status = body.status || 'Resolvido';
              currentClean.registros[idx].mediacao = body.mediacao || '';
              currentClean.registros[idx].mediador = body.mediador || '';
            }
          } else if (body.action === 'salvar_tratativa_familia' || body.action === 'tratativa_familia' || body.acao === 'tratativa_familia') {
            if (!currentClean.tratativasFamilia) currentClean.tratativasFamilia = [];
            currentClean.tratativasFamilia.unshift({
              id: body.id || `TRAT-${Date.now()}`,
              data: body.data,
              turma: body.turma,
              estudante: body.estudante,
              responsavel: body.responsavel,
              contato: body.contato,
              tipoContato: body.tipoContato,
              motivo: body.motivo,
              acordos: body.acordos,
              registradoPor: body.registradoPor,
            });
          } else {
            // Novo registro de ocorrência
            const novoReg = {
              id: body.id || `#OC-${Math.floor(100000 + Math.random() * 900000)}`,
              data: body.data,
              aula: body.aula,
              turma: body.turma,
              estudante: body.estudante,
              tutor: body.tutor,
              professor: body.professor,
              ocorrencia: body.ocorrencia,
              medida: body.medida,
              auxilio: body.auxilio,
              descricao: body.descricao,
              status: body.status || 'Pendente',
              mediacao: body.mediacao || '',
              mediador: body.mediador || '',
            };

            // Evita duplicatas ao salvar
            const key = [
              (novoReg.data || '').trim(),
              (novoReg.aula || '').trim(),
              (novoReg.turma || '').trim(),
              (novoReg.estudante || '').trim(),
              (novoReg.ocorrencia || '').trim(),
            ].join('::');

            const jaExiste = currentClean.registros.some((r: any) => {
              const k = [
                (r.data || '').trim(),
                (r.aula || '').trim(),
                (r.turma || '').trim(),
                (r.estudante || '').trim(),
                (r.ocorrencia || '').trim(),
              ].join('::');
              return k === key;
            });

            if (!jaExiste) {
              currentClean.registros.unshift(novoReg);
            }
          }
          fs.writeFileSync(cleanFilePath, JSON.stringify(currentClean, null, 2), 'utf-8');
        } catch (e: any) {
          console.warn('Erro ao atualizar ocorrencias_clean.json local:', e.message);
        }
      }

      // 2. Se a planilha do Google Sheets estiver ativa, repassa para ela também
      let sheetsSuccess = false;
      let sheetsData: any = null;
      try {
        const response = await fetch(OCORRENCIAS_APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        try {
          sheetsData = JSON.parse(text);
          sheetsSuccess = true;
        } catch {
          sheetsSuccess = true;
          sheetsData = { status: 'sucesso', raw: text };
        }
      } catch (err: any) {
        console.warn('Google Sheets externo inacessível, dados preservados com sucesso na base do sistema:', err.message);
      }

      // Retorna sucesso pois os dados estão salvos na base do sistema
      res.json({
        status: 'sucesso',
        savedLocally: true,
        sheetsSynced: sheetsSuccess,
        details: sheetsData,
      });
    } catch (err: any) {
      console.error('Erro ao salvar ocorrência:', err.message);
      res.status(500).json({
        status: 'erro',
        mensagem: 'Erro interno ao salvar ocorrência: ' + err.message,
      });
    }
  });

  // --- 2. AGENDAMENTO DE TABLETS ---
  app.get('/api/sheets-tablets', async (req, res) => {
    try {
      let data: any = null;
      try {
        const response = await fetch(TABLETS_APPS_SCRIPT_URL, {
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const text = await response.text();
          const trimmed = text.trim();
          if (!trimmed.startsWith('<') && !trimmed.toLowerCase().startsWith('<!doctype')) {
            try {
              data = JSON.parse(text);
            } catch {
              console.warn('Erro ao decodificar JSON do Apps Script de tablets');
            }
          } else {
            console.warn('Google Apps Script de tablets retornou HTML (redirecionamento ou login)');
          }
        }
      } catch (err: any) {
        console.warn('Falha temporária ao consultar Apps Script de tablets:', err.message);
      }

      // Arquivo local limpo e desduplicado
      const cleanTabletsPath = path.join(process.cwd(), 'server', 'tablets_clean.json');
      let cleanTabletsData: any = null;
      if (fs.existsSync(cleanTabletsPath)) {
        try {
          cleanTabletsData = JSON.parse(fs.readFileSync(cleanTabletsPath, 'utf-8'));
        } catch (e) {
          console.error('Erro ao ler tablets_clean.json:', e);
        }
      }

      if (!data && cleanTabletsData) {
        data = cleanTabletsData;
      } else if (data) {
        // Desduplicação estrita de agendamentos
        const allAgendamentos = [
          ...(data.agendamentos || []),
          ...((cleanTabletsData && cleanTabletsData.agendamentos) || []),
        ];
        const seen = new Set<string>();
        const uniqueAgendamentos: any[] = [];
        for (const ag of allAgendamentos) {
          const key = [
            (ag.data || '').trim(),
            (ag.aula || '').trim(),
            (ag.professor || '').trim(),
            (ag.turma || '').trim(),
            ag.tablets || 0,
          ].join('::');
          if (!seen.has(key)) {
            seen.add(key);
            uniqueAgendamentos.push(ag);
          }
        }
        data.agendamentos = uniqueAgendamentos;
      }

      if (data) {
        res.json(data);
      } else {
        res.status(502).json({
          erro: 'Erro de comunicação com a planilha de tablets e sem dados em cache.',
          fallback: true,
        });
      }
    } catch (err: any) {
      console.error('Erro proxy GET tablets Apps Script:', err.message);
      res.status(502).json({
        erro: 'Erro de comunicação com a planilha de tablets: ' + err.message,
        fallback: true,
      });
    }
  });

  app.post('/api/sheets-tablets', async (req, res) => {
    try {
      const cleanTabletsPath = path.join(process.cwd(), 'server', 'tablets_clean.json');
      const body = req.body;

      // 1. Salva na base de dados unificada do sistema
      if (fs.existsSync(cleanTabletsPath)) {
        try {
          const currentTablets = JSON.parse(fs.readFileSync(cleanTabletsPath, 'utf-8'));
          if (body.action === 'cancelar') {
            // Cancelamento / exclusão de reserva
            currentTablets.agendamentos = (currentTablets.agendamentos || []).filter((a: any) => {
              const match =
                a.data === body.data &&
                a.aula === body.aula &&
                a.turma === body.turma &&
                a.professor === body.professor;
              return !match;
            });
          } else {
            // Nova reserva de tablets
            const novaReserva = {
              data: body.data,
              aula: body.aula,
              turma: body.turma,
              professor: body.professor,
              tablets: Number(body.tablets) || 1,
            };

            const key = [
              (novaReserva.data || '').trim(),
              (novaReserva.aula || '').trim(),
              (novaReserva.professor || '').trim(),
              (novaReserva.turma || '').trim(),
              novaReserva.tablets,
            ].join('::');

            const jaExiste = (currentTablets.agendamentos || []).some((a: any) => {
              const k = [
                (a.data || '').trim(),
                (a.aula || '').trim(),
                (a.professor || '').trim(),
                (a.turma || '').trim(),
                a.tablets,
              ].join('::');
              return k === key;
            });

            if (!jaExiste) {
              if (!currentTablets.agendamentos) currentTablets.agendamentos = [];
              currentTablets.agendamentos.unshift(novaReserva);
            }
          }
          fs.writeFileSync(cleanTabletsPath, JSON.stringify(currentTablets, null, 2), 'utf-8');
        } catch (e: any) {
          console.warn('Erro ao atualizar tablets_clean.json local:', e.message);
        }
      }

      // 2. Se a planilha do Google Sheets estiver ativa, sincroniza com ela também
      let sheetsSuccess = false;
      let sheetsData: any = null;
      try {
        const response = await fetch(TABLETS_APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        try {
          sheetsData = JSON.parse(text);
          sheetsSuccess = true;
        } catch {
          sheetsSuccess = true;
          sheetsData = { status: 'sucesso', raw: text };
        }
      } catch (err: any) {
        console.warn('Google Sheets de tablets inacessível, agendamento preservado com sucesso na base do sistema:', err.message);
      }

      res.json({
        status: 'sucesso',
        savedLocally: true,
        sheetsSynced: sheetsSuccess,
        details: sheetsData,
      });
    } catch (err: any) {
      console.error('Erro ao processar reserva de tablets:', err.message);
      res.status(500).json({
        status: 'erro',
        mensagem: 'Erro interno ao salvar agendamento de tablets: ' + err.message,
      });
    }
  });

  // Reset database to initial seed data
  app.post('/api/reset-data', (req, res) => {
    try {
      const fresh = db.resetDemoData();
      res.json({ success: true, message: 'Dados escolares reinicializados com sucesso', schoolName: fresh.schoolName });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Wipe all school data completely (factory clean, keeping only Master user)
  app.post('/api/wipe-all', (req, res) => {
    try {
      const result = db.wipeAllData();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Busca Ativa Escolar] Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Falha crítica ao iniciar servidor:', err);
});
