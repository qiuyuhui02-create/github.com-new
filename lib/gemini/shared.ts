// Public UI contract only. Credentials and budget implementation live in server files.
export const GEMINI_MODEL = "gemini-2.5-flash-lite";
export const revisionDirections = [
  "日系自然对白",
  "人物情感",
  "叙事节奏",
  "导演视角",
] as const;
export type RevisionDirection = (typeof revisionDirections)[number];
export type GeminiProposal = {
  script: string;
  reasons: string[];
  model: typeof GEMINI_MODEL;
  at: string;
  source: string;
  direction: RevisionDirection;
  instructions: string;
};
export function validProposal(x: unknown): x is GeminiProposal {
  if (!x || typeof x !== "object") return false;
  const p = x as GeminiProposal;
  return (
    p.model === GEMINI_MODEL &&
    typeof p.script === "string" &&
    !!p.script.trim() &&
    p.script.length <= 16000 &&
    typeof p.source === "string" &&
    p.source.length <= 6000 &&
    revisionDirections.includes(p.direction) &&
    typeof p.instructions === "string" &&
    p.instructions.length <= 1000 &&
    typeof p.at === "string" &&
    Number.isFinite(Date.parse(p.at)) &&
    Array.isArray(p.reasons) &&
    p.reasons.length > 0 &&
    p.reasons.length <= 8 &&
    p.reasons.every(
      (r) => typeof r === "string" && !!r.trim() && r.length <= 1000,
    )
  );
}
