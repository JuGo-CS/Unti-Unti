import { supabase } from '@/lib/supabase';

const CLOCK_SKEW_CODE = 'PGRST303';

export function isClockSkewError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const candidate = error as { message?: unknown; code?: unknown };
	return (
		candidate.code === CLOCK_SKEW_CODE ||
		(typeof candidate.message === 'string' &&
			candidate.message.includes('JWT issued at future'))
	);
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refresh the session once for every caller that hits a clock-skew error.
 *
 * The device clock can drift ahead of the server, which makes freshly issued
 * tokens look like they were "issued at future". Refreshing re-issues the token
 * with a server-side timestamp. Concurrent callers share one refresh so a burst
 * of failed requests does not hammer the auth endpoint.
 *
 * Resolves to true when a new session is available and the caller should retry.
 */
export function refreshSessionForClockSkew(): Promise<boolean> {
	if (!refreshInFlight) {
		refreshInFlight = supabase.auth
			.refreshSession()
			.then(({ data, error }) => {
				if (error) {
					console.warn('Session refresh failed:', error.message);
					return false;
				}
				return Boolean(data.session);
			})
			.catch((error) => {
				console.warn('Session refresh threw:', error);
				return false;
			})
			.finally(() => {
				refreshInFlight = null;
			});
	}
	return refreshInFlight;
}

/**
 * Run a Supabase operation, transparently retrying once after a session
 * refresh when the request failed because of JWT clock skew.
 *
 * Usage: `return withClockSkewRetry(() => fetchPendingTaskQueue());`
 */
export async function withClockSkewRetry<T>(
	operation: () => Promise<T>
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (!isClockSkewError(error)) throw error;
		console.warn('JWT clock skew detected, refreshing session...');
		if (!(await refreshSessionForClockSkew())) throw error;
		return operation();
	}
}
