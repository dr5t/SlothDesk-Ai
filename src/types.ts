export type SupportedFileType = "text" | "markdown" | "csv" | "json" | "unsupported";

export interface ProviderHealth {
  available: boolean;
  model: string;
  message: string;
  connected: boolean;
  installed: boolean;
  inferenceVerified: boolean;
  lastUsedProvider?: "ollama" | "deterministic";
  lastInferenceAt?: string;
  lastError?: string;
}

export interface FileRecord {
  path: string;
  relativePath: string;
  name: string;
  type: SupportedFileType;
  size: number;
  hash: string;
  duplicateOf?: string;
}

export interface SourceEvidence {
  item: string;
  excerpt: string;
  line: number;
}

export interface Proposal {
  id: string;
  sourcePath: string;
  destinationPath: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "completed" | "failed";
  reportSource?: string;
}

export interface DocumentReport {
  source: string;
  summary: string;
  facts: string[];
  tasks: string[];
  decisions: string[];
  deadlines: string[];
  category: string;
  suggestedName: string;
  provider: "ollama" | "deterministic";
  evidence?: SourceEvidence[];
  proposalId?: string;
}

export interface Execution {
  id: string;
  workspace: string;
  status: "completed" | "failed";
  startedAt: string;
  endedAt: string;
  filesProcessed: number;
  duplicates: number;
  tasksExtracted: number;
  proposals: Proposal[];
  reports: DocumentReport[];
  errors: string[];
  manualMinutes: number;
  automatedMinutes: number;
  reviewMinutes: number;
  estimatedNetMinutesSaved: number;
}

export interface OperationJournalEntry {
  id: string;
  proposalId: string;
  executionId: string;
  sourcePath: string;
  destinationPath: string;
  completedAt: string;
  fileHash?: string;
  rolledBackAt?: string;
}

