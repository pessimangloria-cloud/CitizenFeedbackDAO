import { describe, it, expect, beforeEach } from "vitest";
import {
  uintCV,
  stringAsciiCV,
  stringUtf8CV,
  someCV,
  noneCV,
  tupleCV,
  listCV,
  contractPrincipalCV,
} from "@stacks/transactions";

const ERR_UNAUTHORIZED = 100;
const ERR_INSUFFICIENT_BALANCE = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_INVALID_CATEGORY = 103;
const ERR_CATEGORY_ALREADY_EXISTS = 108;
const ERR_ADJUSTMENT_NOT_AUTHORIZED = 106;
const ERR_ZERO_ALLOCATION = 107;

interface TreasuryState {
  treasuryNonce: bigint;
  totalAllocated: bigint;
  adjustmentContract: string | null;
  categoryAllocations: Map<string, bigint>;
  allocationHistory: Map<bigint, any>;
  categoryMetadata: Map<string, any>;
}

class TreasuryMock {
  private state: TreasuryState = {
    treasuryNonce: 0n,
    totalAllocated: 0n,
    adjustmentContract: null,
    categoryAllocations: new Map(),
    allocationHistory: new Map(),
    categoryMetadata: new Map(),
  };
  private stxBalance: bigint = 100_000_000_000n;
  public caller: string = "ST1TEST";
  public contractOwner: string = "ST1TEST";

  reset() {
    this.state = {
      treasuryNonce: 0n,
      totalAllocated: 0n,
      adjustmentContract: null,
      categoryAllocations: new Map(),
      allocationHistory: new Map(),
      categoryMetadata: new Map(),
    };
    this.stxBalance = 100_000_000_000n;
    this.caller = "ST1TEST";
    this.contractOwner = "ST1TEST";
  }

  get balance() {
    return this.stxBalance;
  }

  setCaller(caller: string) {
    this.caller = caller;
  }

  setContractOwner(owner: string) {
    this.contractOwner = owner;
  }

  private assertAuthorized(): boolean {
    return this.state.adjustmentContract === this.caller;
  }

  private validateCategory(category: string): boolean {
    return category.length > 0 && category.length <= 32;
  }

  private recordHistory(category: string, amount: bigint, action: string): bigint {
    const id = this.state.treasuryNonce;
    this.state.allocationHistory.set(id, {
      category,
      amount,
      timestamp: 100n,
      executor: this.caller,
      action,
    });
    this.state.treasuryNonce += 1n;
    return id;
  }

  depositFunds(amount: bigint): { ok: boolean; value?: boolean; error?: number } {
    if (amount <= 0n) return { ok: false, error: ERR_INVALID_AMOUNT };
    this.stxBalance += amount;
    return { ok: true, value: true };
  }

  initializeCategory(
    category: string,
    initialAmount: bigint,
    description: string
  ): { ok: boolean; value?: bigint; error?: number } {
    if (!this.validateCategory(category)) return { ok: false, error: ERR_INVALID_CATEGORY };
    if (this.state.categoryAllocations.has(category)) return { ok: false, error: ERR_CATEGORY_ALREADY_EXISTS };
    if (initialAmount <= 0n) return { ok: false, error: ERR_ZERO_ALLOCATION };

    this.state.categoryAllocations.set(category, initialAmount);
    this.state.categoryMetadata.set(category, {
      "created-at": 100n,
      creator: this.caller,
      description,
      active: true,
    });
    this.state.totalAllocated += initialAmount;
    this.recordHistory(category, initialAmount, "initialize");
    return { ok: true, value: this.state.treasuryNonce - 1n };
  }

