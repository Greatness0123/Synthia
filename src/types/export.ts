// Export schema types. The coordinator-era mirror in coordinator/src/types was removed in Phase 12.

export type ExportType = 'dataset' | 'frames_zip' | 'thoughts_report' | 'session_full';
export type ExportFormat = 'LeRobot' | 'JSONL' | 'CSV' | 'Parquet';
export type ExportScope = 'all' | 'date_range' | 'session' | 'heartbeat_range';

export interface ExportConfig {
  exportType: ExportType;
  format?: ExportFormat;           // Only for 'dataset' type
  agentIds: string[]
  scope: ExportScope
  dateFrom?: string        // ISO string
  dateTo?: string          // ISO string
  sessionIds?: string[]
  heartbeatFrom?: number
  heartbeatTo?: number
  includeTiers: (1 | 2 | 3)[]
  includeFrames: boolean
  includeThoughts?: boolean
  includeSkills?: boolean
  includeMotorPrograms?: boolean
  excludeInjected: boolean
  successfulOnly: boolean
  /** Filter exported rows to memories created under these training goals. */
  taskFilter?: string[];
  zipPerAgent?: boolean;
}
