public static class ProposalValidator
{
    public static string? ValidateInput(string? coverLetter, decimal proposedAmount, string? estimatedTimeline)
    {
        if (proposedAmount <= 0)
        {
            return "Proposed amount must be greater than 0.";
        }

        if (!string.IsNullOrWhiteSpace(coverLetter) && coverLetter.Trim().Length > 4000)
        {
            return "Cover letter must be 4000 characters or fewer.";
        }

        if (!string.IsNullOrWhiteSpace(estimatedTimeline) && estimatedTimeline.Trim().Length > 100)
        {
            return "Estimated timeline must be 100 characters or fewer.";
        }

        return null;
    }
}
