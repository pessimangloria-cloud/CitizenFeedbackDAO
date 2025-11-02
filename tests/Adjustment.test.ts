import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cl, ClarityType, cvToValue } from "@stacks/transactions";

interface Proposal {
  title: string;
  description: string;
  proposer: string;
  startBlock: bigint;
  endBlock: bigint;
  yesVotes: bigint;
  noVotes: bigint;
  totalVotes: bigint;
  executed: boolean;
  categoryFrom: string;
  categoryTo: string;
  amount: bigint;
  threshold: bigint;
  quorum: bigint;
  status: string;
}

interface Result<T> {
  isOk: boolean;
  value: T;
}

class AdjustmentContractMock {
  state: {
    treasuryContract: string | null;
    votingContract: string | null;
    nextProposalId: bigint;
    executionNonce: bigint;
    proposals: Map<bigint, Proposal>;
    allocations: Map<string, bigint>;
    categoryList: Map<bigint, string>;
    categoryCount: bigint;
  } = {
    treasuryContract: null,
    votingContract: null,
    nextProposalId: 0n,
    executionNonce: 0n,
    proposals: new Map(),
    allocations: new Map(),
    categoryList: new Map(),
    categoryCount: 0n,
  };

  blockHeight = 1000n;
  caller = "ST1CALLER";
  contractCaller = "ST1VOTING";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      treasuryContract: null,
      votingContract: null,
      nextProposalId: 0n,
      executionNonce: 0n,
      proposals: new Map(),
      allocations: new Map(),
      categoryList: new Map(),
      categoryCount: 0n,
    };
    this.blockHeight = 1000n;
    this.caller = "ST1CALLER";
    this.contractCaller = "ST1VOTING";
  }

  setTreasury(contract: string): Result<boolean> {
    if (this.caller !== this.contractCaller) return { isOk: false, value: false };
    if (this.state.treasuryContract !== null) return { isOk: false, value: false };
    this.state.treasuryContract = contract;
    return { isOk: true, value: true };
  }

  setVotingContract(contract: string): Result<boolean> {
    if (this.caller !== this.contractCaller) return { isOk: false, value: false };
    if (this.state.votingContract !== null) return { isOk: false, value: false };
    this.state.votingContract = contract;
    return { isOk: true, value: true };
  }

  registerCategory(category: string): Result<boolean> {
    if (this.contractCaller !== this.state.treasuryContract) return { isOk: false, value: false };
    if (category.length === 0 || category.length > 32) return { isOk: false, value: false };
    if (this.state.allocations.has(category)) return { isOk: false, value: false };
    if (this.state.categoryCount >= 20n) return { isOk: false, value: false };
    this.state.allocations.set(category, 0n);
    this.state.categoryList.set(this.state.categoryCount, category);
    this.state.categoryCount += 1n;
    return { isOk: true, value: true };
  }

  createAdjustmentProposal(
    title: string,
    description: string,
    categoryFrom: string,
    categoryTo: string,
    amount: bigint,
    threshold: bigint,
    quorum: bigint,
    duration: bigint
  ): Result<bigint> {
    if (this.contractCaller !== this.state.votingContract) return { isOk: false, value: 0n };
    if (!this.state.allocations.has(categoryFrom) || !this.state.allocations.has(categoryTo))
      return { isOk: false, value: 0n };
    if (categoryFrom === categoryTo) return { isOk: false, value: 0n };
    if (amount < 1000000n) return { isOk: false, value: 0n };
    if (threshold < 50n || threshold > 90n) return { isOk: false, value: 0n };
    if (quorum < 1n || quorum > 100n) return { isOk: false, value: 0n };
    const endBlock = this.blockHeight + (duration > 0n ? duration : 1440n);
    if (endBlock <= this.blockHeight) return { isOk: false, value: 0n };

    const id = this.state.nextProposalId;
    const proposal: Proposal = {
      title,
      description,
      proposer: this.caller,
      startBlock: this.blockHeight,
      endBlock,
      yesVotes: 0n,
      noVotes: 0n,
      totalVotes: 0n,
      executed: false,
      categoryFrom,
      categoryTo,
      amount,
      threshold,
      quorum,
      status: "active",
    };
    this.state.proposals.set(id, proposal);
    this.state.nextProposalId += 1n;
    return { isOk: true, value: id };
  }

  executeAdjustment(proposalId: bigint): Result<boolean> {
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal) return { isOk: false, value: false };
    if (proposal.executed) return { isOk: false, value: false };
    if (this.blockHeight < proposal.endBlock) return { isOk: false, value: false };
    const fromBal = this.state.allocations.get(proposal.categoryFrom) || 0n;
    if (fromBal < proposal.amount) return { isOk: false, value: false };
    if (proposal.amount === 0n) return { isOk: false, value: false };

    const yesPercent = proposal.totalVotes > 0n
      ? (proposal.yesVotes * 100n) / proposal.totalVotes
      : 0n;
    if (yesPercent < proposal.threshold) return { isOk: false, value: false };
    if (proposal.totalVotes < proposal.quorum) return { isOk: false, value: false };

    this.state.allocations.set(proposal.categoryFrom, fromBal - proposal.amount);
    const toBal = this.state.allocations.get(proposal.categoryTo) || 0n;
    this.state.allocations.set(proposal.categoryTo, toBal + proposal.amount);
    this.state.proposals.set(proposalId, { ...proposal, executed: true, status: "executed" });
    this.state.executionNonce += 1n;
    return { isOk: true, value: true };
  }

  recordVote(proposalId: bigint, yesVotes: bigint, noVotes: bigint, totalVotes: bigint): Result<boolean> {
    if (this.contractCaller !== this.state.votingContract) return { isOk: false, value: false };
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal || proposal.executed) return { isOk: false, value: false };
    if (this.blockHeight > proposal.endBlock) return { isOk: false, value: false };
    this.state.proposals.set(proposalId, {
      ...proposal,
      yesVotes: proposal.yesVotes + yesVotes,
      noVotes: proposal.noVotes + noVotes,
      totalVotes: proposal.totalVotes + totalVotes,
    });
    return { isOk: true, value: true };
  }
}

