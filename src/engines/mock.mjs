export async function mockSearch({ engine, targetType, targetValue }) {
  const ts = new Date().toISOString();
  if (engine === 'sherlock') return [
    { kind: 'account_candidate', value: targetValue, url: `https://example.invalid/${encodeURIComponent(targetValue)}`, confidence: 0.25, raw: { demo: true, ts } }
  ];
  if (engine === 'holehe') return [
    { kind: 'service_presence_candidate', value: targetValue, url: '', confidence: 0.25, raw: { demo: true, ts } }
  ];
  return [{ kind: `${targetType}_observation`, value: targetValue, url: '', confidence: 0.2, raw: { demo: true, ts } }];
}
