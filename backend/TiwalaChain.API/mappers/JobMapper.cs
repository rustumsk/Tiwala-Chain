public static class JobMapper
{
    public static JobResponse ToResponse(Job job)
    {
        return new JobResponse(
            job.Id,
            job.EmployerWallet,
            job.FreelancerWallet,
            job.Title,
            job.Description,
            job.Status.ToString(),
            job.AmountUsdt,
            job.ContractKey,
            job.ContractHash,
            job.CreatedAt,
            job.UpdatedAt,
            job.PostingId,
            job.ProposalId
        );
    }

    public static JobDisputeResponse ToDisputeResponse(JobDispute dispute)
    {
        return new JobDisputeResponse(
            dispute.ContractHash,
            dispute.OnChainJobId,
            dispute.RaisedByWallet,
            dispute.ReasonCode,
            DisputeReasonCodes.Label(dispute.ReasonCode),
            dispute.Details,
            dispute.CreatedAt);
    }
}
