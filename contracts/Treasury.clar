(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-INVALID-CATEGORY u103)
(define-constant ERR-CATEGORY-NOT-FOUND u104)
(define-constant ERR-ALLOCATION-EXCEEDS-TOTAL u105)
(define-constant ERR-ADJUSTMENT-NOT-AUTHORIZED u106)
(define-constant ERR-ZERO-ALLOCATION u107)
(define-constant ERR-CATEGORY-ALREADY-EXISTS u108)
(define-constant ERR-TOTAL-ALLOCATIONS-MISMATCH u109)

(define-data-var treasury-nonce uint u0)
(define-data-var total-allocated uint u0)
(define-data-var adjustment-contract (optional principal) none)

(define-map category-allocations
  (string-ascii 32)
  uint
)

(define-map allocation-history
  uint
  {
    category: (string-ascii 32),
    amount: uint,
    timestamp: uint,
    executor: principal,
    action: (string-ascii 12)
  }
)

(define-map category-metadata
  (string-ascii 32)
  {
    created-at: uint,
    creator: principal,
    description: (string-utf8 256),
    active: bool
  }
)

(define-read-only (get-treasury-balance)
  (stx-get-balance (as-contract tx-sender))
)

(define-read-only (get-category-allocation (category (string-ascii 32)))
  (map-get? category-allocations category)
)

(define-read-only (get-total-allocated)
  (ok (var-get total-allocated))
)

(define-read-only (get-adjustment-contract)
  (var-get adjustment-contract)
)

(define-read-only (get-category-metadata (category (string-ascii 32)))
  (map-get? category-metadata category)
)

(define-read-only (get-allocation-history-entry (id uint))
  (map-get? allocation-history id)
)

(define-read-only (validate-category (category (string-ascii 32)))
  (and (> (len category) u0) (<= (len category) u32))
)

(define-read-only (is-adjustment-authorized)
  (match (var-get adjustment-contract)
    auth-contract (is-eq contract-caller auth-contract)
    false
  )
)

(define-private (assert-authorized)
  (asserts! (is-adjustment-authorized) (err ERR-ADJUSTMENT-NOT-AUTHORIZED))
)

(define-private (record-history (category (string-ascii 32)) (amount uint) (action (string-ascii 12)))
  (let ((entry-id (var-get treasury-nonce)))
    (map-set allocation-history entry-id
      {
        category: category,
        amount: amount,
        timestamp: block-height,
        executor: tx-sender,
        action: action
      }
    )
    (var-set treasury-nonce (+ entry-id u1))
    entry-id
  )
)

(define-public (initialize-category
  (category (string-ascii 32))
  (initial-amount uint)
  (description (string-utf8 256))
)
  (let ((exists (map-get? category-allocations category)))
    (asserts! (validate-category category) (err ERR-INVALID-CATEGORY))
    (asserts! (is-none exists) (err ERR-CATEGORY-ALREADY-EXISTS))
    (asserts! (> initial-amount u0) (err ERR-ZERO-ALLOCATION))
    (map-set category-allocations category initial-amount)
    (map-set category-metadata category
      {
        created-at: block-height,
        creator: tx-sender,
        description: description,
        active: true
      }
    )
    (var-set total-allocated (+ (var-get total-allocated) initial-amount))
    (ok (record-history category initial-amount "initialize"))
  )
)

(define-public (deposit-funds (amount uint))
  (begin
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (ok true)
  )
)

(define-public (adjust-allocation
  (category (string-ascii 32))
  (new-amount uint)
)
  (let (
    (current (default-to u0 (map-get? category-allocations category)))
    (diff (if (> new-amount current) (- new-amount current) (- current new-amount)))
    (new-total (if (> new-amount current)
      (+ (var-get total-allocated) diff)
      (- (var-get total-allocated) diff)
    ))
  )
    (assert-authorized)
    (asserts! (validate-category category) (err ERR-INVALID-CATEGORY))
    (asserts! (> new-amount u0) (err ERR-ZERO-ALLOCATION))
    (asserts! (<= new-total (stx-get-balance (as-contract tx-sender))) (err ERR-INSUFFICIENT-BALANCE))
    (map-set category-allocations category new-amount)
    (var-set total-allocated new-total)
    (ok (record-history category new-amount "adjust"))
  )
)

(define-public (deactivate-category (category (string-ascii 32)))
  (let ((current (default-to u0 (map-get? category-allocations category))))
    (assert-authorized)
    (asserts! (validate-category category) (err ERR-INVALID-CATEGORY))
    (asserts! (> current u0) (err ERR-ZERO-ALLOCATION))
    (map-set category-metadata category
      (merge (unwrap-panic (map-get? category-metadata category)) { active: false })
    )
    (ok (record-history category current "deactivate"))
  )
)

(define-public (set-adjustment-contract (contract principal))
  (begin
    (asserts! (is-none (var-get adjustment-contract)) (err ERR-UNAUTHORIZED))
    (var-set adjustment-contract (some contract))
    (ok true)
  )
)

(define-public (emergency-withdraw (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (contract-owner)) (err ERR-UNAUTHORIZED))
    (asserts! (>= (stx-get-balance (as-contract tx-sender)) amount) (err ERR-INSUFFICIENT-BALANCE))
    (as-contract (stx-transfer? amount tx-sender recipient))
  )
)

(define-public (rebalance-allocations (categories (list 10 (string-ascii 32))) (amounts (list 10 uint)))
  (let (
    (current-total (var-get total-allocated))
    (new-total (fold + amounts u0))
    (category-count (len categories))
  )
    (assert-authorized)
    (asserts! (is-eq category-count (len amounts)) (err ERR-INVALID-AMOUNT))
    (asserts! (<= new-total (stx-get-balance (as-contract tx-sender))) (err ERR-INSUFFICIENT-BALANCE))
    (fold map-set-category-with-amount
      (map cons categories amounts)
      { total: current-total, index: u0 }
    )
    (var-set total-allocated new-total)
    (ok true)
  )
)

(define-private (map-set-category-with-amount (pair { category: (string-ascii 32), amount: uint }) (state { total: uint, index: uint }))
  (let (
    (category (get category pair))
    (amount (get amount pair))
    (current (default-to u0 (map-get? category-allocations category)))
  )
    (map-set category-allocations category amount)
    (record-history category amount "rebalance")
    state
  )
)