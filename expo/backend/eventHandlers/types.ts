export type EventStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface GameEvent {
  id: string;
  event_type: EventType;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  execute_at: string;
  status: EventStatus;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
  worker_id: string | null;
  idempotency_key: string;
  locked_until: string | null;
  priority: number;
  version: number;
  cancelled_at: string | null;
}

export type EventType =
  | 'building_complete'
  | 'research_complete'
  | 'shipyard_unit_complete'
  | 'fleet_arrival'
  | 'fleet_return'
  | 'score_recalc';

export interface EventHandler {
  (event: GameEvent): Promise<void>;
}

export interface ScheduleEventResult {
  event_id: string;
  already_existed: boolean;
  existing_execute_at: string | null;
}