  adjustAllocation(category: string, newAmount: bigint): { ok: boolean; value?: bigint; error?: number } {
    if (!this.assertAuthorized()) return { ok: false, error: ERR_ADJUSTMENT_NOT_AUTHORIZED };
    if (!this.validateCategory(category)) return { ok: false, error: ERR_INVALID_CATEGORY };
    if (newAmount <= 0n) return { ok: false, error: ERR_ZERO_ALLOCATION };

    const current = this.state.categoryAllocations.get(category) ?? 0n;
    const diff = newAmount > current ? newAmount - current : current - newAmount;
    const newTotal = newAmount > current ? this.state.totalAllocated + diff : this.state.totalAllocated - diff;

    if (newTotal > this.stxBalance) return { ok: false, error: ERR_INSUFFICIENT_BALANCE };

    this.state.categoryAllocations.set(category, newAmount);
    this.state.totalAllocated = newTotal;
    this.recordHistory(category, newAmount, "adjust");
    return { ok: true, value: this.state.treasuryNonce - 1n };
  }

  setAdjustmentContract(contract: string): { ok: boolean; value?: boolean; error?: number } {
    if (this.state.adjustmentContract !== null) return { ok: false, error: ERR_UNAUTHORIZED };
    this.state.adjustmentContract = contract;
    return { ok: true, value: true };
  }

  deactivateCategory(category: string): { ok: boolean; value?: bigint; error?: number } {
    if (!this.assertAuthorized()) return { ok: false, error: ERR_ADJUSTMENT_NOT_AUTHORIZED };
    if (!this.validateCategory(category)) return { ok: false, error: ERR_INVALID_CATEGORY };
    const current = this.state.categoryAllocations.get(category) ?? 0n;
    if (current === 0n) return { ok: false, error: ERR_ZERO_ALLOCATION };

    const meta = this.state.categoryMetadata.get(category);
    if (meta) {
      this.state.categoryMetadata.set(category, { ...meta, active: false });
    }
    this.recordHistory(category, current, "deactivate");
    return { ok: true, value: this.state.treasuryNonce - 1n };
  }

  emergencyWithdraw(amount: bigint): { ok: boolean; value?: boolean; error?: number } {
    if (this.caller !== this.contractOwner) return { ok: false, error: ERR_UNAUTHORIZED };
    if (this.stxBalance < amount) return { ok: false, error: ERR_INSUFFICIENT_BALANCE };
    this.stxBalance -= amount;
    return { ok: true, value: true };
  }

  getTreasuryBalance(): bigint {
    return this.stxBalance;
  }

  getCategoryAllocation(category: string): bigint | null {
    return this.state.categoryAllocations.get(category) ?? null;
  }

  getTotalAllocated(): bigint {
    return this.state.totalAllocated;
  }

  getAdjustmentContract(): string | null {
    return this.state.adjustmentContract;
  }

  getCategoryMetadata(category: string): any | null {
    return this.state.categoryMetadata.get(category) ?? null;
  }

  getAllocationHistoryEntry(id: bigint): any | null {
    return this.state.allocationHistory.get(id) ?? null;
  }
}

