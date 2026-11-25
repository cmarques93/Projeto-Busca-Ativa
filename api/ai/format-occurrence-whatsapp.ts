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
  const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
  const estudante = typeof body.estudante === 'string' && body.estudante.trim() ? body.estudante.trim() : 'Estudante';
  const turma = typeof body.turma === 'string' ? body.turma.trim() : '';
  const ocorrencia = typeof body.ocorrencia === 'string' ? body.ocorrencia.trim() : '';
  const medida = typeof body.medida === 'string' ? body.medida.trim() : '';
  const professor = typeof body.professor === 'string' ? body.professor.trim() : '';
  const aula = typeof body.aula === 'string' ? body.aula.trim() : '';
  const schoolName = typeof body.schoolName === 'string' && body.schoolName.trim() ? body.schoolName.trim() : 'Unidade Escolar';

  if (!descricao && !ocorrencia) {
    return res.status(400).json({ error: 'Descrição ou tipo de ocorrência não informado.' });
  }

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

  const prompt = `Você é um assistente pedagógico especializado em mediação escolar, correção gramatical e comunicação clara e respeitosa com famílias e responsáveis na educação básica.

Sua tarefa principal é ler o texto do relato digitado pelo docente e gerar:
1. "descricaoFormatada": Reformule APENAS o relato escrito pelo docente.
   - Corrija erros gramaticais, de concordância, pontuação e ortografia em português (pt-BR).
   - Ajuste a linguagem para que seja formal, respeitosa, educada e empática.
   - Mantenha 100% de fidelidade aos fatos narrados, sem inventar informações nem incluir títulos/metadados.
2. "mensagemWhatsApp": Mensagem completa, empática e acolhedora pronta para envio aos responsáveis pelo WhatsApp da unidade escolar (${schoolName}), explicando o ocorrido de forma gentil e solicitando diálogo da família. Use *negrito* de forma discreta para nomes e destaques.

RELATO ORIGINAL:
"${descricao || ocorrencia}"

CONTEXTO ADICIONAL PARA O WHATSAPP:
- Escola: ${schoolName}
- Estudante: ${estudante}
- Turma: ${turma || 'Não informada'}
- Horário / Aula: ${aula || 'Horário letivo'}
- Docente: ${professor || 'Equipe Docente'}
- Ocorrência: ${ocorrencia || 'Convivência escolar'}
- Medida Aplicada: ${medida || 'Acompanhamento pedagógico'}`;

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
              descricaoFormatada: { type: Type.STRING },
              mensagemWhatsApp: { type: Type.STRING },
            },
            required: ['descricaoFormatada', 'mensagemWhatsApp'],
          },
        },
      });

      const rawText = response.text?.trim();
      if (rawText) {
        const parsed = JSON.parse(rawText);
        return res.status(200).json({
          descricaoFormatada: String(parsed.descricaoFormatada || '').trim(),
          mensagemWhatsApp: String(parsed.mensagemWhatsApp || '').trim(),
          source: 'gemini_ai',
          model,
        });
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Vercel format-occurrence-whatsapp model ${model} failed:`, err?.message || err);
    }
  }

  const status = lastError?.status && lastError.status >= 400 && lastError.status < 600 ? lastError.status : 502;
  return res.status(status).json({
    error:
      status === 429
        ? 'Limite temporário de requisições da IA atingido. Aguarde alguns segundos e tente novamente.'
        : lastError?.message || 'Não foi possível gerar a mensagem para WhatsApp com a IA.',
  });
}
