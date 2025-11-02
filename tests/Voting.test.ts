import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PROPOSAL_DESCRIPTION = 101;
const ERR_INVALID_VOTING_POWER = 102;
const ERR_INVALID_END_BLOCK = 103;
const ERR_INVALID_THRESHOLD = 104;
const ERR_PROPOSAL_ALREADY_EXISTS = 105;
const ERR_PROPOSAL_NOT_FOUND = 106;
const ERR_VOTING_CLOSED = 107;
const ERR_ALREADY_VOTED = 108;
const ERR_INVALID_TOKEN_BALANCE = 109;
const ERR_INVALID_QUADRATIC_FACTOR = 110;
const ERR_MAX_PROPOSALS_EXCEEDED = 111;
const ERR_INVALID_UPDATE_PARAM = 112;
const ERR_INVALID_PROPOSAL_TYPE = 113;
const ERR_INVALID_START_BLOCK = 114;
const ERR_INVALID_MIN_STAKE = 115;
const ERR_INVALID_MAX_STAKE = 116;
const ERR_PROPOSAL_UPDATE_NOT_ALLOWED = 117;
const ERR_AUTHORITY_NOT_VERIFIED = 118;
const ERR_INVALID_DELEGATE = 119;
const ERR_INVALID_STATUS = 120;

interface Proposal {
  description: string;
  yesVotes: number;
  noVotes: number;
  endBlock: number;
  startBlock: number;
  creator: string;
  proposalType: string;
  minStake: number;
  maxStake: number;
  status: boolean;
  threshold: number;
  totalVotes: number;
}

interface ProposalUpdate {
  updateDescription: string;
  updateEndBlock: number;
  updateThreshold: number;
  updateTimestamp: number;
  updater: string;
}

