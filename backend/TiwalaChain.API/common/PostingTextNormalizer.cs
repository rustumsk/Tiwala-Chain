public static class PostingTextNormalizer
{
    public static List<string> NormalizeSkills(List<string>? skills) =>
        (skills ?? [])
            .Select(skill => skill.Trim())
            .Where(skill => !string.IsNullOrWhiteSpace(skill))
            .Select(skill => skill.Length > 30 ? skill[..30] : skill)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(skill => skill.ToLowerInvariant())
            .ToList();

    public static List<string> ParseCommaList(string? raw) =>
        string.IsNullOrWhiteSpace(raw)
            ? []
            : raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(item => item.ToLowerInvariant())
                .Distinct()
                .ToList();
}
