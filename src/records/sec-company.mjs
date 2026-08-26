const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function searchSecCompanies(company) {
  const userAgent = String(process.env.SEC_USER_AGENT || '').trim();
  if (!userAgent) throw new Error('SEC_USER_AGENT is required for the SEC RECORDS provider');
  const query = normalizeName(company);
  if (!query) throw new Error('Company is required');

  const response = await fetch(TICKERS_URL, {
    headers: {
      'user-agent': userAgent,
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(Number(process.env.RECORDS_TIMEOUT_MS || 15000))
  });
  if (!response.ok) throw new Error(`SEC company directory request failed (${response.status})`);
  const data = await response.json();
  const rows = Object.values(data || {});

  const ranked = rows.map((row) => {
    const title = String(row.title || '').trim();
    const ticker = String(row.ticker || '').trim().toUpperCase();
    const normalized = normalizeName(title);
    let score = 0;
    if (normalized === query || ticker.toLowerCase() === query) score = 1;
    else if (normalized.startsWith(query)) score = 0.9;
    else if (normalized.includes(query)) score = 0.75;
    return { row, title, ticker, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 25);

  return ranked.map(({ row, title, ticker, score }) => {
    const cik = String(row.cik_str || '').padStart(10, '0');
    const url = `https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(cik)}`;
    return {
      kind: 'record:sec_company',
      value: `${title}${ticker ? ` (${ticker})` : ''} · CIK ${cik}`,
      url,
      provider: 'sec',
      entity: { type: 'company', value: title, label: ticker },
      confidence: {
        overall: Math.min(0.98, score),
        source: 0.98,
        match: score,
        correlation: 0.5,
        freshness: 0.85
      },
      verificationStatus: score >= 0.9 ? 'corroborated' : 'observed',
      source: {
        provider: 'sec',
        type: 'government:company_directory',
        url: TICKERS_URL,
        query: { company }
      },
      raw: { cik, ticker, title, directory: TICKERS_URL }
    };
  });
}
