// Deterministic number check for explanations: every quantity a sentence states must come from
// the evidence, or follow from two evidence numbers by +, −, ×, ÷. Models are bad at this; code is not.

const ID_LIKE = /[A-Za-z_][A-Za-z0-9_]*[-_]\d+|\b\d+[A-Za-z]+\w*|\b0\d+\b/g; // rule-0291, ag-0010, 5s, 0042
const NUMBER = /\b\d+(?:\.\d+)?\b/g;

export function quantities(text: string): number[] {
  const cleaned = text.replace(ID_LIKE, " ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  return [...cleaned.matchAll(NUMBER)].map((m) => Number(m[0])).filter((n) => Number.isFinite(n) && n >= 10);
}

/** Numbers in `claim` that neither appear in the evidence nor follow from two evidence numbers. */
export function unsupportedNumbers(claim: string, evidenceText: string): number[] {
  const known = [...new Set(quantities(evidenceText).concat([...evidenceText.matchAll(NUMBER)].map((m) => Number(m[0]))))];
  const knownSet = new Set(known);
  const derivable = (n: number) => {
    for (const a of known)
      for (const b of known) {
        if (a + b === n || Math.abs(a - b) === n || a * b === n || (b !== 0 && a / b === n)) return true;
      }
    return false;
  };
  return [...new Set(quantities(claim))].filter((n) => !knownSet.has(n) && !derivable(n));
}
