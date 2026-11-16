export interface TaskDeadlineReminder {
	deadlineDate: string;
	triggerAt: Date;
}

export function getUpcomingTaskDeadlineReminders(
	deadlines: readonly (string | null | undefined)[],
	now: Date
): TaskDeadlineReminder[] {
	const reminders = new Map<string, Date>();

	for (const deadline of deadlines) {
		const match = deadline?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) continue;

		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		const parsedDeadline = new Date(year, month - 1, day);

		if (
			parsedDeadline.getFullYear() !== year ||
			parsedDeadline.getMonth() !== month - 1 ||
			parsedDeadline.getDate() !== day
		) {
			continue;
		}

		// const triggerAt = new Date(year, month - 1, day - 1, 12, 0, 0, 0);
		const triggerAt = new Date(year, month - 1, day - 1, 23, 45, 0, 0);
		if (triggerAt <= now) continue;

		const deadlineDate = `${match[1]}-${match[2]}-${match[3]}`;
		reminders.set(deadlineDate, triggerAt);
	}

	return Array.from(reminders, ([deadlineDate, triggerAt]) => ({
		deadlineDate,
		triggerAt,
	})).sort((first, second) =>
		first.deadlineDate.localeCompare(second.deadlineDate)
	);
}
