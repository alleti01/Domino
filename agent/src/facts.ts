// One readable fact per evidence row, for the report and the independent reviewer.
// Wide semantic-layer rows (ids, system columns, query text) collapse to what matters.

const NOISE = new Set(["source_system", "source_row_id", "scenario_id", "system_id", "query_text", "title", "file_path"]);
const short = (v: string) => (/^[\w-]+\/[a-z_]+\/.+/.test(v) ? v.split("/").slice(2).join("/") : v);

export function rowFact(values: Record<string, string>): string {
  const v = values;
  if (v.subject && v.key) return `${v.subject}.${v.key} = ${v.value}`;
  if (v.setting_key && v.setting_value !== undefined) return `${short(v.service_id ?? v.setting_id ?? "")}.${v.setting_key} = ${v.setting_value}`.replace(/^\./, "");
  const parts = Object.entries(v)
    .filter(([k, x]) => !NOISE.has(k) && x !== "" && x != null)
    .filter(([k], _i, all) => !(k.endsWith("_id") && all.length > 4 && !["principal_id", "database_id", "service_id", "query_id", "output_artifact_id", "input_artifact_id"].includes(k)))
    .map(([k, x]) => `${k.replace(/_id$/, "")}=${short(String(x))}`);
  const text = parts.join(", ");
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}
