import { GoogleGenAI, Type } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { fileBase64, fileName, classes = [], periods = [], fixedTerms = [] } = body;

    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'Arquivo PDF não recebido ou inválido.' });
    }

    const cleanBase64 = fileBase64.replace(/^data:application\/pdf;base64,/i, '').trim();
    if (!cleanBase64) {
      return res.status(400).json({ error: 'Conteúdo Base64 do PDF está vazio.' });
    }

    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      return res.status(503).json({
        error: 'Serviço de leitura de PDF indisponível no servidor. Verifique a variável GEMINI_API_KEY.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const classListText =
      Array.isArray(classes) && classes.length > 0
        ? classes.map((c: any) => String(c.name || c)).join(', ')
        : 'Não informadas (extrair exatamente como escrito no PDF)';

    const periodListText =
      Array.isArray(periods) && periods.length > 0
        ? periods
            .filter((p: any) => !p.isBreak && Number(p.number) > 0)
            .map((p: any) => `${p.number}ª aula (${p.start || p.startTime || ''}-${p.end || p.endTime || ''})`)
            .join(', ')
        : '1ª a 9ª aula';

    const fixedTermsText =
      Array.isArray(fixedTerms) && fixedTerms.length > 0
        ? fixedTerms.join(', ')
        : 'TUTORIA, CLUBES, ELETIVAS, EDU PROFISSIONAL, ALMOÇO, INTERVALO';

    const extractionPrompt = `Analise o arquivo PDF do horário escolar em anexo ("${typeof fileName === 'string' ? fileName : 'horario.pdf'}") e extraia TODAS as aulas e atividades fixas presentes na grade.

REGRAS ESTRITAS DE FIDELIDADE (ZERO ALUCINAÇÃO):
1. Extraia EXCLUSIVAMENTE o que está literalmente escrito no documento PDF.
2. JAMAIS invente, complete ou deduza aulas, professores ou turmas que não estejam visíveis no PDF.
3. Mapeamento dos dias da semana (dayOfWeek):
   - 1 = Segunda-feira, 2 = Terça-feira, 3 = Quarta-feira, 4 = Quinta-feira, 5 = Sexta-feira
4. Mapeamento do número da aula (periodNumber): número inteiro correspondente à ordem da aula no dia (${periodListText}).
5. Turmas cadastradas na escola para referência de nomenclatura: ${classListText}.
6. Para cada célula preenchida:
   - Se for atividade fixa institucional (${fixedTermsText}) sem professor individual atribuído, preencha "fixedLabel" em maiúsculas e deixe "discipline" e "teacherName" vazios.
   - Em padrões como "NOME DO PROFESSOR (DISCIPLINA)", o texto fora dos parênteses é "teacherName" e o texto dentro dos parênteses é "discipline".
   - JAMAIS coloque nome de disciplina em "teacherName".
7. Em "warnings", informe brevemente qualquer trecho ilegível ou ambiguidade encontrada.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: cleanBase64,
            },
          },
          {
            text: extractionPrompt,
          },
        ],
      },
      config: {
        systemInstruction:
          'Você é um extrator tabular de alta precisão para horários escolares brasileiros. Retorne exclusivamente JSON fiel ao documento PDF enviado, sem inventar nenhum dado.',
        responseMimeType: 'application/json',
        seed: 42,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            entries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dayOfWeek: { type: Type.INTEGER },
                  periodNumber: { type: Type.INTEGER },
                  rawClassName: { type: Type.STRING },
                  discipline: { type: Type.STRING },
                  teacherName: { type: Type.STRING },
                  fixedLabel: { type: Type.STRING },
                },
              },
            },
            warnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const rawText = (response.text || '').trim();
    if (!rawText) {
      return res.status(422).json({ error: 'Não foi possível extrair conteúdo estruturado deste PDF.' });
    }

    const parsed = JSON.parse(rawText);
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(
          (e: any) =>
            e &&
            Number(e.dayOfWeek) >= 1 &&
            Number(e.dayOfWeek) <= 5 &&
            Number(e.periodNumber) >= 1 &&
            Number(e.periodNumber) <= 12 &&
            String(e.rawClassName || '').trim().length > 0 &&
            (String(e.discipline || '').trim().length > 0 || String(e.fixedLabel || '').trim().length > 0)
        )
      : [];

    return res.status(200).json({
      entries,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    });
  } catch (err: any) {
    console.error('Vercel timetable import-pdf error:', err);
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    const msg =
      status === 429
        ? 'Limite de requisições da API atingido ao ler o PDF. Aguarde alguns instantes ou importe o arquivo em formato Excel (.xlsx).'
        : err?.message || 'Erro ao interpretar o arquivo PDF do horário.';
    return res.status(status).json({ error: msg });
  }
}
