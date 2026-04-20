using System.Text.RegularExpressions;

public static partial class HashNormalizer
{
    public static string? NormalizeSha256Hash(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.StartsWith("0x", StringComparison.Ordinal))
        {
            trimmed = trimmed[2..];
        }

        return Sha256HashRegex().IsMatch(trimmed) ? trimmed : null;
    }

    [GeneratedRegex("^[a-f0-9]{64}$")]
    private static partial Regex Sha256HashRegex();
}
