import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FocusWidgetSnapshot {
	schemaVersion: 1;
	userId: string;
	focusTaskId: string | null;
	focusTaskTitle: string | null;
	remainingTaskCount: number;
}

const FOCUS_WIDGET_SNAPSHOT_KEY = 'unti-unti:focus-widget:snapshot:v1';
const FOCUS_WIDGET_ACCOUNT_KEY = 'unti-unti:focus-widget:account:v1';

function isFocusWidgetSnapshot(value: unknown): value is FocusWidgetSnapshot {
	if (typeof value !== 'object' || value === null) return false;

	const snapshot = value as Record<string, unknown>;
	const hasFocusTask =
		typeof snapshot.focusTaskId === 'string' &&
		typeof snapshot.focusTaskTitle === 'string';
	const hasNoFocusTask =
		snapshot.focusTaskId === null && snapshot.focusTaskTitle === null;

	return (
		snapshot.schemaVersion === 1 &&
		typeof snapshot.userId === 'string' &&
		snapshot.userId.length > 0 &&
		(hasFocusTask || hasNoFocusTask) &&
		typeof snapshot.remainingTaskCount === 'number' &&
		Number.isSafeInteger(snapshot.remainingTaskCount) &&
		snapshot.remainingTaskCount >= 0 &&
		(hasFocusTask || snapshot.remainingTaskCount === 0)
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
