import { useCallback, useEffect, useRef, useState } from 'react';

import { trpc } from '../lib/trpc';

type AuthType = 'NONE' | 'OAUTH' | 'API_KEY';

interface AuthDetectionState {
  status: 'idle' | 'probing' | 'detected' | 'error';
  detectedType: AuthType | null;
  reason: string | null;
  overrideEnabled: boolean;
}

const initialState: AuthDetectionState = {
  status: 'idle',
  detectedType: null,
  reason: null,
  overrideEnabled: false,
};

interface UseAuthTypeDetectionOptions {
  url: string;
  setAuthType: (value: AuthType) => void;
  enabled?: boolean;
  debounceMs?: number;
}

interface UseAuthTypeDetectionResult {
  state: AuthDetectionState;
  enableOverride: () => void;
  reset: () => void;
  isBlocking: boolean;
}

export function useAuthTypeDetection({
  url,
  setAuthType,
  enabled = true,
  debounceMs = 500,
}: UseAuthTypeDetectionOptions): UseAuthTypeDetectionResult {
  const [state, setState] = useState<AuthDetectionState>(initialState);
  const probeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const overrideEnabledRef = useRef(state.overrideEnabled);

  const probeAuthMutation = trpc.admin.mcpServers.probeAuthType.useMutation();

  // Keep ref in sync with state
  useEffect(() => {
    overrideEnabledRef.current = state.overrideEnabled;
  }, [state.overrideEnabled]);

  const probeAuth = useCallback(
    (urlToProbe: string) => {
      if (lastUrlRef.current === urlToProbe) return;
      lastUrlRef.current = urlToProbe;

      setState((prev) => ({
        ...prev,
        status: 'probing',
        detectedType: null,
        reason: null,
      }));

      probeAuthMutation.mutate(
        { url: urlToProbe },
        {
          onSuccess: (result) => {
            if (result.detectionFailed || !result.suggestedAuthType) {
              setState((prev) => ({
                ...prev,
                status: 'error',
                detectedType: null,
                reason: result.reason,
                overrideEnabled: false,
              }));
            } else {
              if (!overrideEnabledRef.current) {
                setAuthType(result.suggestedAuthType);
              }
              setState((prev) => ({
                ...prev,
                status: 'detected',
                detectedType: result.suggestedAuthType,
                reason: result.reason,
              }));
            }
          },
          onError: (error) => {
            setState((prev) => ({
              ...prev,
              status: 'error',
              detectedType: null,
              reason: error.message,
            }));
          },
        },
      );
    },
    [probeAuthMutation, setAuthType],
  );

  // Probe auth type when URL changes
  useEffect(() => {
    if (!enabled) return;

    if (probeTimeoutRef.current) {
      clearTimeout(probeTimeoutRef.current);
      probeTimeoutRef.current = null;
    }

    if (!url || !url.startsWith('http')) {
      lastUrlRef.current = null;
      return;
    }

    probeTimeoutRef.current = setTimeout(() => {
      probeAuth(url);
    }, debounceMs);

    return () => {
      if (probeTimeoutRef.current) {
        clearTimeout(probeTimeoutRef.current);
      }
    };
  }, [url, enabled, debounceMs, probeAuth]);

  const enableOverride = useCallback(() => {
    setState((prev) => ({ ...prev, overrideEnabled: true }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
    lastUrlRef.current = null;
  }, []);

  const isBlocking =
    state.status === 'probing' || (state.status === 'error' && !state.overrideEnabled);

  return {
    state,
    enableOverride,
    reset,
    isBlocking,
  };
}
