using Microsoft.EntityFrameworkCore;

public sealed class PostingCommandService
{
    private readonly AppDbContext _dbContext;
    private readonly PostingMapper _postingMapper;

    public PostingCommandService(AppDbContext dbContext, PostingMapper postingMapper)
    {
        _dbContext = dbContext;
        _postingMapper = postingMapper;
    }

    public async Task<PostingServiceResult<PostingResponse>> CreateAsync(
        User user,
        CreatePostingRequest request,
        CancellationToken cancellationToken)
    {
        if (!user.IsApproved)
        {
            return PostingServiceResult<PostingResponse>.Forbidden("Your account is pending admin approval.");
        }

        if (!PostingPolicy.CanCreate(user.Role))
        {
            return PostingServiceResult<PostingResponse>.Forbidden();
        }

        var validation = PostingValidator.ValidateInput(
            request.Title,
            request.Category,
            request.ExperienceLevel,
            request.JobType,
            request.BudgetType,
            request.BudgetMin,
            request.BudgetMax,
            request.Visibility,
            request.Skills,
            request.ProposalDeadline);
        if (validation is not null)
        {
            return PostingServiceResult<PostingResponse>.BadRequest(validation);
        }

        var posting = new JobPosting
        {
            EmployerWallet = user.WalletAddress,
            Title = request.Title.Trim(),
            Summary = TextNormalizer.TrimToNull(request.Summary),
            Description = TextNormalizer.TrimToNull(request.Description),
            Category = request.Category.Trim().ToLowerInvariant(),
            Skills = PostingTextNormalizer.NormalizeSkills(request.Skills),
            JobType = PostingValidator.NormalizeOrDefault(request.JobType, "fixed_price"),
            BudgetType = PostingValidator.NormalizeOrDefault(request.BudgetType, "fixed"),
            BudgetMin = request.BudgetMin,
            BudgetMax = request.BudgetType?.Trim().ToLowerInvariant() == "range"
                ? request.BudgetMax
                : null,
            Timeline = TextNormalizer.TrimToNull(request.Timeline),
            ExperienceLevel = PostingValidator.NormalizeOrDefault(request.ExperienceLevel, "intermediate"),
            Visibility = PostingValidator.NormalizeOrDefault(request.Visibility, "public"),
            ProposalDeadline = request.ProposalDeadline?.ToUniversalTime(),
            BriefAttachmentKey = TextNormalizer.TrimToNull(request.BriefAttachmentKey),
            ScreeningQuestionsJson = JsonFieldSerializer.SerializeStringList(request.ScreeningQuestions),
            Status = PostingStatus.Draft,
        };

        _dbContext.JobPostings.Add(posting);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var response = await _postingMapper.ToPostingResponseAsync(posting, cancellationToken);
        return PostingServiceResult<PostingResponse>.Success(response);
    }

    public async Task<PostingServiceResult<PostingResponse>> UpdateAsync(
        User user,
        int id,
        UpdatePostingRequest request,
        CancellationToken cancellationToken)
    {
        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return PostingServiceResult<PostingResponse>.NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (!PostingPolicy.CanManage(user, posting))
        {
            return PostingServiceResult<PostingResponse>.Forbidden();
        }

        if (posting.Status is PostingStatus.Filled or PostingStatus.Expired)
        {
            return PostingServiceResult<PostingResponse>.BadRequest("This posting can no longer be edited.");
        }

        var nextTitle = request.Title ?? posting.Title;
        var nextCategory = request.Category ?? posting.Category;
        var nextExperience = request.ExperienceLevel ?? posting.ExperienceLevel;
        var nextJobType = request.JobType ?? posting.JobType;
        var nextBudgetType = request.BudgetType ?? posting.BudgetType;
        var nextBudgetMin = request.BudgetMin ?? posting.BudgetMin;
        var nextBudgetMax = request.BudgetMax ?? posting.BudgetMax;
        var nextVisibility = request.Visibility ?? posting.Visibility;
        var nextSkills = request.Skills ?? posting.Skills;
        var nextDeadline = request.ProposalDeadline ?? posting.ProposalDeadline;

        var validation = PostingValidator.ValidateInput(
            nextTitle,
            nextCategory,
            nextExperience,
            nextJobType,
            nextBudgetType,
            nextBudgetMin,
            nextBudgetMax,
            nextVisibility,
            nextSkills,
            nextDeadline);
        if (validation is not null)
        {
            return PostingServiceResult<PostingResponse>.BadRequest(validation);
        }

        posting.Title = nextTitle.Trim();
        posting.Summary = request.Title is null && request.Summary is null
            ? posting.Summary
            : TextNormalizer.TrimToNull(request.Summary) ?? posting.Summary;
        if (request.Summary is not null)
        {
            posting.Summary = TextNormalizer.TrimToNull(request.Summary);
        }
        if (request.Description is not null)
        {
            posting.Description = TextNormalizer.TrimToNull(request.Description);
        }

        posting.Category = nextCategory.Trim().ToLowerInvariant();
        posting.Skills = PostingTextNormalizer.NormalizeSkills(nextSkills);
        posting.JobType = PostingValidator.NormalizeOrDefault(nextJobType, posting.JobType);
        posting.BudgetType = PostingValidator.NormalizeOrDefault(nextBudgetType, posting.BudgetType);
        posting.BudgetMin = nextBudgetMin;
        posting.BudgetMax = posting.BudgetType == "range" ? nextBudgetMax : null;
        if (request.Timeline is not null)
        {
            posting.Timeline = TextNormalizer.TrimToNull(request.Timeline);
        }
        posting.ExperienceLevel = PostingValidator.NormalizeOrDefault(nextExperience, posting.ExperienceLevel);
        posting.Visibility = PostingValidator.NormalizeOrDefault(nextVisibility, posting.Visibility);
        posting.ProposalDeadline = nextDeadline?.ToUniversalTime();
        if (request.BriefAttachmentKey is not null)
        {
            posting.BriefAttachmentKey = TextNormalizer.TrimToNull(request.BriefAttachmentKey);
        }
        if (request.ScreeningQuestions is not null)
        {
            posting.ScreeningQuestionsJson = JsonFieldSerializer.SerializeStringList(request.ScreeningQuestions);
        }
        posting.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        var response = await _postingMapper.ToPostingResponseAsync(posting, cancellationToken);
        return PostingServiceResult<PostingResponse>.Success(response);
    }

    public async Task<PostingServiceResult<bool>> DeleteAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return PostingServiceResult<bool>.NotFound("Posting not found.");
        }

        if (!PostingPolicy.CanManage(user, posting))
        {
            return PostingServiceResult<bool>.Forbidden();
        }

        if (posting.Status != PostingStatus.Draft)
        {
            return PostingServiceResult<bool>.BadRequest("Only draft postings can be deleted.");
        }

        var hasProposals = await _dbContext.Proposals.AnyAsync(p => p.PostingId == id, cancellationToken);
        if (hasProposals)
        {
            return PostingServiceResult<bool>.BadRequest("Postings with proposals cannot be deleted.");
        }

        _dbContext.JobPostings.Remove(posting);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return PostingServiceResult<bool>.Success(true);
    }

    private async Task ApplyLazyExpiryAsync(JobPosting posting, CancellationToken cancellationToken)
    {
        if (posting.Status == PostingStatus.Published &&
            posting.ProposalDeadline.HasValue &&
            posting.ProposalDeadline.Value <= DateTime.UtcNow)
        {
            posting.Status = PostingStatus.Expired;
            posting.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
