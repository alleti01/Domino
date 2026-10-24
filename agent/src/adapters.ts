// The two seams to Anish's side. Fakes implement them today; a CLI adapter over his
// real worlds + Zetaris replaces them without touching the agent.

import type {
  ChangeRequest,
  DependencyPath,
  ExperimentCatalog,
  ExperimentRequest,
  ExperimentResult,
  QueryResult,
} from "../../contracts/agent/types.js";

export interface EvidenceAdapter {
  /** One read-only SQL statement against the semantic layer. */
  query(sql: string): Promise<QueryResult>;
  /** Cross-source chain around an entity (table, principal, service, artifact...). */
  dependencyPath(changeId: string, entity: string): Promise<DependencyPath>;
  /** Names of the views the agent may query, with their columns. */
  describe(): Promise<Array<{ view: string; source: string; columns: string[] }>>;
}

export interface WorldsAdapter {
  getChange(changeId: string): Promise<ChangeRequest>;
  catalog(worldId: string): Promise<ExperimentCatalog>;
  run(request: ExperimentRequest): Promise<ExperimentResult>;
}