interface VoterRecord {
  voted: boolean;
  power: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class VotingContractMock {
  state: {
    nextProposalId: number;
    maxProposals: number;
    proposalFee: number;
    authorityContract: string | null;
    governanceTokenContract: string;
    quadraticFactor: number;
    minVotingThreshold: number;
    proposals: Map<number, Proposal>;
    proposalUpdates: Map<number, ProposalUpdate>;
    proposalsByDescription: Map<string, number>;
    voterRecords: Map<string, VoterRecord>;
    delegates: Map<string, string>;
  } = {
    nextProposalId: 0,
    maxProposals: 1000,
    proposalFee: 1000,
    authorityContract: null,
    governanceTokenContract: "SP000000000000000000002Q6VF78",
    quadraticFactor: 2,
    minVotingThreshold: 50,
    proposals: new Map(),
    proposalUpdates: new Map(),
    proposalsByDescription: new Map(),
    voterRecords: new Map(),
    delegates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  tokenBalances: Map<string, number> = new Map([["ST1TEST", 100]]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProposalId: 0,
      maxProposals: 1000,
      proposalFee: 1000,
      authorityContract: null,
      governanceTokenContract: "SP000000000000000000002Q6VF78",
      quadraticFactor: 2,
      minVotingThreshold: 50,
      proposals: new Map(),
      proposalUpdates: new Map(),
      proposalsByDescription: new Map(),
      voterRecords: new Map(),
      delegates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.tokenBalances = new Map([["ST1TEST", 100]]);
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setProposalFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.proposalFee = newFee;
    return { ok: true, value: true };
  }

  setQuadraticFactor(newFactor: number): Result<boolean> {
    if (newFactor <= 0 || newFactor > 10) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.quadraticFactor = newFactor;
    return { ok: true, value: true };
  }

  setMinVotingThreshold(newThresh: number): Result<boolean> {
    if (newThresh <= 0 || newThresh > 100) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.minVotingThreshold = newThresh;
    return { ok: true, value: true };
  }

  setDelegate(delegate: string): Result<boolean> {
    if (delegate === this.caller) return { ok: false, value: false };
    this.state.delegates.set(this.caller, delegate);
    return { ok: true, value: true };
  }

  createProposal(
    description: string,
    endBlock: number,
    proposalType: string,
    minStake: number,
    maxStake: number,
    threshold: number
  ): Result<number> {
    if (this.state.nextProposalId >= this.state.maxProposals) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if (!description || description.length > 1000) return { ok: false, value: ERR_INVALID_PROPOSAL_DESCRIPTION };
    if (endBlock <= this.blockHeight) return { ok: false, value: ERR_INVALID_END_BLOCK };
    if (!["fund", "policy", "governance"].includes(proposalType)) return { ok: false, value: ERR_INVALID_PROPOSAL_TYPE };
    if (minStake <= 0) return { ok: false, value: ERR_INVALID_MIN_STAKE };
    if (maxStake <= 0) return { ok: false, value: ERR_INVALID_MAX_STAKE };
    if (threshold <= 0 || threshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    if (this.state.proposalsByDescription.has(description)) return { ok: false, value: ERR_PROPOSAL_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.proposalFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextProposalId;
    const proposal: Proposal = {
      description,
      yesVotes: 0,
      noVotes: 0,
      endBlock,
      startBlock: this.blockHeight,
      creator: this.caller,
      proposalType,
      minStake,
      maxStake,
      status: true,
      threshold,
      totalVotes: 0,
    };
    this.state.proposals.set(id, proposal);
    this.state.proposalsByDescription.set(description, id);
    this.state.nextProposalId++;
    return { ok: true, value: id };
  }

  getProposal(id: number): Proposal | null {
    return this.state.proposals.get(id) || null;
  }

  vote(proposalId: number, voteYes: boolean): Result<boolean> {
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal) return { ok: false, value: false };
    if (!proposal.status) return { ok: false, value: false };
    if (this.blockHeight > proposal.endBlock || this.blockHeight < proposal.startBlock) return { ok: false, value: false };
    const delegate = this.state.delegates.get(this.caller);
    const effectiveVoter = delegate || this.caller;
    const balance = this.tokenBalances.get(effectiveVoter) || 0;
    if (balance === 0) return { ok: false, value: false };
    const power = Math.pow(balance, this.state.quadraticFactor);
    if (power <= 0) return { ok: false, value: false };
    const key = `${proposalId}-${effectiveVoter}`;
    if (this.state.voterRecords.has(key)) return { ok: false, value: false };

    this.state.voterRecords.set(key, { voted: true, power });

    const updated: Proposal = {
      ...proposal,
      totalVotes: proposal.totalVotes + power,
    };
    if (voteYes) {
      updated.yesVotes += power;
    } else {
      updated.noVotes += power;
    }
    this.state.proposals.set(proposalId, updated);
    return { ok: true, value: true };
  }

  updateProposal(id: number, updateDescription: string, updateEndBlock: number, updateThreshold: number): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: false };
    if (proposal.creator !== this.caller) return { ok: false, value: false };
    if (!proposal.status) return { ok: false, value: false };
    if (!updateDescription || updateDescription.length > 1000) return { ok: false, value: false };
    if (updateEndBlock <= this.blockHeight) return { ok: false, value: false };
    if (updateThreshold <= 0 || updateThreshold > 100) return { ok: false, value: false };
    if (this.state.proposalsByDescription.has(updateDescription) && this.state.proposalsByDescription.get(updateDescription) !== id) {
      return { ok: false, value: false };
    }

    const updated: Proposal = {
      ...proposal,
      description: updateDescription,
      endBlock: updateEndBlock,
      threshold: updateThreshold,
    };
    this.state.proposals.set(id, updated);
    this.state.proposalsByDescription.delete(proposal.description);
    this.state.proposalsByDescription.set(updateDescription, id);
    this.state.proposalUpdates.set(id, {
      updateDescription,
      updateEndBlock,
      updateThreshold,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  closeProposal(id: number): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: false };
    if (proposal.creator !== this.caller) return { ok: false, value: false };
    if (this.blockHeight <= proposal.endBlock) return { ok: false, value: false };
    if (!proposal.status) return { ok: false, value: false };
    const passed = proposal.totalVotes >= this.state.minVotingThreshold && (proposal.yesVotes * 100) >= (proposal.totalVotes * proposal.threshold);
    const updated: Proposal = { ...proposal, status: false };
    this.state.proposals.set(id, updated);
    return { ok: true, value: passed };
  }

  getProposalCount(): Result<number> {
    return { ok: true, value: this.state.nextProposalId };
  }

  checkProposalExistence(description: string): Result<boolean> {
    return { ok: true, value: this.state.proposalsByDescription.has(description) };
  }
}

describe("VotingContract", () => {
  let contract: VotingContractMock;

  beforeEach(() => {
    contract = new VotingContractMock();
    contract.reset();
  });

  it("creates a proposal successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createProposal(
      "Proposal Alpha",
      100,
      "fund",
      50,
      1000,
      60
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const proposal = contract.getProposal(0);
    expect(proposal?.description).toBe("Proposal Alpha");
    expect(proposal?.endBlock).toBe(100);
    expect(proposal?.proposalType).toBe("fund");
    expect(proposal?.minStake).toBe(50);
    expect(proposal?.maxStake).toBe(1000);
    expect(proposal?.threshold).toBe(60);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate proposal descriptions", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Proposal Alpha",
      100,
      "fund",
      50,
      1000,
      60
    );
    const result = contract.createProposal(
      "Proposal Alpha",
      200,
      "policy",
      100,
      2000,
      70
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROPOSAL_ALREADY_EXISTS);
  });

  it("rejects proposal creation without authority contract", () => {
    const result = contract.createProposal(
      "NoAuth Proposal",
      100,
      "fund",
      50,
      1000,
      60
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid end block", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createProposal(
      "Invalid End",
      0,
      "fund",
      50,
      1000,
      60
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_END_BLOCK);
  });

  it("rejects invalid proposal type", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createProposal(
      "Invalid Type",
      100,
      "invalid",
      50,
      1000,
      60
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_TYPE);
  });

