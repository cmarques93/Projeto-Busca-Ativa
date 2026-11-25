import { GoogleGenAI, Type } from '@google/genai';

const CANDIDATE_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const studentName = typeof body.studentName === 'string' && body.studentName.trim() ? body.studentName.trim() : 'Estudante';
  const actualClass =
    (typeof body.className === 'string' && body.className.trim()) ||
    (typeof body.studentClass === 'string' && body.studentClass.trim()) ||
    'Turma';
  const schoolName = typeof body.schoolName === 'string' && body.schoolName.trim() ? body.schoolName.trim() : 'Unidade Escolar';
  const consecutiveAbsences = Number.isFinite(Number(body.consecutiveAbsences)) ? Number(body.consecutiveAbsences) : 0;
  const attendanceRate = Number.isFinite(Number(body.attendanceRate)) ? Number(body.attendanceRate) : 100;
  const vulnerabilityFactors = Array.isArray(body.vulnerabilityFactors)
    ? body.vulnerabilityFactors.filter((v: any) => typeof v === 'string').slice(0, 15)
    : [];
  const guardianRelationship =
    typeof body.guardianRelationship === 'string' && body.guardianRelationship.trim()
      ? body.guardianRelationship.trim()
      : 'Responsável Legal';

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    return res.status(503).json({
      error: 'Serviço de IA não configurado no servidor. Verifique a variável GEMINI_API_KEY nas configurações do ambiente.',
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

  const prompt = `Você é um especialista pedagógico em Busca Ativa Escolar da educação básica brasileira.
Elabore um plano de intervenção técnico e humanizado para o seguinte estudante em risco de infrequência ou evasão na unidade escolar "${schoolName}":
- Estudante: ${studentName} (${actualClass})
- Faltas consecutivas: ${consecutiveAbsences}
- Frequência atual acumulada: ${attendanceRate}%
- Fatores de vulnerabilidade: ${vulnerabilityFactors.join(', ') || 'Ausências reiteradas sem justificativa formal'}
- Responsável: ${guardianRelationship}

DIRETRIZES E FUNDAMENTAÇÃO LEGAL:
1. Estatuto da Criança e do Adolescente (ECA - Lei Federal nº 8.069/1990, Artigo 56, inciso II): comunicação ao Conselho Tutelar nos casos de reiteração de faltas injustificadas e evasão escolar, esgotados os recursos escolares.
2. Lei de Diretrizes e Bases da Educação Nacional (LDB - Lei nº 9.394/1996, Art. 12, inciso VIII): notificação ao Conselho Tutelar quando as faltas ultrapassarem 30% do percentual permitido em lei.
3. Ações escalonadas de Busca Ativa Escolar: acolhimento familiar, escuta ativa, plano pedagógico de recuperação e articulação com a rede protetiva quando necessário.

Retorne um JSON estruturado com:
- "diagnostico": resumo empático e técnico do caso em 2 a 3 frases.
- "recomendacoes": lista de 3 a 4 ações concretas e escalonadas.
- "mensagemSugerida": mensagem empática e respeitosa para WhatsApp ao responsável (assinada pela equipe da ${schoolName}), sem tom punitivo, convidando a família para diálogo e apoio.`;

  let lastError: any = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnostico: { type: Type.STRING },
              recomendacoes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              mensagemSugerida: { type: Type.STRING },
            },
            required: ['diagnostico', 'recomendacoes', 'mensagemSugerida'],
          },
        },
      });

      const rawText = response.text?.trim();
      if (rawText) {
        const parsed = JSON.parse(rawText);
        return res.status(200).json({
          diagnostico: String(parsed.diagnostico || '').trim(),
          recomendacoes: Array.isArray(parsed.recomendacoes) ? parsed.recomendacoes.map(String) : [],
          mensagemSugerida: String(parsed.mensagemSugerida || '').trim(),
          fundamentacaoLegal: [
            'Estatuto da Criança e do Adolescente (ECA - Lei Federal nº 8.069/1990, Artigo 56, II)',
            'Lei de Diretrizes e Bases da Educação Nacional (LDB - Lei nº 9.394/1996, Art. 12, VIII)',
            'Protocolo de Busca Ativa Escolar e Articulação com a Rede Protetiva',
          ],
          quotaStatus: {
            quotaExceeded: false,
            isBlocked: false,
            source: 'gemini_ai',
            model,
          },
        });
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Vercel intervention-plan model ${model} failed:`, err?.message || err);
    }
  }

  const status = lastError?.status && lastError.status >= 400 && lastError.status < 600 ? lastError.status : 502;
  return res.status(status).json({
    error:
      status === 429
        ? 'Limite temporário de requisições da IA atingido. Aguarde alguns segundos e tente novamente.'
        : lastError?.message || 'Não foi possível gerar o plano de intervenção com a IA no momento.',
  });
}
