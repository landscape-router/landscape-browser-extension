import type { FlowMatchResult } from '@landscape-router/types/api/schemas';
import type { SummaryAction } from './router-inspector';

export function formatChipClass(action: SummaryAction): string {
  return `chip chip-${action}`;
}

export function formatFlowHint(flow: FlowMatchResult): string {
  if (flow.flow_id_by_ip != null && flow.flow_id_by_mac != null) {
    return `matched by IP ${flow.flow_id_by_ip} and MAC ${flow.flow_id_by_mac}`;
  }

  if (flow.flow_id_by_ip != null) {
    return `matched by IP ${flow.flow_id_by_ip}`;
  }

  if (flow.flow_id_by_mac != null) {
    return `matched by MAC ${flow.flow_id_by_mac}`;
  }

  return 'fell back to the Router default flow selection';
}

export function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}