  it("votes successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Vote Proposal",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.blockHeight = 50;
    const result = contract.vote(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.yesVotes).toBe(10000);
    expect(proposal?.totalVotes).toBe(10000);
  });

  it("rejects vote on closed voting", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Closed Vote",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.blockHeight = 101;
    const result = contract.vote(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects double vote", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Double Vote",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.blockHeight = 50;
    contract.vote(0, true);
    const result = contract.vote(0, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates a proposal successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Old Proposal",
      100,
      "fund",
      50,
      1000,
      60
    );
    const result = contract.updateProposal(0, "New Proposal", 200, 70);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.description).toBe("New Proposal");
    expect(proposal?.endBlock).toBe(200);
    expect(proposal?.threshold).toBe(70);
    const update = contract.state.proposalUpdates.get(0);
    expect(update?.updateDescription).toBe("New Proposal");
    expect(update?.updateEndBlock).toBe(200);
    expect(update?.updateThreshold).toBe(70);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent proposal", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateProposal(99, "New Proposal", 200, 70);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Test Proposal",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateProposal(0, "New Proposal", 200, 70);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("closes a proposal successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Close Proposal",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.blockHeight = 50;
    contract.vote(0, true);
    contract.blockHeight = 101;
    const result = contract.closeProposal(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.status).toBe(false);
  });

  it("rejects close by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Test Close",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.blockHeight = 101;
    contract.caller = "ST3FAKE";
    const result = contract.closeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets proposal fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setProposalFee(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.proposalFee).toBe(2000);
    contract.createProposal(
      "Fee Test",
      100,
      "fund",
      50,
      1000,
      60
    );
    expect(contract.stxTransfers).toEqual([{ amount: 2000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects proposal fee change without authority", () => {
    const result = contract.setProposalFee(2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct proposal count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Proposal1",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.createProposal(
      "Proposal2",
      200,
      "policy",
      100,
      2000,
      70
    );
    const result = contract.getProposalCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks proposal existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Exist Proposal",
      100,
      "fund",
      50,
      1000,
      60
    );
    const result = contract.checkProposalExistence("Exist Proposal");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkProposalExistence("NonExistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses proposal parameters with Clarity types", () => {
    const desc = stringUtf8CV("Test Proposal");
    const end = uintCV(100);
    const thresh = uintCV(60);
    expect(desc.value).toBe("Test Proposal");
    expect(end.value).toEqual(BigInt(100));
    expect(thresh.value).toEqual(BigInt(60));
  });

  it("rejects proposal creation with empty description", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createProposal(
      "",
      100,
      "fund",
      50,
      1000,
      60
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_DESCRIPTION);
  });

  it("rejects proposal creation with max proposals exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxProposals = 1;
    contract.createProposal(
      "Proposal1",
      100,
      "fund",
      50,
      1000,
      60
    );
    const result = contract.createProposal(
      "Proposal2",
      200,
      "policy",
      100,
      2000,
      70
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PROPOSALS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets quadratic factor successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setQuadraticFactor(3);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.quadraticFactor).toBe(3);
  });

  it("rejects invalid quadratic factor", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setQuadraticFactor(11);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets min voting threshold successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMinVotingThreshold(70);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.minVotingThreshold).toBe(70);
  });

  it("rejects invalid min voting threshold", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMinVotingThreshold(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets delegate successfully", () => {
    const result = contract.setDelegate("ST2DELEGATE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.delegates.get("ST1TEST")).toBe("ST2DELEGATE");
  });

  it("rejects self-delegate", () => {
    const result = contract.setDelegate("ST1TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("uses delegate for voting", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createProposal(
      "Delegate Vote",
      100,
      "fund",
      50,
      1000,
      60
    );
    contract.tokenBalances.set("ST2DELEGATE", 200);
    contract.setDelegate("ST2DELEGATE");
    contract.blockHeight = 50;
    const result = contract.vote(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.yesVotes).toBe(40000);
    expect(proposal?.totalVotes).toBe(40000);
  });
});