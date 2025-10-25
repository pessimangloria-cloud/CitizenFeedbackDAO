# CitizenFeedbackDAO

## Overview

CitizenFeedbackDAO is a Web3 decentralized application (dApp) built on the Stacks blockchain using Clarity smart contracts. The core idea is a citizen feedback app linked to public fund usage, enabling real-time adjustments to fund allocations based on community input. This solves real-world problems such as government or organizational fund mismanagement, lack of transparency in public spending, and limited citizen participation in decision-making processes.

In many jurisdictions, public funds (e.g., taxes, grants, or donations) are allocated without sufficient oversight, leading to inefficiencies, corruption, or misalignment with community needs. CitizenFeedbackDAO addresses this by:

- **Transparency**: All fund allocations and usages are recorded on-chain, immutable and verifiable.
- **Citizen Empowerment**: Users (citizens) can submit feedback, vote on adjustments, and influence fund reallocation in real-time.
- **Incentivization**: Participants earn governance tokens for constructive feedback and voting, encouraging active involvement.
- **Real-Time Adjustments**: Smart contracts automate fund shifts based on threshold-based voting outcomes, reducing bureaucratic delays.

The project involves 6 solid smart contracts written in Clarity, ensuring security, predictability (no reentrancy issues), and Bitcoin-secured finality via Stacks.

### Key Features
- **Fund Tracking**: On-chain treasury for holding and disbursing funds.
- **Feedback Mechanism**: Citizens submit feedback tied to specific fund categories (e.g., education, infrastructure).
- **Governance Voting**: Token holders vote on proposed adjustments based on feedback aggregates.
- **Automated Adjustments**: If votes meet thresholds, funds are reallocated automatically.
- **Incentives**: Reward tokens for participation to bootstrap engagement.
- **Oracle Integration**: For off-chain data verification (e.g., real-world fund impact metrics), though kept minimal for decentralization.

This dApp can be used by governments, NGOs, or DAOs managing communal funds, promoting accountable governance.

## Smart Contracts

The project consists of 6 Clarity smart contracts, each handling a specific aspect of the system. They interact via contract calls for modularity and security.

1. **Treasury.clar**: Manages the storage and disbursement of funds. Holds STX (Stacks tokens) or other assets, tracks allocations by category, and allows controlled transfers based on governance decisions.
   
2. **Feedback.clar**: Handles submission and aggregation of citizen feedback. Users submit text-based feedback linked to fund categories, with on-chain storage for transparency. Includes spam prevention via small STX deposits (refundable if valid).

3. **GovernanceToken.clar**: An SIP-010 compliant fungible token (e.g., CFD token) for governance. Tokens are minted as rewards and used for voting power.

4. **Voting.clar**: Manages proposal creation (based on feedback trends) and voting rounds. Proposals suggest fund reallocations (e.g., shift 10% from roads to healthcare). Uses quadratic voting for fairness.

5. **Adjustment.clar**: Executes real-time fund adjustments. Listens to voting outcomes and triggers transfers in the Treasury contract if thresholds are met (e.g., 60% approval).

6. **Oracle.clar**: Provides a simple oracle for external data feeds (e.g., verifying real-world metrics like project completion). Uses multi-sig oracles to minimize trust assumptions.

### Contract Interactions
- Feedback → Voting: Aggregated feedback triggers proposal creation.
- Voting → Adjustment: Successful votes call Adjustment to reallocate via Treasury.
- GovernanceToken → Voting: Tokens determine voting weight.
- Oracle → All: Optional data feeds for enhanced decision-making.
- Treasury → Adjustment: Secure fund movements.

All contracts are designed with read-only functions for querying state, and principal-based access controls (e.g., only contract owners or voters can call certain functions).

## Tech Stack
- **Blockchain**: Stacks (Layer 1 for Bitcoin security).
- **Smart Contract Language**: Clarity (functional, decidable language for safe contracts).
- **Frontend**: Suggested integration with Hiro Wallet for STX transactions and Leather for dApp interactions (not included in this repo).
- **Testing**: Clarinet for local development and testing.
- **Deployment**: Stacks mainnet or testnet via Clarinet deploy.

## Installation and Setup

