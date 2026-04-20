using System.Text.Json;

public static class JsonFieldSerializer
{
    public static string? SerializeStringList(List<string>? values)
    {
        var normalized = (values ?? [])
            .Select(v => v.Trim())
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();

        return normalized.Count == 0 ? null : JsonSerializer.Serialize(normalized);
    }

    public static string? SerializeStringMap(Dictionary<string, string>? values)
    {
        if (values is null || values.Count == 0)
        {
            return null;
        }

        var normalized = values
            .Select(pair => new KeyValuePair<string, string>(pair.Key.Trim(), pair.Value.Trim()))
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Key) && !string.IsNullOrWhiteSpace(pair.Value))
            .Take(10)
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);

        return normalized.Count == 0 ? null : JsonSerializer.Serialize(normalized);
    }

    public static List<string> DeserializeStringList(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(raw) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static Dictionary<string, string> DeserializeStringMap(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(raw) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
