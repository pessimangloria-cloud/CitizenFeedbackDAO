(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PROPOSAL-DESCRIPTION u101)
(define-constant ERR-INVALID-VOTING-POWER u102)
(define-constant ERR-INVALID-END-BLOCK u103)
(define-constant ERR-INVALID-THRESHOLD u104)
(define-constant ERR-PROPOSAL-ALREADY-EXISTS u105)
(define-constant ERR-PROPOSAL-NOT-FOUND u106)
(define-constant ERR-VOTING-CLOSED u107)
(define-constant ERR-ALREADY-VOTED u108)
(define-constant ERR-INVALID-TOKEN-BALANCE u109)
(define-constant ERR-INVALID-QUADRATIC_FACTOR u110)
(define-constant ERR-MAX-PROPOSALS-EXCEEDED u111)
(define-constant ERR-INVALID-UPDATE-PARAM u112)
(define-constant ERR-INVALID-PROPOSAL-TYPE u113)
(define-constant ERR-INVALID-START-BLOCK u114)
(define-constant ERR-INVALID-MIN-STAKE u115)
(define-constant ERR-INVALID-MAX-STAKE u116)
(define-constant ERR-PROPOSAL-UPDATE-NOT-ALLOWED u117)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u118)
(define-constant ERR-INVALID-DELEGATE u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var next-proposal-id uint u0)
(define-data-var max-proposals uint u1000)
(define-data-var proposal-fee uint u1000)
(define-data-var authority-contract (optional principal) none)
(define-data-var governance-token-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var quadratic-factor uint u2)
(define-data-var min-voting-threshold uint u50)

(define-map proposals
  uint
  {
    description: (string-utf8 1000),
    yes-votes: uint,
    no-votes: uint,
    end-block: uint,
    start-block: uint,
    creator: principal,
    proposal-type: (string-utf8 50),
    min-stake: uint,
    max-stake: uint,
    status: bool,
    threshold: uint,
    total-votes: uint
  }
)

(define-map proposals-by-description
  (string-utf8 1000)
  uint)

(define-map proposal-updates
  uint
  {
    update-description: (string-utf8 1000),
    update-end-block: uint,
    update-threshold: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-map voter-records
  { proposal-id: uint, voter: principal }
  { voted: bool, power: uint }
)

(define-map delegates
  principal
  principal)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id)
)

(define-read-only (get-proposal-updates (id uint))
  (map-get? proposal-updates id)
)

(define-read-only (is-proposal-registered (description (string-utf8 1000)))
  (is-some (map-get? proposals-by-description description))
)

(define-read-only (get-voter-record (proposal-id uint) (voter principal))
  (map-get? voter-records { proposal-id: proposal-id, voter: voter })
)

(define-read-only (get-delegate (voter principal))
  (map-get? delegates voter)
)

(define-private (validate-description (desc (string-utf8 1000)))
  (if (and (> (len desc) u0) (<= (len desc) u1000))
      (ok true)
      (err ERR-INVALID-PROPOSAL-DESCRIPTION))
)

(define-private (validate-voting-power (power uint))
  (if (> power u0)
      (ok true)
      (err ERR-INVALID-VOTING-POWER))
)

(define-private (validate-end-block (end uint))
  (if (> end block-height)
      (ok true)
      (err ERR-INVALID-END-BLOCK))
)

(define-private (validate-threshold (thresh uint))
  (if (and (> thresh u0) (<= thresh u100))
      (ok true)
      (err ERR-INVALID-THRESHOLD))
)

(define-private (validate-start-block (start uint))
  (if (>= start block-height)
      (ok true)
      (err ERR-INVALID-START-BLOCK))
)

(define-private (validate-proposal-type (ptype (string-utf8 50)))
  (if (or (is-eq ptype "fund") (is-eq ptype "policy") (is-eq ptype "governance"))
      (ok true)
      (err ERR-INVALID-PROPOSAL-TYPE))
)

(define-private (validate-min-stake (min uint))
  (if (> min u0)
      (ok true)
      (err ERR-INVALID-MIN-STAKE))
)

(define-private (validate-max-stake (max uint))
  (if (> max u0)
      (ok true)
      (err ERR-INVALID-MAX-STAKE))
)

(define-private (validate-quadratic-factor (factor uint))
  (if (and (> factor u0) (<= factor u10))
      (ok true)
      (err ERR-INVALID-QUADRATIC_FACTOR))
)

(define-private (validate-delegate (del principal))
  (if (not (is-eq del tx-sender))
      (ok true)
      (err ERR-INVALID-DELEGATE))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-private (calculate-quadratic-power (balance uint))
  (pow balance (var-get quadratic-factor))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-proposals (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID_UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-proposals new-max)
    (ok true)
  )
)

(define-public (set-proposal-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID_UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set proposal-fee new-fee)
    (ok true)
  )
)

(define-public (set-quadratic-factor (new-factor uint))
  (begin
    (try! (validate-quadratic-factor new-factor))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set quadratic-factor new-factor)
    (ok true)
  )
)

(define-public (set-min-voting-threshold (new-thresh uint))
  (begin
    (try! (validate-threshold new-thresh))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set min-voting-threshold new-thresh)
    (ok true)
  )
)

(define-public (set-delegate (delegate principal))
  (begin
    (try! (validate-delegate delegate))
    (map-set delegates tx-sender delegate)
    (ok true)
  )
)

