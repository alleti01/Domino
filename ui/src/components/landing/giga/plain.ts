// Plain English for the landing page. The dashboard keeps the exact technical
// names (it is the audit trail); the landing page says what they are.
// Anything not listed falls back to a readable version of its own name.

const TITLES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Explicit shard grants for /i, () => 'Give a service read access to more databases'],
  [/^Content update: rule \w+ for template (\w+)/i, (m) => `Add a new rule to content template ${m[1]}`],
]

const COMPONENTS: Record<string, string> = {
  principal: 'Service account',
  'bundle-builder': 'Build job',
  'bundle.json': 'Generated file',
  'worker-runtime': 'Worker service',
  'worker-runtime.max_entries': 'Worker size limit',
  'worker-runtime.startup_timeout_s': 'Worker start timeout',
  'content-pipeline': 'Content pipeline',
  'rule-validator.validate': 'Rule checker',
  'content-interpreter.load_rules': 'Rule reader',
}

const RELATIONS: Record<string, string> = {
  grants_to: 'gives access to',
  identity_of: 'used by',
  writes: 'writes',
  loaded_by: 'read by',
  configured_with: 'limited by',
  runs: 'runs',
  calls: 'calls',
  checks_against: 'checks against',
}

const SOURCES: Record<string, string> = {
  change_records: 'change log',
  pipeline_repo: 'code repository',
  runtime_config: 'service settings',
  db_catalog: 'database permissions',
  service_catalog: 'service catalog',
}

const MEASURES: Record<string, string> = {
  rows_visible_to_builder: 'number of records the build job reads',
  rules_checked: 'number of rules the checker reviews',
}

const UNITS: Record<string, string> = {
  rows_visible_to_builder: 'records read',
  rules_checked: 'rules checked',
}

/** A short noun for the measure, for tight spaces: "records read". */
export function plainUnit(key: string) {
  const last = key.split('.').pop() ?? key
  return UNITS[last] ?? words(last)
}

const CHECKS: Record<string, string> = {
  builder_completes: 'the build job finishes',
  runtime_starts_with_bundle: 'the worker starts with the new file',
  validator_runs: 'the rule checker runs',
  interpreter_keeps_running: 'the rule reader keeps running',
}

export const RUN_NAME: Record<string, string> = {
  baseline: 'before the change',
  candidate: 'with the change',
  control: 'change undone',
}

const words = (s: string) => s.replace(/[_.:-]+/g, ' ').trim()

export function plainTitle(title: string | null | undefined) {
  if (!title) return 'A proposed change'
  for (const [re, f] of TITLES) {
    const m = title.match(re)
    if (m) return f(m)
  }
  return title
}

/** A component in the dependency path, by its kind and label. */
export function plainComponent(kind: string, label: string) {
  if (kind === 'change') return 'The change'
  if (COMPONENTS[label]) return COMPONENTS[label]
  if (COMPONENTS[kind]) return COMPONENTS[kind]
  const t = label.match(/^template:(\w+)$/)
  if (t) return `Template ${t[1]}`
  return words(label).replace(/^\w/, (c) => c.toUpperCase())
}

export const plainRelation = (r: string) => RELATIONS[r] ?? words(r)
export const plainSource = (s: string) => SOURCES[s] ?? words(s)

/** "meta-store.rows_visible_to_builder" → "records the build job reads". */
export function plainMeasure(key: string) {
  const last = key.split('.').pop() ?? key
  return MEASURES[last] ?? words(last)
}

export const plainCheck = (name: string) => CHECKS[name] ?? words(name)

const FAILURES: Record<string, string> = {
  builder_completes: 'the build job did not finish',
  runtime_starts_with_bundle: 'the worker could not start with the new file',
  validator_runs: 'the rule checker did not run',
  interpreter_keeps_running: 'the rule reader stopped running',
}

/** What it means when a check fails: "the worker could not start with the new file". */
export const plainFailure = (name: string) => FAILURES[name] ?? `the check "${plainCheck(name)}" failed`
export const plainRun = (variant: string) => RUN_NAME[variant] ?? words(variant)

/** The same, starting with a capital letter. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * What a run found, in two plain sentences built from its own numbers, e.g.
 * "With this change, the number of records the build job reads went from 140
 * to 280, past a limit of 200, and the worker could not start with the new
 * file. Undo the change and it works again."
 */
export function plainOutcome(inv: {
  verdict: { verdict: string } | null
  experiments: { variant: string; outcome: string; completed: boolean; assertions: { name: string; passed: boolean }[]; observations: Record<string, unknown> }[]
}, x: { key: string; baseline: unknown; candidate: unknown; limit: { value: number | null } | null } | null): string | null {
  if (!x) return null
  const measure = plainMeasure(x.key)
  const moved = `With this change, the ${measure} went from ${String(x.baseline)} to ${String(x.candidate)}`
  if (inv.verdict?.verdict === 'reproduced_failure') {
    const broke = inv.experiments.find((e) => e.outcome === 'fail')?.assertions.find((a) => !a.passed)?.name
    const lim = x.limit?.value != null ? `, past a limit of ${x.limit.value}` : ''
    return `${moved}${lim}${broke ? `, and ${plainFailure(broke)}` : ''}. Undo the change and it works again.`
  }
  return `${moved}, and every check still passed. No failure under the conditions tested.`
}
