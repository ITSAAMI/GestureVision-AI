import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/** Backend reachability, polled every 5 s and shared across the app. */
export function useBackendHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 5000,
    retry: false,
  });
}

export function useSystemStatus(refetchInterval: number | false = 15_000) {
  return useQuery({ queryKey: ['system-status'], queryFn: api.status, refetchInterval, retry: false });
}