(define-public (create-proposal
  (description (string-utf8 1000))
  (end-block uint)
  (proposal-type (string-utf8 50))
  (min-stake uint)
  (max-stake uint)
  (threshold uint)
)
  (let (
        (next-id (var-get next-proposal-id))
        (current-max (var-get max-proposals))
        (authority (var-get authority-contract))
        (start block-height)
      )
    (asserts! (< next-id current-max) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (try! (validate-description description))
    (try! (validate-end-block end-block))
    (try! (validate-proposal-type proposal-type))
    (try! (validate-min-stake min-stake))
    (try! (validate-max-stake max-stake))
    (try! (validate-threshold threshold))
    (try! (validate-start-block start))
    (asserts! (is-none (map-get? proposals-by-description description)) (err ERR-PROPOSAL-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get proposal-fee) tx-sender authority-recipient))
    )
    (map-set proposals next-id
      {
        description: description,
        yes-votes: u0,
        no-votes: u0,
        end-block: end-block,
        start-block: start,
        creator: tx-sender,
        proposal-type: proposal-type,
        min-stake: min-stake,
        max-stake: max-stake,
        status: true,
        threshold: threshold,
        total-votes: u0
      }
    )
    (map-set proposals-by-description description next-id)
    (var-set next-proposal-id (+ next-id u1))
    (print { event: "proposal-created", id: next-id })
    (ok next-id)
  )
)

(define-public (vote (proposal-id uint) (vote-yes bool))
  (let (
        (proposal-opt (map-get? proposals proposal-id))
        (voter tx-sender)
        (delegate-opt (get-delegate voter))
      )
    (match proposal-opt
      proposal
        (begin
          (asserts! (get status proposal) (err ERR-INVALID-STATUS))
          (asserts! (<= block-height (get end-block proposal)) (err ERR-VOTING-CLOSED))
          (asserts! (>= block-height (get start-block proposal)) (err ERR-VOTING-CLOSED))
          (let (
                (effective-voter (match delegate-opt del del voter))
                (balance (unwrap! (contract-call? .governance-token-contract ft-get-balance effective-voter) (err ERR-INVALID-TOKEN-BALANCE)))
                (power (calculate-quadratic-power balance))
                (record-opt (get-voter-record proposal-id effective-voter))
              )
            (try! (validate-voting-power power))
            (asserts! (is-none record-opt) (err ERR-ALREADY-VOTED))
            (map-set voter-records { proposal-id: proposal-id, voter: effective-voter } { voted: true, power: power })
            (if vote-yes
                (map-set proposals proposal-id
                  (merge proposal { yes-votes: (+ (get yes-votes proposal) power), total-votes: (+ (get total-votes proposal) power) })
                )
                (map-set proposals proposal-id
                  (merge proposal { no-votes: (+ (get no-votes proposal) power), total-votes: (+ (get total-votes proposal) power) })
                )
            )
            (print { event: "vote-cast", proposal-id: proposal-id, voter: effective-voter, yes: vote-yes })
            (ok true)
          )
        )
      (err ERR-PROPOSAL-NOT-FOUND)
    )
  )
)

(define-public (update-proposal
  (proposal-id uint)
  (update-description (string-utf8 1000))
  (update-end-block uint)
  (update-threshold uint)
)
  (let ((proposal-opt (map-get? proposals proposal-id)))
    (match proposal-opt
      p
        (begin
          (asserts! (is-eq (get creator p) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status p) (err ERR-INVALID-STATUS))
          (try! (validate-description update-description))
          (try! (validate-end-block update-end-block))
          (try! (validate-threshold update-threshold))
          (let ((existing (map-get? proposals-by-description update-description)))
            (match existing
              existing-id
                (asserts! (is-eq existing-id proposal-id) (err ERR-PROPOSAL-ALREADY-EXISTS))
              (ok true)
            )
          )
          (let ((old-desc (get description p)))
            (if (is-eq old-desc update-description)
                (ok true)
                (begin
                  (map-delete proposals-by-description old-desc)
                  (map-set proposals-by-description update-description proposal-id)
                  (ok true)
                )
            )
          )
          (map-set proposals proposal-id
            (merge p
              {
                description: update-description,
                end-block: update-end-block,
                threshold: update-threshold
              }
            )
          )
          (map-set proposal-updates proposal-id
            {
              update-description: update-description,
              update-end-block: update-end-block,
              update-threshold: update-threshold,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "proposal-updated", id: proposal-id })
          (ok true)
        )
      (err ERR-PROPOSAL-NOT-FOUND)
    )
  )
)

(define-public (close-proposal (proposal-id uint))
  (let ((proposal-opt (map-get? proposals proposal-id)))
    (match proposal-opt
      p
        (begin
          (asserts! (is-eq (get creator p) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (> block-height (get end-block p)) (err ERR-VOTING-CLOSED))
          (asserts! (get status p) (err ERR-INVALID-STATUS))
          (let (
                (yes (get yes-votes p))
                (total (get total-votes p))
                (passed (and (>= total (var-get min-voting-threshold)) (>= (* yes u100) (* total (get threshold p)))))
              )
            (map-set proposals proposal-id (merge p { status: false }))
            (print { event: "proposal-closed", id: proposal-id, passed: passed })
            (ok passed)
          )
        )
      (err ERR-PROPOSAL-NOT-FOUND)
    )
  )
)

(define-public (get-proposal-count)
  (ok (var-get next-proposal-id))
)

(define-public (check-proposal-existence (description (string-utf8 1000)))
  (ok (is-proposal-registered description))
)