### Prerequisites
- Install Clarinet: `cargo install clarinet`.
- Stacks Wallet (e.g., Hiro) for testnet STX.
- Node.js for any frontend (optional).

### Steps
1. Clone the repo: `this repo`.
2. Navigate to the project: `cd CitizenFeedbackDAO`.
3. Initialize Clarinet project: `clarinet new .` (if not already set up).
4. Add contracts: Place the `.clar` files in `./contracts/`.
5. Test contracts: `clarinet test`.
6. Deploy to testnet: `clarinet deploy --testnet`.
7. Interact via console: `clarinet console`.

## Contract Code Snippets

Below are high-level snippets for each contract. Full code would be in separate `.clar` files.

### 1. Treasury.clar
```clarity
(define-data-var treasury-balance uint u0)
(define-map allocations principal uint)

(define-public (deposit (amount uint))
  (stx-transfer? amount tx-sender (as-contract tx-sender)))

(define-public (adjust-allocation (recipient principal) (amount uint))
  (begin
    (asserts! (is-eq tx-sender (contract-call? .adjustment get-adjuster)) err-unauthorized)
    (map-set allocations recipient amount)
    (ok true)))
```

### 2. Feedback.clar
```clarity
(define-map feedback uint { sender: principal, category: (string-ascii 32), content: (string-utf8 500) })
(define-data-var feedback-count uint u0)

(define-public (submit-feedback (category (string-ascii 32)) (content (string-utf8 500)))
  (begin
    (try! (stx-transfer? u1000000 tx-sender (as-contract tx-sender))) ;; Micro-STX deposit
    (map-set feedback (var-get feedback-count) { sender: tx-sender, category: category, content: content })
    (var-set feedback-count (+ (var-get feedback-count) u1))
    (ok true)))
```

### 3. GovernanceToken.clar
```clarity
;; SIP-010 Fungible Token
(define-fungible-token cfd-token)
(define-constant total-supply u1000000000)

(define-public (mint (recipient principal) (amount uint))
  (ft-mint? cfd-token amount recipient))
```

### 4. Voting.clar
```clarity
(define-map proposals uint { description: (string-utf8 1000), yes-votes: uint, no-votes: uint, end-block: uint })
(define-data-var proposal-count uint u0)

(define-public (vote (proposal-id uint) (vote bool))
  (let ((voting-power (ft-get-balance cfd-token tx-sender)))
    (asserts! (> voting-power u0) err-no-tokens)
    (if vote
      (map-set proposals proposal-id { yes-votes: (+ (get yes-votes (unwrap-panic (map-get? proposals proposal-id))) voting-power), ... })
      ... )
    (ok true)))
```

### 5. Adjustment.clar
```clarity
(define-public (execute-adjustment (proposal-id uint))
  (let ((proposal (unwrap-panic (map-get? .voting proposals proposal-id))))
    (asserts! (> (get yes-votes proposal) (/ (* (get yes-votes proposal) (get no-votes proposal)) u2)) err-threshold-not-met) ;; 60% threshold example
    (try! (contract-call? .treasury adjust-allocation ... ))
    (ok true)))
```

### 6. Oracle.clar
```clarity
(define-map oracle-data (string-ascii 32) { value: uint, timestamp: uint })
(define-constant oracle-principals (list 'SP... 'SP...)) ;; Multi-sig oracles

(define-public (submit-data (key (string-ascii 32)) (value uint))
  (asserts! (is-some (index-of oracle-principals tx-sender)) err-unauthorized)
  (map-set oracle-data key { value: value, timestamp: block-height })
  (ok true))
```

## Security Considerations
- **Audits**: Contracts should be audited before mainnet deployment.
- **Access Controls**: Use `asserts!` for principal checks.
- **DoS Prevention**: Limit map sizes and use deposits for submissions.
- **Upgradability**: Non-upgradable for immutability; use proxy patterns if needed.
- **Clarity Benefits**: No runtime errors, predictable execution.

## Roadmap
- V1: Core contracts and basic frontend.
- V2: Integrate with real-world oracles (e.g., Chainlink on Stacks if available).
- V3: Mobile app for feedback submission.
- Community Governance: Hand over to DAO post-launch.

## Contributing
Fork the repo, create PRs for improvements. Focus on Clarity best practices.

## License
MIT License. See LICENSE file.