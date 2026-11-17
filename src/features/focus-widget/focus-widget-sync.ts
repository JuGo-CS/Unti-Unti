import { createElement } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { requestWidgetUpdate } from 'react-native-android-widget';
import { fetchPendingTaskQueue } from '@/features/tasks/tasks.api';
import { supabase } from '@/lib/supabase';
import { FOCUS_WIDGET_NAME, FocusWidget } from './focus-widget';
import {
	clearFocusWidgetSnapshot,
	readFocusWidgetAccountId,
	readFocusWidgetSnapshot,
	writeFocusWidgetAccountId,
	writeFocusWidgetSnapshot,
	type FocusWidgetSnapshot,
	type FocusWidgetTask,
} from './focus-widget-snapshot';

let activeUserId: string | null = null;
let accountGeneration = 0;
let latestSyncRequest = 0;
let snapshotOperationQueue: Promise<void> = Promise.resolve();

export function isFocusWidgetSupported(): boolean {
	return Platform.OS === 'android' && Constants.expoVersion === null;
}

function serializeSnapshotOperation<T>(
	operation: () => Promise<T>
): Promise<T> {
	const result = snapshotOperationQueue.then(operation, operation);
	snapshotOperationQueue = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

function isCurrentAccount(userId: string, generation: number): boolean {
	return activeUserId === userId && accountGeneration === generation;
}

function isCurrentRequest(
	userId: string,
	generation: number,
	requestId: number
): boolean {
	return (
		isCurrentAccount(userId, generation) && latestSyncRequest === requestId
	);
}

async function getAuthenticatedUserId(): Promise<string | null> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();

	if (error) throw error;
	return session?.user.id ?? null;
}

function taskListsEqual(
	left: FocusWidgetTask[],
	right: FocusWidgetTask[]
): boolean {
	if (left.length !== right.length) return false;
	return left.every((task, index) => {
		const other = right[index];
		return (
			task.id === other.id &&
			task.title === other.title &&
			(task.description ?? null) === (other.description ?? null) &&
			(task.deadline ?? null) === (other.deadline ?? null) &&
			(task.deadlineTime ?? null) === (other.deadlineTime ?? null)
		);
	});
}

function snapshotsEqual(
	left: FocusWidgetSnapshot | null,
	right: FocusWidgetSnapshot
): boolean {
	return (
		left?.schemaVersion === right.schemaVersion &&
		left.userId === right.userId &&
		left.focusTaskId === right.focusTaskId &&
		left.focusTaskTitle === right.focusTaskTitle &&
		(left.focusTaskDescription ?? null) ===
			(right.focusTaskDescription ?? null) &&
		(left.focusTaskDeadline ?? null) ===
			(right.focusTaskDeadline ?? null) &&
		(left.focusTaskDeadlineTime ?? null) ===
			(right.focusTaskDeadlineTime ?? null) &&
		left.remainingTaskCount === right.remainingTaskCount &&
		taskListsEqual(left.tasks, right.tasks)
	);
}

async function requestCurrentWidgetUpdate(): Promise<void> {
	await requestWidgetUpdate({
		widgetName: FOCUS_WIDGET_NAME,
		renderWidget: async ({ width, height }) => {
			const snapshot = await readFocusWidgetSnapshot();
			const currentSnapshot =
				snapshot?.userId === activeUserId ? snapshot : null;
			return createElement(FocusWidget, {
				snapshot: currentSnapshot,
				widgetWidth: width,
				widgetHeight: height,
			});
		},
	});
}

export function setFocusWidgetAccount(userId: string | null): Promise<void> {
	if (!isFocusWidgetSupported()) return Promise.resolve();

	activeUserId = userId;
	const generation = ++accountGeneration;
	latestSyncRequest += 1;

	return serializeSnapshotOperation(async () => {
		if (generation !== accountGeneration || activeUserId !== userId) return;

		const previousAccountId = await readFocusWidgetAccountId();
		if (generation !== accountGeneration || activeUserId !== userId) return;

		// Write the account ID first (needed for readFocusWidgetSnapshot validation)
		if (previousAccountId !== (userId ?? '')) {
			await writeFocusWidgetAccountId(userId);
		}
		if (generation !== accountGeneration || activeUserId !== userId) return;

		// REMOVED: Early return that skipped sync if snapshot existed for user.
		// That caused stale snapshots to persist. Always trigger a fresh sync.
		// REMOVED: clearFocusWidgetSnapshot() before sync - it caused a flash of
		// "All done for now!" because requestCurrentWidgetUpdate would read null.
		// The synchronizeFocusWidget call after this will write the correct snapshot.

		try {
			await requestCurrentWidgetUpdate();
		} catch (error) {
			console.error('Failed to update the focus widget account:', error);
		}
	});
}

export async function synchronizeFocusWidget(userId: string): Promise<void> {
	if (!isFocusWidgetSupported() || activeUserId !== userId) return;

	const generation = accountGeneration;
	const requestId = ++latestSyncRequest;

	if ((await getAuthenticatedUserId()) !== userId) return;
	if (!isCurrentRequest(userId, generation, requestId)) return;

	const tasks = await fetchPendingTaskQueue();
	if (!isCurrentRequest(userId, generation, requestId)) return;
	if ((await getAuthenticatedUserId()) !== userId) return;
	if (!isCurrentRequest(userId, generation, requestId)) return;

	const focusTask = tasks.find((task) => task.isFocus) ?? tasks[0] ?? null;
	// Mirror the whole queue, hero first, so the widget can show the next
	// tasks even when the focus task is momentarily missing.
	const widgetTasks: FocusWidgetTask[] = [
		...(focusTask ? [focusTask] : []),
		...tasks.filter((task) => task.id !== focusTask?.id),
	].map((task) => ({
		id: task.id,
		title: task.title,
		description: task.description ?? null,
		deadline: task.deadline ?? null,
		deadlineTime: task.deadlineTime ?? null,
	}));
	const snapshot: FocusWidgetSnapshot = {
		schemaVersion: 2,
		userId,
		focusTaskId: focusTask?.id ?? null,
		focusTaskTitle: focusTask?.title ?? null,
		focusTaskDescription: focusTask?.description ?? null,
		focusTaskDeadline: focusTask?.deadline ?? null,
		focusTaskDeadlineTime: focusTask?.deadlineTime ?? null,
		remainingTaskCount: Math.max(0, tasks.length - 1),
		tasks: widgetTasks,
	};

	await serializeSnapshotOperation(async () => {
		if (!isCurrentRequest(userId, generation, requestId)) return;
		if ((await getAuthenticatedUserId()) !== userId) return;
		if (!isCurrentRequest(userId, generation, requestId)) return;
		if ((await readFocusWidgetAccountId()) !== userId) return;

		const previousSnapshot = await readFocusWidgetSnapshot();
		if (!isCurrentRequest(userId, generation, requestId)) return;
		if (snapshotsEqual(previousSnapshot, snapshot)) return;

		await writeFocusWidgetSnapshot(snapshot);
		if (!isCurrentAccount(userId, generation)) {
			await clearFocusWidgetSnapshot();
			return;
		}
		if (latestSyncRequest !== requestId) return;

		await requestCurrentWidgetUpdate();
	});
}
