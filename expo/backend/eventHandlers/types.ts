export interface GameEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  execute_at: string;
  status: string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
  worker_id: string | null;
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
