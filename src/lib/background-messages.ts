export const GET_MAIN_FRAME_IP = 'get-main-frame-ip';
export const MAIN_FRAME_IP_STORAGE_KEY_PREFIX = 'main-frame-ip:';

export interface GetMainFrameIpRequest {
  tabId: number;
  type: typeof GET_MAIN_FRAME_IP;
}

export interface MainFrameIpResponse {
  ip?: string;
  url?: string;
}

export function getMainFrameIpStorageKey(tabId: number): string {
  return `${MAIN_FRAME_IP_STORAGE_KEY_PREFIX}${tabId}`;
}
