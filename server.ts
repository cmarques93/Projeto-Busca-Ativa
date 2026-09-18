import express from 'express';
import path from 'path';
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
    if (!aiClient && process.env.GEMINI_API_KEY) {
      aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return aiClient;
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
      const { classId, riskLevel, status, search } = req.query;
      const students = db.getStudents({
        classId: classId as string,
        riskLevel: riskLevel as string,
        status: status as string,
        search: search as string,
      });
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
      const success = db.deleteStudent(req.params.id);
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

  // Monthly pedagogical reports
  app.get('/api/reports/monthly', (req, res) => {
    try {
      const month = req.query.month ? Number(req.query.month) : 9;
      const year = req.query.year ? Number(req.query.year) : 2026;
      const report = db.getMonthlyReport(month, year);
      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // AI Pedagogical Assistant (Gemini with fallback)
  app.post('/api/ai/pedagogical-plan', async (req, res) => {
    const { studentName, className, consecutiveAbsences, attendanceRate, vulnerabilityFactors, guardianRelationship } = req.body;

    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `Você é um especialista pedagógico da Busca Ativa Escolar (UNICEF / MEC).
Elabore um plano de intervenção rápido e empático para o seguinte estudante em risco de evasão escolar:
- Nome do estudante: ${studentName} (${className})
- Faltas consecutivas: ${consecutiveAbsences}
- Taxa de frequência atual: ${attendanceRate}%
- Fatores de vulnerabilidade: ${vulnerabilityFactors?.join(', ') || 'Não especificados'}
- Responsável: ${guardianRelationship || 'Responsável Legal'}

Responda em formato JSON com as seguintes chaves:
{
  "diagnostico": "Resumo empático e técnico do caso em 2 a 3 frases",
  "recomendacoes": ["Ação imediata 1", "Ação 2 com a rede protetiva", "Ação pedagógica 3"],
  "mensagemSugerida": "Mensagem empática para enviar via WhatsApp para o responsável (sem tom punitivo, demonstrando acolhimento da escola)"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });

        const text = response.text || '';
        const parsed = JSON.parse(text);
        return res.json(parsed);
      } catch (err) {
        console.warn('Gemini API call failed, falling back to pedagogical rules engine:', err);
      }
    }

    // High quality fallback based on UNICEF Busca Ativa guidelines
    const isCritical = consecutiveAbsences >= 4 || attendanceRate < 75;
    const fallbackResponse = {
      diagnostico: `O estudante ${studentName} apresenta padrão de infrequência ${isCritical ? 'crítica com risco iminente de abandono escolar' : 'em elevação que demanda alerta preventivo'}. Os fatores observados (${vulnerabilityFactors?.join(', ') || 'ausências reiteradas'}) indicam a necessidade de ação intersetorial imediata para remover as barreiras de acesso à escola.`,
      recomendacoes: [
        'Realizar escuta ativa com a família para identificar se a ausência decorre de trabalho informal, saúde ou vulnerabilidade de transporte.',
        'Pactuar um Plano de Estudos Individualizado (PEI) para recuperação dos conteúdos perdidos sem sobrecarregar o aluno.',
        isCritical
          ? 'Articular encaminhamento ao CRAS / Conselho Tutelar via FICAI para garantir a garantia dos direitos fundamentais.'
          : 'Monitorar a assiduidade diária nas próximas duas semanas com confirmação via chamada matinal.'
      ],
      mensagemSugerida: `Olá, ${guardianRelationship || 'Família'} de ${studentName}! Aqui é da coordenação da EE Professor Arlindo Silvestre. Sentimos muito a falta do(a) ${studentName} nas aulas esta semana. A escola quer muito entender como podemos apoiá-los para que ele(a) retorne com tranquilidade aos estudos. Podemos conversar hoje? Estamos de portas abertas!`
    };

    return res.json(fallbackResponse);
  });

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

  // Reset database to initial seed data
  app.post('/api/reset-data', (req, res) => {
    try {
      const fresh = db.resetDemoData();
      res.json({ success: true, message: 'Dados escolares reinicializados com sucesso', schoolName: fresh.schoolName });
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
