import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A task as shown on the widget. The widget never talks to Supabase, so the
 * main app mirrors the whole pending queue here — that way a stale or partial
 * snapshot can never make the widget claim "All done" while tasks remain.
 */
export interface FocusWidgetTask {
	id: string;
	title: string;
	description: string | null;
	deadline: string | null;
	deadlineTime: string | null;
}

export interface FocusWidgetSnapshot {
	schemaVersion: 2;
	userId: string;
	focusTaskId: string | null;
	focusTaskTitle: string | null;
	focusTaskDescription?: string | null;
	focusTaskDeadline?: string | null;
	focusTaskDeadlineTime?: string | null;
	/** Number of pending tasks left after the focus task. */
	remainingTaskCount: number;
	/** The pending queue in display order (the focus task included). */
	tasks: FocusWidgetTask[];
}

const FOCUS_WIDGET_SNAPSHOT_KEY = 'unti-unti:focus-widget:snapshot:v2';
const FOCUS_WIDGET_ACCOUNT_KEY = 'unti-unti:focus-widget:account:v1';

function isNullableString(value: unknown): boolean {
	return value === undefined || value === null || typeof value === 'string';
}

function isFocusWidgetTask(value: unknown): value is FocusWidgetTask {
	if (typeof value !== 'object' || value === null) return false;

	const task = value as Record<string, unknown>;
	return (
		typeof task.id === 'string' &&
		typeof task.title === 'string' &&
		isNullableString(task.description) &&
		isNullableString(task.deadline) &&
		isNullableString(task.deadlineTime)
	);
}

function isFocusWidgetSnapshot(value: unknown): value is FocusWidgetSnapshot {
	if (typeof value !== 'object' || value === null) return false;

	const snapshot = value as Record<string, unknown>;
	const hasFocusTask =
		typeof snapshot.focusTaskId === 'string' &&
		typeof snapshot.focusTaskTitle === 'string';
	const hasNoFocusTask =
		snapshot.focusTaskId === null && snapshot.focusTaskTitle === null;
	const hasValidTaskDetails = [
		snapshot.focusTaskDescription,
		snapshot.focusTaskDeadline,
		snapshot.focusTaskDeadlineTime,
	].every(isNullableString);
	const tasks = snapshot.tasks;

	return (
		snapshot.schemaVersion === 2 &&
		typeof snapshot.userId === 'string' &&
		snapshot.userId.length > 0 &&
		(hasFocusTask || hasNoFocusTask) &&
		hasValidTaskDetails &&
		typeof snapshot.remainingTaskCount === 'number' &&
		Number.isSafeInteger(snapshot.remainingTaskCount) &&
		snapshot.remainingTaskCount >= 0 &&
		Array.isArray(tasks) &&
		tasks.every(isFocusWidgetTask) &&
		// A focus task must exist exactly when the mirrored queue is not empty.
		(hasFocusTask ? tasks.length > 0 : tasks.length === 0)
	);
}

export async function readFocusWidgetAccountId(): Promise<string | null> {
	return AsyncStorage.getItem(FOCUS_WIDGET_ACCOUNT_KEY);
}

export async function writeFocusWidgetAccountId(
	userId: string | null
): Promise<void> {
	await AsyncStorage.setItem(FOCUS_WIDGET_ACCOUNT_KEY, userId ?? '');
}

export async function readFocusWidgetSnapshot(): Promise<FocusWidgetSnapshot | null> {
	const accountId = await readFocusWidgetAccountId();
	if (!accountId) return null;

	const storedSnapshot = await AsyncStorage.getItem(
		FOCUS_WIDGET_SNAPSHOT_KEY
	);
	if (!storedSnapshot) return null;

	let parsedSnapshot: unknown;
	try {
		parsedSnapshot = JSON.parse(storedSnapshot);
	} catch (error) {
		console.warn('Invalid focus widget snapshot JSON:', error);
		return null;
	}

	if (!isFocusWidgetSnapshot(parsedSnapshot)) {
		console.warn('Invalid focus widget snapshot data.');
		return null;
	}

	return parsedSnapshot.userId === accountId ? parsedSnapshot : null;
}

export async function writeFocusWidgetSnapshot(
	snapshot: FocusWidgetSnapshot
): Promise<void> {
	await AsyncStorage.setItem(
		FOCUS_WIDGET_SNAPSHOT_KEY,
		JSON.stringify(snapshot)
	);
}

export async function clearFocusWidgetSnapshot(): Promise<void> {
	await AsyncStorage.removeItem(FOCUS_WIDGET_SNAPSHOT_KEY);
}