describe("Adjustment.clar", () => {
  let contract: AdjustmentContractMock;

  beforeEach(() => {
    contract = new AdjustmentContractMock();
    contract.reset();
    const deployer = "ST1DEPLOYER";
    contract.caller = deployer;
    contract.contractCaller = deployer;
    contract.setTreasury("ST1TREASURY");
    contract.setVotingContract("ST1VOTING");
    contract.contractCaller = "ST1TREASURY";
    contract.registerCategory("education");
    contract.registerCategory("infrastructure");
    contract.state.allocations.set("education", 100000000n);
    contract.contractCaller = "ST1VOTING";
    contract.caller = "ST1CALLER";
    contract.blockHeight = 1000n;
  });

  it("sets treasury and voting contracts once", () => {
    const mock = new AdjustmentContractMock();
    const deployer = "ST1DEPLOYER";
    mock.caller = deployer;
    mock.contractCaller = deployer;
    expect(mock.setTreasury("ST1TREASURY").isOk).toBe(true);
    expect(mock.setTreasury("ST1OTHER").isOk).toBe(false);
    expect(mock.setVotingContract("ST1VOTING").isOk).toBe(true);
    expect(mock.setVotingContract("ST1OTHER").isOk).toBe(false);
  });

  it("registers categories correctly", () => {
    contract.contractCaller = "ST1TREASURY";
    expect(contract.registerCategory("health").isOk).toBe(true);
    expect(contract.state.allocations.get("health")).toBe(0n);
    expect(contract.registerCategory("health").isOk).toBe(false);
    expect(contract.registerCategory("a".repeat(33)).isOk).toBe(false);
  });

  it("creates valid adjustment proposal", () => {
    contract.caller = "ST1PROPOSER";
    const result = contract.createAdjustmentProposal(
      "Move funds to infra",
      "Need roads",
      "education",
      "infrastructure",
      5000000n,
      60n,
      20n,
      720n
    );
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(0n);
    const proposal = contract.state.proposals.get(0n);
    expect(proposal?.title).toBe("Move funds to infra");
    expect(proposal?.amount).toBe(5000000n);
    expect(proposal?.endBlock).toBe(1720n);
  });

  it("rejects proposal with invalid categories", () => {
    contract.caller = "ST1PROPOSER";
    const result = contract.createAdjustmentProposal(
      "Invalid",
      "test",
      "invalid",
      "infrastructure",
      5000000n,
      60n,
      20n,
      720n
    );
    expect(result.isOk).toBe(false);
  });

  it("rejects proposal with same from/to category", () => {
    contract.caller = "ST1PROPOSER";
    const result = contract.createAdjustmentProposal(
      "Same",
      "test",
      "education",
      "education",
      5000000n,
      60n,
      20n,
      720n
    );
    expect(result.isOk).toBe(false);
  });

  it("rejects proposal with low amount", () => {
    contract.caller = "ST1PROPOSER";
    const result = contract.createAdjustmentProposal(
      "Low",
      "test",
      "education",
      "infrastructure",
      999999n,
      60n,
      20n,
      720n
    );
    expect(result.isOk).toBe(false);
  });

  it("executes proposal after threshold and quorum met", () => {
    contract.caller = "ST1PROPOSER";
    const create = contract.createAdjustmentProposal(
      "Move 10M",
      "Urgent",
      "education",
      "infrastructure",
      10000000n,
      60n,
      25n,
      100n
    );
    const id = create.value;
    contract.recordVote(id, 70n, 30n, 100n);
    contract.blockHeight = 1200n;
    const exec = contract.executeAdjustment(id);
    expect(exec.isOk).toBe(true);
    expect(contract.state.allocations.get("education")).toBe(90000000n);
    expect(contract.state.allocations.get("infrastructure")).toBe(10000000n);
  });

  it("fails execution if threshold not met", () => {
    contract.caller = "ST1PROPOSER";
    const create = contract.createAdjustmentProposal(
      "High threshold",
      "test",
      "education",
      "infrastructure",
      5000000n,
      70n,
      20n,
      100n
    );
    const id = create.value;
    contract.recordVote(id, 60n, 40n, 100n);
    contract.blockHeight = 1200n;
    const exec = contract.executeAdjustment(id);
    expect(exec.isOk).toBe(false);
  });

  it("fails execution if quorum not met", () => {
    contract.caller = "ST1PROPOSER";
    const create = contract.createAdjustmentProposal(
      "High quorum",
      "test",
      "education",
      "infrastructure",
      5000000n,
      60n,
      50n,
      100n
    );
    const id = create.value;
    contract.recordVote(id, 70n, 30n, 40n);
    contract.blockHeight = 1200n;
    const exec = contract.executeAdjustment(id);
    expect(exec.isOk).toBe(false);
  });

  it("prevents double execution", () => {
    contract.caller = "ST1PROPOSER";
    const create = contract.createAdjustmentProposal(
      "Double",
      "test",
      "education",
      "infrastructure",
      5000000n,
      60n,
      20n,
      100n
    );
    const id = create.value;
    contract.recordVote(id, 80n, 20n, 100n);
    contract.blockHeight = 1200n;
    contract.executeAdjustment(id);
    const second = contract.executeAdjustment(id);
    expect(second.isOk).toBe(false);
  });

  it("records votes correctly", () => {
    contract.caller = "ST1PROPOSER";
    const create = contract.createAdjustmentProposal(
      "Vote test",
      "test",
      "education",
      "infrastructure",
      5000000n,
      60n,
      20n,
      100n
    );
    const id = create.value;
    contract.recordVote(id, 40n, 10n, 50n);
    const proposal = contract.state.proposals.get(id);
    expect(proposal?.yesVotes).toBe(40n);
    expect(proposal?.noVotes).toBe(10n);
    expect(proposal?.totalVotes).toBe(50n);
  });

  it("rejects vote after end block", () => {
    contract.caller = "ST1PROPOSER";
    const create = contract.createAdjustmentProposal(
      "Expired",
      "test",
      "education",
      "infrastructure",
      5000000n,
      60n,
      20n,
      10n
    );
    const id = create.value;
    contract.blockHeight = 1200n;
    const vote = contract.recordVote(id, 10n, 0n, 10n);
    expect(vote.isOk).toBe(false);
  });

  it("handles zero transfer rejection", () => {
    contract.caller = "ST1PROPOSER";
    const create = contract.createAdjustmentProposal(
      "Zero",
      "test",
      "education",
      "infrastructure",
      0n,
      60n,
      20n,
      100n
    );
    expect(create.isOk).toBe(false);
  });

  it("initializes multiple categories", () => {
    const mock = new AdjustmentContractMock();
    const deployer = "ST1TREASURY";
    mock.caller = deployer;
    mock.contractCaller = deployer;
    mock.setTreasury("ST1TREASURY");
    mock.registerCategory("roads");
    mock.registerCategory("schools");
    expect(mock.state.categoryCount).toBe(2n);
    expect(mock.state.allocations.get("roads")).toBe(0n);
  });
});