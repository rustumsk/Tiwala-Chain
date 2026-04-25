# Algorithms Overview

These are simple notes on the main algorithms and decision rules currently used in TiwalaChain.

## 1. Contract File Hashing

- The backend computes a SHA-256 hash for uploaded contract files.
- The hash is stored with the job record and is also used by the blockchain escrow contract.
- Later, the same file can be re-hashed and compared to the stored hash to verify integrity.
- If the uploaded file hash and the claimed hash do not match, the contract is treated as a mismatch.

Why it matters:
- This gives the project a tamper-check mechanism.
- The same contract can be verified across backend records and on-chain records.

## 2. Contract Text Extraction

The AI service supports PDF and DOCX files.

- PDF extraction uses `pdfplumber`.
- DOCX extraction uses `python-docx`.
- For PDFs, the extractor removes likely header and footer areas by cropping the top and bottom margins.
- Extracted text is normalized before further processing.

Why it matters:
- Cleaner extraction improves clause detection and reduces noise from page numbers and repeated headers.

## 3. Clause Splitting

Before AI evaluation, contract text is split into clause-sized pieces.

Main rules used:
- Detect section markers such as `Section 1`, `Article II`, `1.`, and `1.1`.
- Treat short legal headings as part of the next clause instead of separate fragments.
- Ignore page noise such as `Page 1 of 3`, `draft`, and similar text.
- Split very long paragraphs again using sentence boundaries.
- Merge very short fragments back into nearby clauses.
- Separate preamble text and signature blocks so the fairness model focuses on actual contract clauses.

Why it matters:
- Legal documents often have formatting noise or flattened text from PDF extraction.
- This improves the quality of the clauses sent to the classifier.

## 4. AI Fairness Classification

The AI service uses a fine-tuned LegalBERT text-classification pipeline.

Process:
- Each clause is classified as `fair` or `unfair`.
- Confidence is calibrated instead of using the raw model score directly.
- Long clauses are handled with a sliding-window approach.

Sliding-window logic:
- If a clause is too long, it is broken into overlapping token windows.
- Each window is classified separately.
- If any window is strongly unfair, the whole clause is treated as unfair.

Why it matters:
- A long clause may hide one problematic sentence.
- This conservative rule helps surface that risk instead of averaging it away.

## 5. Rule-Based Risk Pattern Matching

The AI classifier is supported by regex-based pattern checks.

Examples of patterns flagged:
- unilateral termination
- sole discretion
- broad waivers
- unlimited liability
- one-sided indemnity
- one-sided venue selection
- broad non-compete or exclusivity
- payment withholding language
- unbalanced IP assignment wording

These patterns are used to:
- explain why a clause may be risky
- generate simple suggestions
- decide when extra review is needed

Why it matters:
- This gives the system interpretable reasons instead of only a label.

## 6. LLM Fallback Review

For some clauses, the system can ask an LLM for a second opinion or better suggestions.

The LLM is mainly used when:
- classifier confidence is low
- an unfair result is borderline
- a clause looks suspicious even though it was marked fair

The LLM can:
- confirm or override the label
- provide a clearer reason
- provide a more detailed issue description
- generate a better revision suggestion

Why it matters:
- This helps with borderline cases where strict classifier output may be too rigid.

## 7. Fairness Score Calculation

After all clauses are evaluated:

- `total_clauses` = number of analyzed clauses
- `unfair_count` = number labeled unfair
- `fair_count` = total minus unfair
- `fairness_score` = `fair_count / total_clauses`

The result is returned as a simple score plus per-clause explanations.

## 8. Backend Access and Validation Rules

The backend uses validation and rule checks more than complex algorithms.

Examples:
- wallet normalization
- contract hash normalization
- participant-only access to job data
- admin-only access for moderation actions
- duplicate dispute prevention
- file size and extension limits

Why it matters:
- These rules keep state transitions consistent and prevent invalid records.

## 9. Escrow State Machine

The smart contract uses a fixed job status flow:

`Created -> Funded -> InProgress -> Submitted -> Completed`

Alternative paths:
- `Funded -> Refunded`
- `InProgress -> Disputed`
- `Submitted -> Disputed`
- `Disputed -> Completed`
- `Disputed -> Refunded`

Why it matters:
- This is the core algorithm for payment safety.
- Only specific actors can move a job into the next valid state.

## 10. Notification Triggering

The backend creates notifications when important actions happen, such as:
- sending an offer
- accepting an offer
- declining an offer

This is event-style application logic rather than a formal algorithm, but it is part of the workflow coordination of the system.
