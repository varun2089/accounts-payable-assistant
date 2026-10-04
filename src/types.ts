export type DocumentStatus =
  | 'current'
  | 'superseded'
  | 'draft'
  | 'untrusted'
  | (string & {});

export type DocumentClassification =
  | 'public'
  | 'internal'
  | 'restricted'
  | 'external-unverified'
  | (string & {});

export type DocumentFrontmatter = {
  document_id: string;
  title: string;
  version: string;
  effective_date: string;
  status: DocumentStatus;
  classification: DocumentClassification;
};

export type DocumentChunk = {
  id: string;
  order: number;
  documentId: string;
  documentTitle: string;
  documentVersion: string;
  documentEffectiveDate: string;
  documentStatus: DocumentStatus;
  documentClassification: DocumentClassification;
  heading: string;
  headingLevel: number;
  text: string;
};

export type PolicyDocument = {
  id: string;
  title: string;
  version: string;
  effectiveDate: string;
  status: DocumentStatus;
  classification: DocumentClassification;
  filename: string;
  path: string;
  body: string;
  chunks: DocumentChunk[];
};

export type Corpus = {
  documents: PolicyDocument[];
  chunks: DocumentChunk[];
};

export type RetrievalMode = 'embeddings' | 'keyword';

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  title: string;
  version: string;
  effectiveDate: string;
  status: DocumentStatus;
  classification: DocumentClassification;
  heading: string;
  text: string;
  score: number;
};

export type VendorStatus = 'active' | 'blocked' | 'hold';

export type VendorRecord = {
  vendorId: string;
  name: string;
  status: VendorStatus;
  bankAccountLast4: string;
  bankAccountUpdatedAt: string;
  riskFlags: string[];
  lastUpdated: string;
};

export type PurchaseOrderLine = {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
};

export type GoodsReceipt = {
  receiptId: string;
  lineNumber: number;
  receivedDate: string;
  quantityReceived: number;
};

export type PurchaseOrderApprovalStatus = 'approved' | 'pending' | 'rejected';

export type PurchaseOrder = {
  poNumber: string;
  vendorId: string;
  currency: string;
  lines: PurchaseOrderLine[];
  approvalStatus: PurchaseOrderApprovalStatus;
  approvedBy: string | null;
  goodsReceipts: GoodsReceipt[];
};

export type InvoiceRecord = {
  invoiceNumber: string;
  vendorId: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  paymentStatus: 'paid' | 'pending' | 'rejected';
  poNumber: string | null;
};

export type MatchLineResult = {
  lineNumber: number;
  description: string;
  poQuantity: number;
  poUnitPrice: number;
  poLineTotal: number;
  invoiceLineTotal: number;
  receivedQuantity: number;
  difference: number;
  toleranceAllowed: number;
  withinTolerance: boolean;
  failureReason: 'PRICE_VARIANCE' | 'MISSING_RECEIPT' | 'NO_MATCHING_PO_LINE' | null;
};

export type ThreeWayMatchOutcome = 'MATCH' | 'HOLD_FOR_INFORMATION';

export type ThreeWayMatchResult = {
  outcome: ThreeWayMatchOutcome;
  poNumber: string;
  invoiceTotal: number;
  poTotal: number;
  lines: MatchLineResult[];
  failedLines: MatchLineResult[];
};

export type InvoiceLineInput = {
  lineNumber: number;
  amount: number;
};

export type DuplicateMatchType = 'EXACT' | 'FUZZY' | 'NONE';

export type DuplicateCheckResult = {
  matchType: DuplicateMatchType;
  matchedInvoice: InvoiceRecord | null;
  reasons: string[];
};

export type ToolResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      errorCode: 'NOT_FOUND' | 'TIMEOUT' | 'TRANSIENT_FAILURE';
      message: string;
    };

export type FinanceDecisionAction =
  | 'APPROVE_FOR_POSTING'
  | 'HOLD_FOR_INFORMATION'
  | 'REJECT_DUPLICATE'
  | 'REJECT_INVALID'
  | 'ESCALATE_CONTROL_REVIEW';

export type SubmitFinanceDecisionInput = {
  idempotencyKey: string;
  caseId: string;
  action: FinanceDecisionAction;
  invoiceNumber: string;
  vendorId: string;
  amount: number;
  currency: string;
  approvedBy: string;
};

export type SubmitFinanceDecisionResult = {
  confirmationId: string;
  idempotencyKey: string;
  wasAlreadyProcessed: boolean;
  action: FinanceDecisionAction;
  processedAt: string;
};

export type ProposedAction = FinanceDecisionAction | 'NONE';

export type ValidatedAgentOutput = {
  recommendation: string;
  proposedAction: ProposedAction;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  citedEvidence: { documentId: string; heading: string }[];
  calculations: unknown;
  exceptions: string[];
  unknowns: string[];
  nextAction: string;
};

export type ToolCallRecord = {
  input: unknown;
  result: unknown;
};

export type EvidenceCheckFailure = {
  tool: string;
  requirement: string;
  observed: string;
  latestResult: unknown;
};

export type AgentRunOutcome =
  | { kind: 'COMPLETED'; output: ValidatedAgentOutput }
  | {
      kind: 'NEEDS_APPROVAL';
      output: ValidatedAgentOutput;
      proposedAction: FinanceDecisionAction;
    }
  | {
      kind: 'UNSUPPORTED_RECOMMENDATION';
      claimedAction: FinanceDecisionAction;
      output: ValidatedAgentOutput;
      reason: string;
      contradictingEvidence?: unknown;
    }
  | { kind: 'MALFORMED_OUTPUT'; rawText: string | null; validationErrors: string[] }
  | { kind: 'MAX_STEPS_EXCEEDED' };

export type ProcessingRequest = {
  caseId: string;
  invoiceRef: string;
  vendorId: string;
  poNumber: string;
  amount: number;
  currency: string;
  notes: string;
};

export type RunStatus = 'RUNNING' | 'NEEDS_APPROVAL' | 'COMPLETED' | 'FAILED' | 'REJECTED';

export type AuditEvent = {
  timestamp: string;
  correlationId: string;
  eventType: string;
  detail: unknown;
};

export type RunRecord = {
  runId: string;
  caseId: string;
  request: ProcessingRequest;
  status: RunStatus;
  outcome: AgentRunOutcome | null;
  auditEvents: AuditEvent[];
  createdAt: string;
  updatedAt: string;
};

export type ApproverRole =
  | 'COST_CENTRE_MANAGER'
  | 'DEPARTMENT_DIRECTOR'
  | 'EXECUTIVE_DIRECTOR'
  | 'CFO'
  | 'CEO';

export type AuthorityCheckResult = {
  requiredApproverRole: ApproverRole;
  requiresSecondApproval: boolean;
  secondApprovalReason: string | null;
  authorityLimits: { role: ApproverRole; limit: number | null }[];
};
