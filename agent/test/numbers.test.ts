import { describe, expect, it } from "vitest";
import { quantities, unsupportedNumbers } from "../src/numbers.js";

describe("deterministic number check", () => {
  const evidence = "replicas=30 db_pool_size=20 max_connections=500 connections_requested=600 refused=100 rule-0291 ag-0010";
  it("ignores ids and units", () => {
    expect(quantities("rule-0291 and ag-0010 in change 0042 with a 5s timeout and 30 replicas")).toEqual([30]);
  });
  it("accepts numbers from the evidence and simple arithmetic on them", () => {
    expect(unsupportedNumbers("30 replicas × 20 = 600 connections, 100 over the 500 limit", evidence)).toEqual([]);
  });
  it("flags a number that is not in the evidence", () => {
    expect(unsupportedNumbers("30 replicas × 20 = 600 connections, over the 750 limit", evidence)).toEqual([750]);
  });
});
