const profiles = Object.freeze({
  quick: {
    email: ['holehe', 'shadowbroker'],
    username: ['sherlock', 'shadowbroker'],
    domain: ['shadowbroker'],
    ip: ['shadowbroker'],
    company: ['shadowbroker'],
    person: ['shadowbroker'],
    phone: []
  },
  standard: {
    email: ['holehe', 'shadowbroker'],
    username: ['sherlock', 'shadowbroker'],
    domain: ['shadowbroker'],
    ip: ['shadowbroker'],
    company: ['shadowbroker', 'sec'],
    person: ['shadowbroker'],
    phone: []
  },
  deep: {
    email: ['holehe', 'shadowbroker', 'spiderfoot'],
    username: ['sherlock', 'shadowbroker', 'spiderfoot'],
    domain: ['shadowbroker', 'spiderfoot'],
    ip: ['shadowbroker'],
    company: ['shadowbroker', 'sec'],
    person: ['shadowbroker'],
    phone: []
  }
});

export const traceProfiles = Object.freeze(Object.keys(profiles));

export function buildTracePlan({ profile = 'standard', targetType, engines }) {
  if (!profiles[profile]) throw new Error('Unknown TRACE profile');
  const requested = profiles[profile][targetType];
  if (!requested) throw new Error(`TRACE does not support ${targetType}`);

  const scheduled = [];
  const skipped = [];
  const live = (process.env.ENGINE_MODE || 'mock') === 'live';
  for (const engine of requested) {
    const meta = engines[engine];
    if (!meta) {
      skipped.push({ engine, reason: 'engine_not_registered' });
      continue;
    }
    if (!meta.targetTypes.includes(targetType)) {
      skipped.push({ engine, reason: 'target_not_supported' });
      continue;
    }
    if (meta.orchestrated === false) {
      skipped.push({ engine, reason: meta.companion ? 'companion_adapter_not_implemented' : 'orchestration_disabled' });
      continue;
    }
    if (live && meta.optional && meta.configured === false) {
      skipped.push({ engine, reason: 'provider_disabled_or_unconfigured' });
      continue;
    }
    const missing = (meta.requiresEnv || []).filter((name) => !String(process.env[name] || '').trim());
    if (missing.length && live) {
      skipped.push({ engine, reason: 'configuration_missing', missing });
      continue;
    }
    scheduled.push(engine);
  }
  return { profile, targetType, scheduled, skipped };
}
