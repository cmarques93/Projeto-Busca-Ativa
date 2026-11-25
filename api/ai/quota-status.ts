export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const configured = Boolean(process.env.GEMINI_API_KEY);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return res.status(200).json({
    date: today,
    configured,
    requestsToday: 0,
    maxFreeRequestsPerDay: 50,
    isBlockedUntilNextDay: false,
    blockedReason: null,
    blockedAt: null,
    resetsAt: '00:00 (Horário de Brasília)',
    source: 'vercel_serverless',
  });
}
