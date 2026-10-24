// Investigation state: hypotheses, evidence seen and experiments run. Phase 3 backs this
// with the Meterless World Model engine; the interface stays the same.

import type { ExperimentResult, QueryResult } from "../../contracts/agent/types.js";

export type HypothesisStatus = "open" | "supported" | "refuted" | "untested";

export interface Hypothesis {
  hypothesis_id: string;
  claim: string;
  mechanism: string;
  evidence_for: string[];
  evidence_against: string[];
  falsified_by: string;
  confidence: number;
  status: HypothesisStatus;
}

export class InvestigationState {
  readonly hypotheses = new Map<string, Hypothesis>();
  readonly experiments: ExperimentResult[] = [];
  /** Every row_id the agent has actually retrieved; citations must come from here. */
  readonly seenRows = new Map<string, { source: string; query_id: string }>();
  private nextId = 1;

  recordQuery(result: QueryResult): void {
    for (const row of result.rows) this.seenRows.set(row.row_id, { source: row.source, query_id: result.query_id });
  }

  addHypothesis(h: Omit<Hypothesis, "hypothesis_id" | "status">): Hypothesis {
    const hypothesis: Hypothesis = { ...h, hypothesis_id: `h${this.nextId++}`, status: "open" };
    this.hypotheses.set(hypothesis.hypothesis_id, hypothesis);
    return hypothesis;
  }

  updateHypothesis(id: string, patch: Partial<Omit<Hypothesis, "hypothesis_id">>): Hypothesis {
    const current = this.hypotheses.get(id);
    if (!current) throw new Error(`Unknown hypothesis ${id}`);
    const next = { ...current, ...patch };
    this.hypotheses.set(id, next);
    return next;
  }

  recordExperiment(result: ExperimentResult): void {
    this.experiments.push(result);
  }

  /** Refs the agent may cite: retrieved rows and run experiments. */
  isKnownRef(ref: string): boolean {
    return this.seenRows.has(ref) || this.experiments.some((x) => x.experiment_id === ref);
  }
}
