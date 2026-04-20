using System.Collections.Frozen;

public static class DisputeReasonCodes
{
    public static readonly FrozenSet<string> Valid = new[]
    {
        "scope_mismatch",
        "quality",
        "late_or_no_delivery",
        "communication",
        "other",
    }.ToFrozenSet(StringComparer.OrdinalIgnoreCase);

    public static string Label(string code) =>
        code.ToLowerInvariant() switch
        {
            "scope_mismatch" => "Scope or requirements mismatch",
            "quality" => "Quality of work",
            "late_or_no_delivery" => "Late or missing delivery",
            "communication" => "Communication or collaboration",
            "other" => "Other",
            _ => code,
        };
}
