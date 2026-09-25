/**
 * Utilitário de inteligência artificial com Google Gemini para o Sistema de Ocorrências
 * Suporta:
 * 1. Servidor Express Node.js
 * 2. Vercel Serverless Functions (/api/ai/format-description)
 * 3. Chamada Direta via Browser REST (Google Generative AI API)
 * 4. Chave compartilhada via Firestore / localStorage / variáveis de ambiente
 */

export function getStoredGeminiKey(): string {
  try {
    const fromLocal = localStorage.getItem('GEMINI_API_KEY') || localStorage.getItem('VITE_GEMINI_API_KEY');
    if (fromLocal && fromLocal.trim()) return fromLocal.trim();

    const fromEnv = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY;
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();

    // Tenta cache de configurações do Firestore
    const cachedDb = localStorage.getItem('CACHE_OCORRENCIAS_APP');
    if (cachedDb) {
      try {
        const parsed = JSON.parse(cachedDb);
        if (parsed?.geminiApiKey && typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
          return parsed.geminiApiKey.trim();
        }
      } catch {}
    }
  } catch {}
  return '';
}

export function saveStoredGeminiKey(key: string): void {
  try {
    const clean = (key || '').trim();
    if (clean) {
      localStorage.setItem('GEMINI_API_KEY', clean);
      localStorage.setItem('VITE_GEMINI_API_KEY', clean);
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
      localStorage.removeItem('VITE_GEMINI_API_KEY');
    }
  } catch {}
}

export function limparTextoFormatado(texto: string): string {
  if (!texto) return '';
  let limpo = texto.trim();
  // Remove títulos em Markdown (# Título ou ### Título)
  limpo = limpo.replace(/^#+\s+.*?\n+/i, '');
  // Remove títulos em negrito (**Comunicado aos Responsáveis:**)
  limpo = limpo.replace(/^\*\*.*?\*\*\s*:?\s*/i, '');
  // Remove prefixos e cabeçalhos textuais comuns
  limpo = limpo.replace(/^(comunicado|notificação|aviso|informe|relato|registro|parecer|mensagem|termo)\s+(aos\s+responsáveis|aos\s+pais|à\s+família|escolar|pedagógico|disciplinar)\s*:?\s*/gi, '');
  limpo = limpo.replace(/^(prezados|senhores|caros)\s+(pais|responsáveis|familiares)\s*:?,?\s*/gi, '');
  limpo = limpo.replace(/^(relato\s+do\s+ocorrido|descrição\s+da\s+ocorrência|anotação\s+pedagógica)\s*:?\s*/gi, '');
  // Remove aspas externas
  limpo = limpo.replace(/^["'«»“”]/g, '').replace(/["'«»“”]$/g, '');
  return limpo.trim();
}

export const PROMPT_PEDAGOGICO = (textoOriginal: string) => `Atue como um assistente pedagógico. Sua tarefa é reescrever, revisar e formatar esse texto, pois uma cópia será entregue aos responsáveis do estudante.
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

const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.1-pro-preview'];

/**
 * Chamada direta via REST ao Google Generative AI (Client-Side)
 */
async function chamarGeminiDiretoRest(texto: string, apiKey: string): Promise<string> {
  let lastErr = '';
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT_PEDAGOGICO(texto) }] }]
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return limparTextoFormatado(text);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        lastErr = errJson?.error?.message || `HTTP ${res.status}`;
        console.warn(`Tentativa REST modelo ${model} retornou erro:`, lastErr);
      }
    } catch (e: any) {
      lastErr = e?.message || String(e);
      console.warn(`Falha na conexão com modelo ${model}:`, e);
    }
  }
  throw new Error(lastErr || 'Não foi possível obter resposta dos modelos Gemini.');
}

/**
 * Formata o relato com Gemini utilizando todas as camadas de redundância.
 */
export async function formatarRelatoComGemini(textoOriginal: string, customApiKey?: string): Promise<string> {
  const rawTrim = (textoOriginal || '').trim();
  if (!rawTrim) return '';

  const apiKey = customApiKey?.trim() || getStoredGeminiKey();

  // 1. Tenta API do Backend / Vercel Serverless Function
  try {
    const res = await fetch('/api/ai/format-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto: rawTrim,
        descricao: rawTrim,
        apiKey: apiKey || undefined,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.descricaoFormatada && data.source !== 'fallback_sem_chave' && data.source !== 'motor_pedagogico_fallback') {
        return limparTextoFormatado(data.descricaoFormatada);
      }
      if (data.descricaoFormatada && !apiKey) {
        return limparTextoFormatado(data.descricaoFormatada);
      }
    }
  } catch (err) {
    console.warn('Endpoint /api/ai/format-description indisponível:', err);
  }

  // 2. Se temos chave de API, executa diretamente no cliente (ideal para Vercel SPA)
  if (apiKey) {
    try {
      const formatted = await chamarGeminiDiretoRest(rawTrim, apiKey);
      if (formatted) return formatted;
    } catch (e: any) {
      console.warn('Chamada REST direta falhou com chave:', e);
      throw e;
    }
  }

  // 3. Se não tem chave e o servidor não respondeu com IA, lança erro explicativo
  throw new Error('CHAVE_GEMINI_AUSENTE');
}

/**
 * Validação de conexão e teste da chave com a API do Gemini
 */
export async function testarChaveGemini(apiKey: string): Promise<{ success: boolean; message: string; formattedSample?: string }> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { success: false, message: 'Chave de API não informada.' };
  }

  try {
    const sampleText = 'aluno conversou durante a aula e nao fez o exercicio';
    const result = await chamarGeminiDiretoRest(sampleText, cleanKey);
    return {
      success: true,
      message: 'Conexão estabelecida com sucesso com o Google Gemini!',
      formattedSample: result,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Falha ao conectar à API do Gemini com a chave fornecida.',
    };
  }
}
