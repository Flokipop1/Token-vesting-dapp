// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Vesting is Ownable {
    using SafeERC20 for IERC20;

    struct Beneficiary {
        uint256 total;
        uint256 released;
    }

    IERC20 public immutable token;
    uint256 public immutable start;
    uint256 public immutable cliff;
    uint256 public immutable duration;
    uint256 public totalAllocated;

    mapping(address => Beneficiary) public beneficiaries;

    event BeneficiaryAdded(address indexed account, uint256 amount);
    event TokensReleased(address indexed account, uint256 amount);

    constructor(
        address token_,
        uint256 start_,
        uint256 cliffDuration_,
        uint256 duration_
    ) Ownable(msg.sender) {
        require(token_ != address(0), "Token zero");
        require(duration_ > 0, "Duration zero");
        require(cliffDuration_ <= duration_, "Cliff > duration");

        token = IERC20(token_);
        start = start_;
        cliff = start_ + cliffDuration_;
        duration = duration_;
    }

    // ---------------- ADMIN ----------------

    function addBeneficiary(address account, uint256 amount)
        internal
        onlyOwner
    {
        require(block.timestamp < start, "Vesting already started");
        require(account != address(0), "Zero address");
        require(amount > 0, "Zero amount");
        require(beneficiaries[account].total == 0, "Already added");

        beneficiaries[account] = Beneficiary({
            total: amount,
            released: 0
        });

        totalAllocated += amount;

        emit BeneficiaryAdded(account, amount);
    }

    // Batch add beneficiaries
    function addBeneficiaries(address[] calldata _beneficiaries, uint256[] calldata _amounts) 
    
    external onlyOwner {
        require(_beneficiaries.length == _amounts.length, "Array length mismatch");
        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            addBeneficiary(_beneficiaries[i], _amounts[i]);
        }
    }

    function withdrawUnused(address to) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        uint256 locked = totalAllocated;
        require(balance > locked, "No excess");

        uint256 excess = balance - locked;
        token.safeTransfer(to, excess);
    }

    // ---------------- CLAIM ----------------

    function claim() external {
        Beneficiary storage b = beneficiaries[msg.sender];
        require(b.total > 0, "Not a beneficiary");

        uint256 vested = vestedAmount(msg.sender);
        uint256 releasable = vested - b.released;
        require(releasable > 0, "Nothing to claim");

        b.released += releasable;
        totalAllocated -= releasable;

        token.safeTransfer(msg.sender, releasable);

        emit TokensReleased(msg.sender, releasable);
    }

    function vestedAmount(address account) public view returns (uint256) {
        Beneficiary memory b = beneficiaries[account];

        if (block.timestamp < cliff) {
            return 0;
        }

        if (block.timestamp >= start + duration) {
            return b.total;
        }

        uint256 timePassed = block.timestamp - start;
        return (b.total * timePassed) / duration;
    }
}