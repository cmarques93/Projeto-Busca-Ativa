import { GoogleGenAI } from '@google/genai';

function limparTextoFormatado(texto: string): string {
  if (!texto) return '';
  let limpo = texto.trim();
  // Remove markdown bold headers e títulos comuns
  limpo = limpo.replace(/^#+\s+.*?\n+/i, '');
  limpo = limpo.replace(/^\*\*.*?\*\*\s*:?\s*/i, '');
  limpo = limpo.replace(/^(comunicado|notificação|aviso|informe|relato|registro|parecer|mensagem|termo)\s+(aos\s+responsáveis|aos\s+pais|à\s+família|escolar|pedagógico|disciplinar)\s*:?\s*/gi, '');
  limpo = limpo.replace(/^(prezados|senhores|caros)\s+(pais|responsáveis|familiares)\s*:?,?\s*/gi, '');
  limpo = limpo.replace(/^["'«»“”]/g, '').replace(/["'«»“”]$/g, '');
  return limpo.trim();
}

export default async function handler(req: any, res: any) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { texto = '', descricao = '' } = req.body || {};
  const rawTrim = (texto || descricao || '').trim();

  if (!rawTrim) {
    return res.status(400).json({ error: 'Texto não fornecido para formatação' });
  }

  const fallbackText = () => {
    let f = rawTrim.charAt(0).toUpperCase() + rawTrim.slice(1);
    if (!/[.!?]$/.test(f)) f += '.';
    return limparTextoFormatado(f);
  };

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    '';

  if (!apiKey) {
    return res.json({
      descricaoFormatada: fallbackText(),
      source: 'fallback_sem_chave'
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
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

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.1-pro-preview'];
    let formatted = '';

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt
        });
        if (response.text) {
          formatted = limparTextoFormatado(response.text.trim());
          break;
        }
      } catch (e: any) {
        console.warn(`Vercel function model ${model} failed:`, e?.message || e);
      }
    }

    return res.json({
      descricaoFormatada: formatted || fallbackText(),
      source: 'gemini_ai_vercel'
    });
  } catch (err: any) {
    console.error('Vercel serverless Gemini error:', err);
    return res.json({
      descricaoFormatada: fallbackText(),
      source: 'motor_pedagogico_fallback',
      error: err?.message
    });
  }
}
