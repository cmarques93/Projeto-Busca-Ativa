/**
 * Utilitário robusto de formatação pedagógica com Gemini
 * Suporta servidor Express, Vercel Serverless Functions (/api/ai/format-description)
 * e chamada direta no client-side como fallback.
 */

export function limparTextoFormatado(texto: string): string {
  if (!texto) return '';
  let limpo = texto.trim();
  // Remove títulos em Markdown (# Título)
  limpo = limpo.replace(/^#+\s+.*?\n+/i, '');
  // Remove títulos em negrito (**Comunicado aos Responsáveis**)
  limpo = limpo.replace(/^\*\*.*?\*\*\s*:?\s*/i, '');
  // Remove prefixos e cabeçalhos textuais indesejados
  limpo = limpo.replace(/^(comunicado|notificação|aviso|informe|relato|registro|parecer|mensagem|termo)\s+(aos\s+responsáveis|aos\s+pais|à\s+família|escolar|pedagógico|disciplinar)\s*:?\s*/gi, '');
  limpo = limpo.replace(/^(prezados|senhores|caros)\s+(pais|responsáveis|familiares)\s*:?,?\s*/gi, '');
  limpo = limpo.replace(/^(relato\s+do\s+ocorrido|descrição\s+da\s+ocorrência|anotação\s+pedagógica)\s*:?\s*/gi, '');
  // Remove aspas externas
  limpo = limpo.replace(/^["'«»“”]/g, '').replace(/["'«»“”]$/g, '');
  return limpo.trim();
}

const PROMPT_PEDAGOGICO = (textoOriginal: string) => `Atue como um assistente pedagógico. Sua tarefa é reescrever, revisar e formatar esse texto, pois uma cópia será entregue aos responsáveis do estudante.
Siga estas diretrizes:
Correção Gramatical: Aplique a norma-padrão da língua portuguesa, corrigindo erros de digitação, pontuação e concordância.
Linguagem Simples e Acessível: Reescreva o texto de forma que qualquer responsável compreenda o contexto sem dificuldade. Evite jargões técnicos da área da educação.
Tom Profissional: Mantenha a objetividade, o respeito e a imparcialidade. O texto deve relatar o fato de forma descritiva, sem julgamentos de valor desnecessários.
Fidelidade aos Fatos: Apenas organize e estruture as informações fornecidas. Nunca adicione detalhes ou fatos que não estejam nas minhas anotações originais.
Estruturação: Entregue o resultado em um formato limpo e fácil de ler.

TEXTO ORIGINAL:
"${textoOriginal}"

REGRA CRÍTICA E ABSOLUTA:
- NÃO coloque títulos, cabeçalhos nem saudações como "Comunicado aos Responsáveis", "Prezados Pais", "Relato Pedagógico", "Comunicado Escolar" ou similares.
- NÃO adicione introduções ("Aqui está o texto:"), sem aspas adicionais, sem preâmbulos e sem explicações.
- Retorne APENAS o parágrafo descritivo do fato ocorrido.`;

export async function formatarRelatoComGemini(textoOriginal: string): Promise<string> {
  const rawTrim = (textoOriginal || '').trim();
  if (!rawTrim) return '';

  // 1. Tenta a API do Backend / Vercel Serverless Function
  try {
    const res = await fetch('/api/ai/format-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: rawTrim, descricao: rawTrim }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.descricaoFormatada) {
        return limparTextoFormatado(data.descricaoFormatada);
      }
    }
  } catch (err) {
    console.warn('Backend /api/ai/format-description endpoint indisponível, tentando chamada direta:', err);
  }

  // 2. Fallback direto via REST no Frontend (caso rodando em Vercel estático)
  const clientKey =
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (import.meta as any).env?.VITE_API_KEY ||
    localStorage.getItem('GEMINI_API_KEY') ||
    '';

  if (clientKey) {
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.1-pro-preview'];
    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${clientKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT_PEDAGOGICO(rawTrim) }] }]
          }),
        });

        if (resp.ok) {
          const geminiData = await resp.json();
          const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (generatedText) {
            return limparTextoFormatado(generatedText);
          }
        }
      } catch (clientErr) {
        console.warn(`Tentativa cliente Gemini ${model} falhou:`, clientErr);
      }
    }
  }

  // 3. Fallback estruturado local seguro
  let f = rawTrim.charAt(0).toUpperCase() + rawTrim.slice(1);
  if (!/[.!?]$/.test(f)) f += '.';
  return limparTextoFormatado(f);
}
