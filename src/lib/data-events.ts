/**
 * A tiny, dependency-free pub/sub used to keep screens in sync after task
 * mutations (complete, edit, delete, hero change, reorder).
 *
 * Supabase is the source of truth. When a mutation succeeds, the mutating
 * screen emits `taskDataChanged`; any screen subscribed to it refetches its
 * relevant data so the whole app reflects the latest state without a manual
 * refresh. This avoids a state-management library while keeping a single
 * consistent invalidation point.
 */

import type { HomeTask } from '@/features/tasks/tasks.types';

type Listener = () => void;
export interface OptimisticTaskUpdate {
	task: HomeTask;
	completedDate: string | null;
	completedTime: string | null;
	previousIndex?: number;
	previousWasFocus?: boolean;
}

type OptimisticTaskListener = (update: OptimisticTaskUpdate) => void;

const taskListeners = new Set<Listener>();
const taskDeadlineListeners = new Set<Listener>();
const optimisticTaskListeners = new Set<OptimisticTaskListener>();
const activeTaskMutations = new Set<string>();
let taskDataChangeDeferred = false;
let taskMutationQueue: Promise<unknown> = Promise.resolve();

/**
 * Subscribe to task-data changes. Returns an unsubscribe function.
 * Callers should pass a stable (memoized) listener.
 */
export function subscribeToTaskChanges(listener: Listener): () => void {
	taskListeners.add(listener);
	return () => {
		taskListeners.delete(listener);
	};
}

export function subscribeToOptimisticTaskUpdates(
	listener: OptimisticTaskListener
): () => void {
	optimisticTaskListeners.add(listener);
	return () => {
		optimisticTaskListeners.delete(listener);
	};
}

export function emitOptimisticTaskUpdate(
	update: OptimisticTaskUpdate
): void {
	optimisticTaskListeners.forEach((listener) => {
		try {
			listener(update);
		} catch (err) {
			console.error('Optimistic task listener threw:', err);
		}
	});
}

/** Reserve a task so duplicate or overlapping edits cannot race each other. */
export function beginTaskMutation(taskIds: string | string[]): boolean {
	const ids = Array.isArray(taskIds) ? Array.from(new Set(taskIds)) : [taskIds];
	if (ids.some((taskId) => activeTaskMutations.has(taskId))) return false;
	ids.forEach((taskId) => activeTaskMutations.add(taskId));
	taskDataChangeDeferred = true;
	return true;
}

export function isTaskMutationInProgress(): boolean {
	return activeTaskMutations.size > 0;
}

/**
 * Serialize Supabase task writes so queue-affecting operations observe the
 * result of the previous operation before calculating their own changes.
 */
export function serializeTaskMutation<T>(
	mutation: () => Promise<T>
): Promise<T> {
	const result = taskMutationQueue.then(mutation, mutation);
	taskMutationQueue = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

/** Release a task reservation and refresh all screens when the batch settles. */
export function finishTaskMutation(taskIds: string | string[]): void {
	const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
	ids.forEach((taskId) => activeTaskMutations.delete(taskId));
	if (activeTaskMutations.size === 0 && taskDataChangeDeferred) {
		taskDataChangeDeferred = false;
		notifyTaskDataChanged();
	}
}

/** Notify all subscribers that task data may have changed. */
export function emitTaskDataChanged(): void {
	if (activeTaskMutations.size > 0) {
		taskDataChangeDeferred = true;
		return;
	}
	notifyTaskDataChanged();
}

function notifyTaskDataChanged(): void {
	taskListeners.forEach((listener) => {
		try {
			listener();
		} catch (err) {
			console.error('Task change listener threw:', err);
		}
	});
}

export function subscribeToTaskDeadlineChanges(listener: Listener): () => void {
	taskDeadlineListeners.add(listener);
	return () => {
		taskDeadlineListeners.delete(listener);
	};
}

/** Notify deadline-reminder sync after a successful task status/deadline change. */
export function emitTaskDeadlineChanged(): void {
	taskDeadlineListeners.forEach((listener) => {
		try {
			listener();
		} catch (err) {
			console.error('Task deadline listener threw:', err);
		}
	});
}
