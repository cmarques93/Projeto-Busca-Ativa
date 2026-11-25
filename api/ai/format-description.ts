import { GoogleGenAI } from '@google/genai';

const CANDIDATE_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

function limparTextoFormatado(texto: string): string {
  if (!texto) return '';
  let limpo = texto.trim();
  limpo = limpo.replace(/^#+\s+.*?\n+/i, '');
  limpo = limpo.replace(/^\*\*.*?\*\*\s*:?\s*/i, '');
  limpo = limpo.replace(
    /^(comunicado|notificação|aviso|informe|relato|registro|parecer|mensagem|termo)\s+(aos\s+responsáveis|aos\s+pais|à\s+família|escolar|pedagógico|disciplinar)\s*:?\s*/gi,
    ''
  );
  limpo = limpo.replace(/^(prezados|senhores|caros)\s+(pais|responsáveis|familiares)\s*:?,?\s*/gi, '');
  limpo = limpo.replace(/^["'«»“”]/g, '').replace(/["'«»“”]$/g, '');
  return limpo.trim();
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawInput = typeof body.texto === 'string' ? body.texto : typeof body.descricao === 'string' ? body.descricao : '';
  const rawTrim = rawInput.trim();

  if (!rawTrim) {
    return res.status(400).json({ error: 'Texto não fornecido para formatação.' });
  }

  if (rawTrim.length > 8000) {
    return res.status(400).json({ error: 'Texto excede o limite máximo de caracteres permitido.' });
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

  let lastError: any = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text = response.text?.trim();
      if (text) {
        return res.status(200).json({
          descricaoFormatada: limparTextoFormatado(text),
          source: 'gemini_ai',
          model,
        });
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Vercel format-description model ${model} failed:`, err?.message || err);
    }
  }

  const status = lastError?.status && lastError.status >= 400 && lastError.status < 600 ? lastError.status : 502;
  return res.status(status).json({
    error:
      status === 429
        ? 'Limite temporário de requisições da IA atingido. Aguarde alguns segundos e tente novamente.'
        : lastError?.message || 'Não foi possível formatar o texto com a IA no momento.',
  });
}
