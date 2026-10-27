// The four changes in the hero, written for someone who has never seen the
// system: what the change is, the test Domino writes for it, and what happened.
// Every number comes from the recorded run named on each scenario (samples/runs);
// the wording is plain, the results are not adjusted. If those runs are
// re-recorded, update the numbers here.

export type Arm = 'without' | 'with' | 'reverted'

export interface SandboxRun {
  arm: Arm
  /** A second run of the same arm, to confirm a failure. */
  again?: boolean
  /** One result per check, in the order of `checks`. */
  results: boolean[]
  /** What the run measured, in words. */
  note: string
}

export interface Scenario {
  id: string
  /** The recorded run these facts come from. */
  runId: string
  /** The case in samples/manifest.json, for the repeat count. */
  caseId: string
  kind: string
  system: string
  title: string
  change: string
  file: string
  test: string
  /** The test in a few words, for the hero's Evidence view. */
  testShort: string
  checks: string[]
  /** The path the semantic layer found, from the change to what it reaches. */
  path: string[]
  queries: number
  hypothesis: string
  runs: SandboxRun[]
  measure: { label: string; unit: string; without: number; with: number; limit: number | null; limitLabel?: string }
  review: { text: string; tone: 'ok' | 'warn' }
  result: { failed: boolean; headline: string; why: string; fix: string | null }
  stats: { sandboxRuns: number; modelCalls: number; duration: string }
}

export const ARM_LABEL: Record<Arm, string> = {
  without: 'Without the change',
  with: 'With the change',
  reverted: 'Change rolled back',
}

const DB_CHECKS = ['The config bundle builds', 'The workers start with the bundle']
const RULE_CHECKS = ['The validator accepts the rule', 'The interpreter keeps running']

