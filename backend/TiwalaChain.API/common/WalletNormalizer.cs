using System.Text.RegularExpressions;

public static partial class WalletNormalizer
{
    public static string? NormalizeWalletAddress(string? walletAddress)
    {
        if (string.IsNullOrWhiteSpace(walletAddress))
        {
            return null;
        }

        var normalized = walletAddress.Trim().ToLowerInvariant();
        return WalletAddressRegex().IsMatch(normalized) ? normalized : null;
    }

    [GeneratedRegex("^0x[a-f0-9]{40}$")]
    private static partial Regex WalletAddressRegex();
}
