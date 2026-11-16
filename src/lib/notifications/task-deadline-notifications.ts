import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fetchPendingTaskQueue } from '@/features/tasks/tasks.api';
import { getUpcomingTaskDeadlineReminders } from './task-deadline-dates';

const FEATURE_KEY = 'unti-unti-task-deadline';
const ANDROID_CHANNEL_ID = 'task-deadline-reminders';
const IOS_PENDING_LIMIT = 64;
const ANDROID_PENDING_LIMIT = 500;
const RESERVED_PENDING_SLOTS = 4;

if (Platform.OS !== 'web') {
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldPlaySound: false,
			shouldSetBadge: false,
			shouldShowBanner: true,
			shouldShowList: true,
		}),
	});
}

let syncPromise: Promise<void> | null = null;
let rerunRequested = false;
let notificationOperationQueue: Promise<void> = Promise.resolve();

export function synchronizeTaskDeadlineNotifications(): Promise<void> {
	if (Platform.OS === 'web') return Promise.resolve();

	if (syncPromise) {
		rerunRequested = true;
		return syncPromise;
	}

	const synchronization = notificationOperationQueue.then(async () => {
		do {
			rerunRequested = false;
			await reconcileTaskDeadlineNotifications();
		} while (rerunRequested);
	});
	notificationOperationQueue = synchronization.catch(() => undefined);
	syncPromise = synchronization.finally(() => {
		syncPromise = null;
	});

	return syncPromise;
}

export async function clearTaskDeadlineNotifications(): Promise<void> {
	if (Platform.OS === 'web') return;

	const clearing = notificationOperationQueue.then(async () => {
		const scheduled =
			await Notifications.getAllScheduledNotificationsAsync();
		for (const notification of scheduled) {
			if (isTaskDeadlineNotification(notification)) {
				await Notifications.cancelScheduledNotificationAsync(
					notification.identifier
				);
			}
		}
	});
	notificationOperationQueue = clearing.catch(() => undefined);
	return clearing;
}

async function reconcileTaskDeadlineNotifications(): Promise<void> {
	const pendingTasks = await fetchPendingTaskQueue();
	const allScheduled =
		await Notifications.getAllScheduledNotificationsAsync();
	const featureScheduled = allScheduled.filter(
		isTaskDeadlineNotification
	);
	const unrelatedCount = allScheduled.length - featureScheduled.length;
	const platformLimit =
		Platform.OS === 'ios'
			? IOS_PENDING_LIMIT
			: ANDROID_PENDING_LIMIT;
	const availableSlots = Math.max(
		0,
		platformLimit - unrelatedCount - RESERVED_PENDING_SLOTS
	);
	const reminders = getUpcomingTaskDeadlineReminders(
		pendingTasks.map((task) => task.deadline),
		new Date()
	).slice(0, availableSlots);

	let permissionGranted = false;
	if (reminders.length > 0) {
		permissionGranted = await requestNotificationPermission();
	}

	const desiredReminders = new Map(
		(permissionGranted ? reminders : []).map((reminder) => [
			reminder.deadlineDate,
			reminder.triggerAt,
		])
	);
	const scheduledByDate = new Map<string, number>();
	const keptDates = new Set<string>();

	for (const notification of featureScheduled) {
		const data = notification.content.data;
		const deadlineDate = data?.deadlineDate;
		const scheduledAt = data?.scheduledAt;
		const desiredTriggerAt =
			typeof deadlineDate === 'string'
				? desiredReminders.get(deadlineDate)
				: undefined;
		const isCurrent =
			typeof deadlineDate === 'string' &&
			typeof scheduledAt === 'number' &&
			desiredTriggerAt?.getTime() === scheduledAt &&
			!keptDates.has(deadlineDate);

		if (isCurrent) {
			keptDates.add(deadlineDate);
			scheduledByDate.set(deadlineDate, scheduledAt);
		} else {
			await Notifications.cancelScheduledNotificationAsync(
				notification.identifier
			);
		}
	}

	for (const [deadlineDate, triggerAt] of desiredReminders) {
		if (scheduledByDate.has(deadlineDate)) continue;

		await Notifications.scheduleNotificationAsync({
			content: {
				title: 'A little reminder 🌱',
				body: "Hey! Tomorrow, you have a task that needs to be finished. You've got this!",
				sound: false,
				data: {
					feature: FEATURE_KEY,
					deadlineDate,
					scheduledAt: triggerAt.getTime(),
				},
			},
			trigger: {
				type: Notifications.SchedulableTriggerInputTypes.DATE,
				date: triggerAt,
				...(Platform.OS === 'android'
					? { channelId: ANDROID_CHANNEL_ID }
					: {}),
			},
		});
	}
}

async function requestNotificationPermission(): Promise<boolean> {
	if (Platform.OS === 'android') {
		await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
			name: 'Task deadline reminders',
			importance: Notifications.AndroidImportance.DEFAULT,
			sound: null,
			enableVibrate: false,
			showBadge: false,
		});
	}

	const currentPermissions = await Notifications.getPermissionsAsync();
	if (hasNotificationPermission(currentPermissions)) return true;
	if (!currentPermissions.canAskAgain) return false;

	const requestedPermissions =
		await Notifications.requestPermissionsAsync({
			ios: {
				allowAlert: true,
				allowBadge: false,
				allowSound: false,
			},
		});
	return hasNotificationPermission(requestedPermissions);
}

function hasNotificationPermission(
	permissions: Notifications.NotificationPermissionsStatus
): boolean {
	return (
		permissions.granted ||
		(Platform.OS === 'ios' &&
			permissions.ios?.status ===
				Notifications.IosAuthorizationStatus.PROVISIONAL)
	);
}

function isTaskDeadlineNotification(
	notification: Notifications.NotificationRequest
): boolean {
	return notification.content.data?.feature === FEATURE_KEY;
}