describe("Treasury.clar", () => {
  let mock: TreasuryMock;

  beforeEach(() => {
    mock = new TreasuryMock();
    mock.reset();
  });

  it("deposits funds successfully", () => {
    const result = mock.depositFunds(5000000n);
    expect(result.ok).toBe(true);
    expect(mock.balance).toBe(100005000000n);
  });

  it("rejects zero deposit", () => {
    const result = mock.depositFunds(0n);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_INVALID_AMOUNT);
  });

  it("initializes category with valid data", () => {
    const result = mock.initializeCategory("education", 10000000n, "Public schools funding");
    expect(result.ok).toBe(true);
    expect(mock.getCategoryAllocation("education")).toBe(10000000n);
    expect(mock.getTotalAllocated()).toBe(10000000n);
    expect(mock.getCategoryMetadata("education")?.active).toBe(true);
  });

  it("rejects category with invalid length", () => {
    const result = mock.initializeCategory("a".repeat(33), 10000000n, "Too long");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_INVALID_CATEGORY);
  });

  it("rejects duplicate category", () => {
    mock.initializeCategory("health", 5000000n, "Hospitals");
    const result = mock.initializeCategory("health", 3000000n, "Clinics");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_CATEGORY_ALREADY_EXISTS);
  });

  it("rejects zero initial allocation", () => {
    const result = mock.initializeCategory("roads", 0n, "Infrastructure");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_ZERO_ALLOCATION);
  });

  it("sets adjustment contract once", () => {
    const result = mock.setAdjustmentContract("ST2ADJUST");
    expect(result.ok).toBe(true);
    expect(mock.getAdjustmentContract()).toBe("ST2ADJUST");
  });

  it("prevents setting adjustment contract twice", () => {
    mock.setAdjustmentContract("ST2ADJUST");
    const result = mock.setAdjustmentContract("ST3OTHER");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_UNAUTHORIZED);
  });

  it("adjusts allocation upward when authorized", () => {
    mock.setAdjustmentContract(mock.caller);
    mock.initializeCategory("education", 10000000n, "Schools");
    mock.depositFunds(20000000n);

    const result = mock.adjustAllocation("education", 15000000n);
    expect(result.ok).toBe(true);
    expect(mock.getCategoryAllocation("education")).toBe(15000000n);
    expect(mock.getTotalAllocated()).toBe(15000000n);
  });

  it("adjusts allocation downward when authorized", () => {
    mock.setAdjustmentContract(mock.caller);
    mock.initializeCategory("health", 20000000n, "Hospitals");
    mock.depositFunds(30000000n);

    const result = mock.adjustAllocation("health", 12000000n);
    expect(result.ok).toBe(true);
    expect(mock.getCategoryAllocation("health")).toBe(12000000n);
    expect(mock.getTotalAllocated()).toBe(12000000n);
  });

  it("rejects adjustment when not authorized", () => {
    mock.setAdjustmentContract("ST2ADJUST");
    mock.setCaller("ST3HACKER");
    mock.initializeCategory("roads", 10000000n, "Roads");

    const result = mock.adjustAllocation("roads", 15000000n);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_ADJUSTMENT_NOT_AUTHORIZED);
  });

  it("deactivates category successfully", () => {
    mock.setAdjustmentContract(mock.caller);
    mock.initializeCategory("culture", 8000000n, "Arts");
    const result = mock.deactivateCategory("culture");
    expect(result.ok).toBe(true);
    expect(mock.getCategoryMetadata("culture")?.active).toBe(false);
  });

  it("rejects deactivation of non-existent category", () => {
    mock.setAdjustmentContract(mock.caller);
    const result = mock.deactivateCategory("nonexistent");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_ZERO_ALLOCATION);
  });

  it("records history on initialize", () => {
    mock.initializeCategory("infrastructure", 30000000n, "Bridges");
    const entry = mock.getAllocationHistoryEntry(0n);
    expect(entry?.category).toBe("infrastructure");
    expect(entry?.amount).toBe(30000000n);
    expect(entry?.action).toBe("initialize");
  });

  it("records history on adjust", () => {
    mock.setAdjustmentContract(mock.caller);
    mock.initializeCategory("security", 15000000n, "Police");
    mock.adjustAllocation("security", 18000000n);
    const entry = mock.getAllocationHistoryEntry(1n);
    expect(entry?.action).toBe("adjust");
  });

  it("emergency withdraw by owner", () => {
    mock.depositFunds(100000000n);
    const result = mock.emergencyWithdraw(50000000n);
    expect(result.ok).toBe(true);
    expect(mock.balance).toBe(100050000000n);
  });

  it("rejects emergency withdraw by non-owner", () => {
    mock.setCaller("ST3HACKER");
    mock.depositFunds(100000000n);
    const result = mock.emergencyWithdraw(50000000n);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ERR_UNAUTHORIZED);
  });

  it("returns correct treasury balance", () => {
    mock.depositFunds(25000000n);
    expect(mock.getTreasuryBalance()).toBe(100025000000n);
  });

  it("returns null for non-existent category", () => {
    expect(mock.getCategoryAllocation("nonexistent")).toBe(null);
  });
});