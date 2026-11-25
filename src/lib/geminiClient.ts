/**
 * Cliente de Inteligência Artificial (Google Gemini) — 100% Server-Side
 * Todas as chamadas trafegam exclusivamente pelos endpoints seguros (/api/ai/*),
 * mantendo as credenciais protegidas nas variáveis de ambiente do servidor.
 */

export function limparTextoFormatado(texto: string): string {
  if (!texto) return '';
  let limpo = texto.trim();
  // Remove títulos em Markdown (# Título ou ### Título)
  limpo = limpo.replace(/^#+\s+.*?\n+/i, '');
  // Remove títulos em negrito (**Comunicado aos Responsáveis:**)
  limpo = limpo.replace(/^\*\*.*?\*\*\s*:?\s*/i, '');
  // Remove prefixos e cabeçalhos textuais comuns
  limpo = limpo.replace(
    /^(comunicado|notificação|aviso|informe|relato|registro|parecer|mensagem|termo)\s+(aos\s+responsáveis|aos\s+pais|à\s+família|escolar|pedagógico|disciplinar)\s*:?\s*/gi,
    ''
  );
  limpo = limpo.replace(/^(prezados|senhores|caros)\s+(pais|responsáveis|familiares)\s*:?,?\s*/gi, '');
  limpo = limpo.replace(/^(relato\s+do\s+ocorrido|descrição\s+da\s+ocorrência|anotação\s+pedagógica)\s*:?\s*/gi, '');
  // Remove aspas externas
  limpo = limpo.replace(/^["'«»“”]/g, '').replace(/["'«»“”]$/g, '');
  return limpo.trim();
}

/**
 * Formata e revisa gramaticalmente um relato pedagógico via endpoint server-side.
 */
export async function formatarRelatoComGemini(textoOriginal: string): Promise<string> {
  const rawTrim = (textoOriginal || '').trim();
  if (!rawTrim) return '';

  const res = await fetch('/api/ai/format-description', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      texto: rawTrim,
      descricao: rawTrim,
    }),
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    throw new Error(data?.error || `Serviço de IA indisponível no momento (HTTP ${res.status}).`);
  }

  if (data?.descricaoFormatada) {
    return limparTextoFormatado(String(data.descricaoFormatada));
  }

  throw new Error('A IA não retornou texto formatado. Tente novamente.');
}

/**
 * Verifica se o serviço de IA do servidor está ativo e configurado.
 */
export async function verificarStatusIA(): Promise<{ configured: boolean; message: string }> {
  try {
    const res = await fetch('/api/ai/quota-status');
    if (res.ok) {
      const data = await res.json();
      const configured = data?.configured !== false;
      return {
        configured,
        message: configured
          ? 'Inteligência Artificial integrada e ativa no servidor.'
          : 'Variável GEMINI_API_KEY pendente nas configurações do servidor.',
      };
    }
    return {
      configured: false,
      message: 'Não foi possível verificar o status da IA no servidor.',
    };
  } catch {
    return {
      configured: false,
      message: 'Serviço de IA temporariamente indisponível.',
    };
  }
}