export const SCENARIOS: Scenario[] = [
  {
    id: 'db-a',
    runId: 'run-20261027010609-8df9af',
    caseId: 'w-k7m2',
    kind: 'Database migration',
    system: 'System A',
    title: 'Production database migration: widen a service’s read access',
    change:
      'Migration 0042 gives the bundle reader service explicit read access to the shard databases, so query limits and audit logging apply to it.',
    file: 'db/migrations/0042_reader_shard_grants.sql',
    test: 'Build the config bundle and start the workers three ways: without the migration, with it, and with it rolled back.',
    testShort: 'Build the config bundle, then start the workers',
    checks: DB_CHECKS,
    path: ['Migration 0042', 'Shard database r0', 'Bundle reader service', 'Bundle builder', 'bundle.json', 'Workers (limit 200)'],
    queries: 8,
    hypothesis: 'The grant lets the builder read the shard’s rows as well, doubling the bundle past the workers’ 200-entry limit.',
    runs: [
      { arm: 'without', results: [true, true], note: '140 entries, workers started' },
      { arm: 'with', results: [true, false], note: '280 entries, workers exited with code 2' },
      { arm: 'with', again: true, results: [true, false], note: 'same again: 280 entries, workers exited' },
      { arm: 'reverted', results: [true, true], note: '140 entries, workers started' },
    ],
    measure: { label: 'Entries in the config bundle', unit: 'entries', without: 140, with: 280, limit: 200, limitLabel: 'the workers hold at most 200' },
    review: { text: 'Reviewer model sent the explanation back once, then approved it', tone: 'ok' },
    result: {
      failed: true,
      headline: 'Breaks: the workers fail to start',
      why: 'The migration doubles what the bundle builder can read, from 140 to 280 entries. The workers hold at most 200, so they exit at startup. Rolling the migration back fixes it.',
      fix: 'Keep the bundle under 200 entries: limit the builder’s query to its own database, or raise the workers’ limit to at least 280.',
    },
    stats: { sandboxRuns: 4, modelCalls: 21, duration: '3 min 32 s' },
  },
  {
    id: 'db-b',
    runId: 'run-20261027010156-ce7ee8',
    caseId: 'w-h9c5',
    kind: 'Database migration',
    system: 'System B',
    title: 'The same migration on a smaller system',
    change: 'The same migration 0042, on a system whose databases hold fewer columns.',
    file: 'db/migrations/0042_reader_shard_grants.sql',
    test: 'Build the config bundle and start the workers three ways: without the migration, with it, and with it rolled back.',
    testShort: 'Build the config bundle, then start the workers',
    checks: DB_CHECKS,
    path: ['Migration 0042', 'Shard database r0', 'Bundle reader service', 'Bundle builder', 'bundle.json', 'Workers (limit 200)'],
    queries: 8,
    hypothesis: 'The wider grant could let the builder read more than it needs and push the bundle toward the workers’ limit.',
    runs: [
      { arm: 'without', results: [true, true], note: '99 entries, workers started' },
      { arm: 'with', results: [true, true], note: '198 entries, workers started' },
      { arm: 'reverted', results: [true, true], note: '99 entries, workers started' },
    ],
    measure: { label: 'Entries in the config bundle', unit: 'entries', without: 99, with: 198, limit: 200, limitLabel: 'the workers hold at most 200' },
    review: { text: 'Reviewer model flagged parts of the explanation after two rounds', tone: 'warn' },
    result: {
      failed: false,
      headline: 'No failure seen, but it is close',
      why: 'The migration doubles the bundle here too, from 99 to 198 entries, and the workers still start: 198 is under their 200-entry limit. Every check passed in every run.',
      fix: null,
    },
    stats: { sandboxRuns: 3, modelCalls: 24, duration: '4 min 13 s' },
  },
  {
    id: 'rule-a',
    runId: 'run-20261027005836-40ae23',
    caseId: 'w-g4k8',
    kind: 'Content rollout',
    system: 'System A',
    title: 'Push a new detection rule to every agent',
    change: 'Adds detection rule 0291 for template T4. It passed validation in CI.',
    file: 'content/rules/T4/rule-0291.json',
    test: 'Validate the rule, ship it, and feed 50 events through the content interpreter: without the rule, with it, and with it removed.',
    testShort: 'Ship the rule, then feed 50 events to the interpreter',
    checks: RULE_CHECKS,
    path: ['Rule 0291', 'Template T4', 'Content pipeline', 'Rule validator', 'Content interpreter'],
    queries: 7,
    hypothesis: 'The rule reads field 13, but the interpreter only supplies 12 inputs for template T4, so it fails as soon as the rule runs.',
    runs: [
      { arm: 'without', results: [true, true], note: '50 of 50 events processed' },
      { arm: 'with', results: [true, false], note: 'validator passed; interpreter crashed (exit 3), 0 events processed' },
      { arm: 'with', again: true, results: [true, false], note: 'same again: interpreter crashed, 0 events' },
      { arm: 'reverted', results: [true, true], note: '50 of 50 events processed' },
    ],
    measure: { label: 'Events processed', unit: 'events', without: 50, with: 0, limit: null },
    review: { text: 'Reviewer model sent the explanation back once, then approved it', tone: 'ok' },
    result: {
      failed: true,
      headline: 'Breaks: the interpreter crashes',
      why: 'The validator accepts the rule, but the rule reads field 13 and the interpreter only supplies 12. The interpreter crashes and processes none of the 50 events. Removing the rule fixes it.',
      fix: 'Remove field 13 from the rule’s criteria so it only reads fields the interpreter supplies.',
    },
    stats: { sandboxRuns: 4, modelCalls: 19, duration: '3 min 20 s' },
  },
  {
    id: 'rule-b',
    runId: 'run-20261027012001-90f3f5',
    caseId: 'w-r1z5',
    kind: 'Content rollout',
    system: 'System B',
    title: 'Push a new detection rule for a different template',
    change: 'Adds detection rule 0291 for template T7. It passed validation in CI.',
    file: 'content/rules/T7/rule-0291.json',
    test: 'Validate the rule, ship it, and feed 50 events through the content interpreter, without the rule and with it.',
    testShort: 'Ship the rule, then feed 50 events to the interpreter',
    checks: RULE_CHECKS,
    path: ['Rule 0291', 'Template T7', 'Content pipeline', 'Rule validator', 'Content interpreter'],
    queries: 5,
    hypothesis: 'The rule sets only 2 of the template’s 21 fields; the validator or the interpreter might reject a partial rule.',
    runs: [
      { arm: 'without', results: [true, true], note: '50 of 50 events processed' },
      { arm: 'with', results: [true, true], note: 'rule accepted, 50 of 50 events processed' },
    ],
    measure: { label: 'Events processed', unit: 'events', without: 50, with: 50, limit: null },
    review: { text: 'Reviewer model approved the explanation', tone: 'ok' },
    result: {
      failed: false,
      headline: 'No failure seen',
      why: 'The validator accepts the rule and the interpreter processes all 50 events, with the rule and without it.',
      fix: null,
    },
    stats: { sandboxRuns: 2, modelCalls: 16, duration: '1 min 45 s' },
  },
]
