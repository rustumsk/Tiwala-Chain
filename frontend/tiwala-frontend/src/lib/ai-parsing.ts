export type AIResponse = Record<string, unknown>;

export type ParsedClause = {
  title: string;
  isFair: boolean;
  confidence: number | null;
  suggestion?: string;
  issue?: string;
  suggestedRewrite?: string;
  suggestionSource?: string;
};

/**
 * Normalise a fairness score from whichever range the AI service returns
 * (0-1 float or 0-100 integer) into 0-100.
 */
export function extractScore(payload: AIResponse): number | null {
  const direct =
    payload.fairness_score ?? payload.score ?? payload.overall_score;
  if (typeof direct === "number") {
    const normalised = direct <= 1 ? direct * 100 : direct;
    return Math.round(Math.max(0, Math.min(100, normalised)));
  }
  return null;
}

/**
 * Pull the clause-level results array out of whatever key the AI service used,
 * normalise each entry into a consistent shape.
 */
export function extractClauses(payload: AIResponse): ParsedClause[] {
  const raw = payload.clauses ?? payload.analysis ?? payload.results;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): ParsedClause | null => {
      if (typeof item !== "object" || !item) return null;
      const r = item as Record<string, unknown>;

      const title =
        (typeof r.clause === "string" && r.clause) ||
        (typeof r.text === "string" && r.text) ||
        (typeof r.title === "string" && r.title) ||
        "Clause";

      const label =
        (typeof r.label === "string" && r.label.toLowerCase()) ||
        (typeof r.verdict === "string" && r.verdict.toLowerCase()) ||
        "";
      const isFair =
        label === "fair" ||
        label === "safe" ||
        r.is_fair === true ||
        r.isFair === true;

      const rawConf = r.confidence;
      let confidence: number | null = null;
      if (typeof rawConf === "number") {
        const n = rawConf <= 1 ? rawConf * 100 : rawConf;
        confidence = Math.round(Math.max(0, Math.min(100, n)));
      }

      const suggestion =
        (typeof r.suggestion === "string" && r.suggestion) ||
        (typeof r.recommendation === "string" && r.recommendation) ||
        undefined;

      const issue =
        (typeof r.issue === "string" && r.issue) || undefined;

      const suggestedRewrite =
        (typeof r.suggested_rewrite === "string" && r.suggested_rewrite) ||
        undefined;

      const suggestionSource =
        (typeof r.suggestion_source === "string" && r.suggestion_source) ||
        undefined;

      return {
        title,
        isFair,
        confidence,
        suggestion,
        issue,
        suggestedRewrite,
        suggestionSource,
      };
    })
    .filter((c): c is ParsedClause => c !== null);
}
