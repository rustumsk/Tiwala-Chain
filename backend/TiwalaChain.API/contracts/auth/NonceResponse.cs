public sealed record NonceResponse(string Message, string Nonce, DateTime ExpiresAtUtc, string Domain, string Uri, int ChainId);
