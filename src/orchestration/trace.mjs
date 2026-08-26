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
    company: ['shadowbroker'],
    person: ['shadowbroker'],
    phone: []
  },
  deep: {
    email: ['holehe', 'shadowbroker', 'spiderfoot'],
    username: ['sherlock', 'shadowbroker', 'spiderfoot'],
    domain: ['shadowbroker', 'spiderfoot'],
    ip: ['shadowbroker'],
    company: ['shadowbroker'],
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
    scheduled.push(engine);
  }
  return { profile, targetType, scheduled, skipped };
}
