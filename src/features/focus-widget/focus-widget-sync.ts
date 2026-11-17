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
		left.remainingTaskCount === right.remainingTaskCount
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

		if (userId && previousAccountId === userId) {
			const snapshot = await readFocusWidgetSnapshot();
			if (generation !== accountGeneration || activeUserId !== userId) {
				return;
			}
			if (snapshot?.userId === userId) return;
		}

		if (previousAccountId !== (userId ?? '')) {
			await writeFocusWidgetAccountId(userId);
		}
		if (generation !== accountGeneration || activeUserId !== userId) return;

		await clearFocusWidgetSnapshot();
		if (generation !== accountGeneration || activeUserId !== userId) return;

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
	const snapshot: FocusWidgetSnapshot = {
		schemaVersion: 1,
		userId,
		focusTaskId: focusTask?.id ?? null,
		focusTaskTitle: focusTask?.title ?? null,
		focusTaskDescription: focusTask?.description ?? null,
		focusTaskDeadline: focusTask?.deadline ?? null,
		focusTaskDeadlineTime: focusTask?.deadlineTime ?? null,
		remainingTaskCount: focusTask ? tasks.length - 1 : 0,
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
