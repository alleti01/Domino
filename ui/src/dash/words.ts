// Plain words for the semantic layer's schema: node kinds and relation types.
// These are the layer's fixed vocabulary, not names from any one system.

const KIND: Record<string, string> = {
  change: 'Change',
  principal: 'Account',
  service: 'Service',
  interface: 'Component',
  artifact: 'File',
  setting: 'Setting',
  limit: 'Limit',
  table: 'Table',
  database: 'Database',
  query: 'Query',
}

export function kindWord(kind: string): string {
  return KIND[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, ' ')
}

const RELATION: Record<string, string> = {
  grants_to: 'grants access to',
  grants_on: 'grants access on',
  identity_of: 'is the identity of',
  loaded_by: 'is loaded by',
  configured_with: 'is limited by',
  instance_of: 'is an instance of',
  checks_against: 'checks against',
  adds_rule: 'adds',
  ships_to: 'ships to',
}

/** "loaded_by" → "is loaded by"; unknown relations read with spaces. */
export function relationWords(relation: string): string {
  return RELATION[relation] ?? relation.replace(/_/g, ' ')
}

const SOURCE: Record<string, string> = {
  change_records: 'Change records',
  db_catalog: 'Database catalog',
  pipeline_repo: 'Code repository',
  runtime_config: 'Service settings',
  service_catalog: 'Service catalog',
  telemetry: 'Telemetry',
  semantic_layer: 'Semantic layer',
  inventory_registry: 'Inventory registry',
}

/** "db_catalog" → "Database catalog"; unknown sources read with spaces. */
export function sourceWords(source: string): string {
  const s = source.replace(/^zetaris[:/.]/i, '')
  return SOURCE[s] ?? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ')
}
