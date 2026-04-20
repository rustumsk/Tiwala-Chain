public static class PostingValidator
{
    public static string? ValidateInput(
        string? title,
        string? category,
        string? experienceLevel,
        string? jobType,
        string? budgetType,
        decimal? budgetMin,
        decimal? budgetMax,
        string? visibility,
        List<string>? skills,
        DateTime? proposalDeadline)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length is < 5 or > 200)
        {
            return "Title must be between 5 and 200 characters.";
        }

        var normalizedCategory = category?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedCategory) || !PostingConstants.ValidCategories.Contains(normalizedCategory))
        {
            return "Invalid category.";
        }

        var normalizedExperience = NormalizeOrDefault(experienceLevel, "intermediate");
        if (!PostingConstants.ValidExperienceLevels.Contains(normalizedExperience))
        {
            return "Invalid experience level.";
        }

        var normalizedJobType = NormalizeOrDefault(jobType, "fixed_price");
        if (!PostingConstants.ValidJobTypes.Contains(normalizedJobType))
        {
            return "Invalid job type.";
        }

        var normalizedBudgetType = NormalizeOrDefault(budgetType, "fixed");
        if (!PostingConstants.ValidBudgetTypes.Contains(normalizedBudgetType))
        {
            return "Invalid budget type.";
        }

        if (normalizedBudgetType == "fixed" && (!budgetMin.HasValue || budgetMin.Value <= 0))
        {
            return "Fixed budget postings require a positive budget amount.";
        }

        if (normalizedBudgetType == "range")
        {
            if (!budgetMin.HasValue || !budgetMax.HasValue || budgetMin.Value <= 0 || budgetMax.Value <= 0 || budgetMin >= budgetMax)
            {
                return "Budget range postings require a valid minimum and maximum budget.";
            }
        }

        var normalizedVisibility = NormalizeOrDefault(visibility, "public");
        if (!PostingConstants.ValidVisibility.Contains(normalizedVisibility))
        {
            return "Invalid visibility.";
        }

        var normalizedSkills = PostingTextNormalizer.NormalizeSkills(skills);
        if (normalizedSkills.Count > 10)
        {
            return "A posting can have at most 10 skills.";
        }

        if (proposalDeadline.HasValue && proposalDeadline.Value.ToUniversalTime() <= DateTime.UtcNow)
        {
            return "Proposal deadline must be in the future.";
        }

        return null;
    }

    public static string NormalizeOrDefault(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim().ToLowerInvariant();
}
