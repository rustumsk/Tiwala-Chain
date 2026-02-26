// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./IERC20.sol";
/**
 * @title TiwalaEscrow
 * @notice Blockchain-based escrow system for TiwalaChain freelancing platform
 * @dev Manages job creation, fund locking, and payment release between employers and freelancers
 */

contract TiwalaEscrow {

    // ================================
    // STATE VARIABLES
    // ================================

    address public moderator;
    address public usdtToken;
    uint256 public jobCounter;

    // ================================
    // ENUMS
    // ================================

    enum JobStatus {
        Created,    // 0 - Job created, waiting for funding
        Funded,     // 1 - Funds locked in escrow
        InProgress, // 2 - Freelancer is working
        Submitted,  // 3 - Freelancer submitted work
        Disputed,   // 4 - Dispute raised
        Completed,  // 5 - Payment released to freelancer
        Refunded    // 6 - Payment refunded to employer
    }

    // ================================
    // STRUCTS
    // ================================

    struct EscrowJob {
        address employer;
        address freelancer;
        uint256 amount;
        JobStatus status;
        bytes32 contractHash;
        uint256 createdAt;
    }

    // ================================
    // MAPPINGS
    // ================================

    mapping(uint256 => EscrowJob) public jobs;
    mapping(address => uint256[]) public employerJobs;
    mapping(address => uint256[]) public freelancerJobs;

    // ================================
    // EVENTS
    // ================================

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed freelancer,
        uint256 amount,
        bytes32 contractHash
    );

    event JobFunded(
        uint256 indexed jobId,
        address indexed employer,
        uint256 amount
    );

    event WorkSubmitted(
        uint256 indexed jobId,
        address indexed freelancer
    );

    event PaymentReleased(
        uint256 indexed jobId,
        address indexed freelancer,
        uint256 amount
    );

    event PaymentRefunded(
        uint256 indexed jobId,
        address indexed employer,
        uint256 amount
    );

    event DisputeRaised(
        uint256 indexed jobId,
        address indexed raisedBy
    );

    event DisputeResolved(
        uint256 indexed jobId,
        address indexed resolvedBy,
        bool releasedToFreelancer
    );

    // ================================
    // MODIFIERS
    // ================================

    modifier onlyModerator() {
        require(msg.sender == moderator, "TiwalaEscrow: Only moderator can call this");
        _;
    }

    modifier onlyEmployer(uint256 jobId) {
        require(msg.sender == jobs[jobId].employer, "TiwalaEscrow: Only employer can call this");
        _;
    }

    modifier onlyFreelancer(uint256 jobId) {
        require(msg.sender == jobs[jobId].freelancer, "TiwalaEscrow: Only freelancer can call this");
        _;
    }

    modifier jobExists(uint256 jobId) {
        require(jobId > 0 && jobId <= jobCounter, "TiwalaEscrow: Job does not exist");
        _;
    }

    // ================================
    // CONSTRUCTOR
    // ================================

    /**
     * @notice Deploy the escrow contract
     * @param _usdtToken Address of the USDT token contract
     * @dev For Remix testing use the MockUSDT contract address
     *      For Sepolia testnet use the official Sepolia USDT address
     */
    constructor(address _usdtToken) {
        moderator = msg.sender;
        usdtToken = _usdtToken;
    }

    // ================================
    // MAIN FUNCTIONS
    // ================================

    /**
     * @notice Create a new escrow job
     * @param freelancer Address of the freelancer
     * @param amount Amount of USDT to be locked
     * @param contractHash SHA-256 hash of the contract document
     */
    function createJob(
        address freelancer,
        uint256 amount,
        bytes32 contractHash
    ) external returns (uint256) {
        require(freelancer != address(0), "TiwalaEscrow: Invalid freelancer address");
        require(freelancer != msg.sender, "TiwalaEscrow: Employer cannot be freelancer");
        require(amount > 0, "TiwalaEscrow: Amount must be greater than zero");

        jobCounter++;
        uint256 jobId = jobCounter;

        jobs[jobId] = EscrowJob({
            employer: msg.sender,
            freelancer: freelancer,
            amount: amount,
            status: JobStatus.Created,
            contractHash: contractHash,
            createdAt: block.timestamp
        });

        employerJobs[msg.sender].push(jobId);
        freelancerJobs[freelancer].push(jobId);

        emit JobCreated(jobId, msg.sender, freelancer, amount, contractHash);

        return jobId;
    }

    /**
     * @notice Employer deposits USDT into escrow
     * @param jobId The ID of the job to fund
     * @dev Employer must approve this contract to spend USDT before calling this
     */
    function depositFunds(uint256 jobId) external jobExists(jobId) onlyEmployer(jobId) {
        EscrowJob storage job = jobs[jobId];

        require(job.status == JobStatus.Created, "TiwalaEscrow: Job must be in Created status");

        uint256 amount = job.amount;

        require(
            IERC20(usdtToken).balanceOf(msg.sender) >= amount,
            "TiwalaEscrow: Insufficient USDT balance"
        );

        bool success = IERC20(usdtToken).transferFrom(msg.sender, address(this), amount);
        require(success, "TiwalaEscrow: USDT transfer failed");

        job.status = JobStatus.Funded;

        emit JobFunded(jobId, msg.sender, amount);
    }

    /**
     * @notice Employer confirms work has started
     * @param jobId The ID of the job
     */
    function startWork(uint256 jobId) external jobExists(jobId) onlyEmployer(jobId) {
        EscrowJob storage job = jobs[jobId];
        require(job.status == JobStatus.Funded, "TiwalaEscrow: Job must be funded first");

        job.status = JobStatus.InProgress;
    }

    /**
     * @notice Freelancer submits completed work
     * @param jobId The ID of the job
     */
    function submitWork(uint256 jobId) external jobExists(jobId) onlyFreelancer(jobId) {
        EscrowJob storage job = jobs[jobId];
        require(job.status == JobStatus.InProgress, "TiwalaEscrow: Job must be in progress");

        job.status = JobStatus.Submitted;

        emit WorkSubmitted(jobId, msg.sender);
    }

    /**
     * @notice Employer releases payment to freelancer
     * @param jobId The ID of the job
     */
    function releasePayment(uint256 jobId) external jobExists(jobId) onlyEmployer(jobId) {
        EscrowJob storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "TiwalaEscrow: Work must be submitted first");

        uint256 amount = job.amount;
        job.status = JobStatus.Completed;

        bool success = IERC20(usdtToken).transfer(job.freelancer, amount);
        require(success, "TiwalaEscrow: Payment transfer failed");

        emit PaymentReleased(jobId, job.freelancer, amount);
    }

    /**
     * @notice Raise a dispute on a job
     * @param jobId The ID of the job
     * @dev Both employer and freelancer can raise a dispute
     */
    function raiseDispute(uint256 jobId) external jobExists(jobId) {
        EscrowJob storage job = jobs[jobId];

        require(
            msg.sender == job.employer || msg.sender == job.freelancer,
            "TiwalaEscrow: Only job parties can raise dispute"
        );
        require(
            job.status == JobStatus.Submitted || job.status == JobStatus.InProgress,
            "TiwalaEscrow: Cannot dispute at this stage"
        );

        job.status = JobStatus.Disputed;

        emit DisputeRaised(jobId, msg.sender);
    }

    /**
     * @notice Moderator resolves a dispute
     * @param jobId The ID of the job
     * @param releaseToFreelancer If true, pays freelancer. If false, refunds employer.
     */
    function resolveDispute(
        uint256 jobId,
        bool releaseToFreelancer
    ) external jobExists(jobId) onlyModerator {
        EscrowJob storage job = jobs[jobId];
        require(job.status == JobStatus.Disputed, "TiwalaEscrow: Job must be in disputed status");

        uint256 amount = job.amount;

        if (releaseToFreelancer) {
            job.status = JobStatus.Completed;
            bool success = IERC20(usdtToken).transfer(job.freelancer, amount);
            require(success, "TiwalaEscrow: Payment transfer failed");
            emit PaymentReleased(jobId, job.freelancer, amount);
        } else {
            job.status = JobStatus.Refunded;
            bool success = IERC20(usdtToken).transfer(job.employer, amount);
            require(success, "TiwalaEscrow: Refund transfer failed");
            emit PaymentRefunded(jobId, job.employer, amount);
        }

        emit DisputeResolved(jobId, msg.sender, releaseToFreelancer);
    }

    /**
     * @notice Employer refunds job before work starts
     * @param jobId The ID of the job
     */
    function refund(uint256 jobId) external jobExists(jobId) onlyEmployer(jobId) {
        EscrowJob storage job = jobs[jobId];
        require(job.status == JobStatus.Funded, "TiwalaEscrow: Can only refund funded jobs before work starts");

        uint256 amount = job.amount;
        job.status = JobStatus.Refunded;

        bool success = IERC20(usdtToken).transfer(job.employer, amount);
        require(success, "TiwalaEscrow: Refund transfer failed");

        emit PaymentRefunded(jobId, job.employer, amount);
    }

    // ================================
    // VIEW FUNCTIONS
    // ================================

    function getEmployerJobs(address employer) external view returns (uint256[] memory) {
        return employerJobs[employer];
    }

    function getFreelancerJobs(address freelancer) external view returns (uint256[] memory) {
        return freelancerJobs[freelancer];
    }

    function getJob(uint256 jobId) external view jobExists(jobId) returns (EscrowJob memory) {
        return jobs[jobId];
    }

    function getJobStatusString(uint256 jobId) external view jobExists(jobId) returns (string memory) {
        JobStatus status = jobs[jobId].status;
        if (status == JobStatus.Created) return "Created";
        if (status == JobStatus.Funded) return "Funded";
        if (status == JobStatus.InProgress) return "InProgress";
        if (status == JobStatus.Submitted) return "Submitted";
        if (status == JobStatus.Disputed) return "Disputed";
        if (status == JobStatus.Completed) return "Completed";
        if (status == JobStatus.Refunded) return "Refunded";
        return "Unknown";
    }

    function transferModerator(address newModerator) external onlyModerator {
        require(newModerator != address(0), "TiwalaEscrow: Invalid address");
        moderator = newModerator;
    }
}