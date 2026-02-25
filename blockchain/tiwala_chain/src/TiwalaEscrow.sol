// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TiwalaEscrow {
    
    address public moderator;
    address public usdtToken;
    uint256 public jobCounter;

    enum JobStatus {
        Created,
        Funded,
        InProgress,
        Submitted,
        Disputed,
        Completed,
        Refunded
    }

    struct EscrowJob {
        address employer;
        address freelancer;
        uint256 amount;
        JobStatus status;
        bytes32 contractHash;
    }

    mapping(uint256 => EscrowJob) public jobs;
    mapping(address => uint256[]) public employerJobs;
    mapping(address => uint256[]) public freelancerJobs;

    constructor(address _usdtToken) {
        moderator = msg.sender;
        usdtToken = _usdtToken;
    }
}