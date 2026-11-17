import { HomeTask } from '@/features/tasks/tasks.types';

/**
 * The Calendar is a view of the global Home task queue. Its sorting and
 * filtering are local to this screen and never modify the Home queue.
 */

/** Normalize a deadline value to a `YYYY-MM-DD` date string (first 10 chars). */
function normalizeDate(value: string | null): string | null {
	if (!value) return null;
	const datePart = value.slice(0, 10);
	return parseDeadlineDate(datePart) !== null ? datePart : null;
}

/**
 * Filter the globally ordered task queue to only the tasks applicable to the
 * selected date.
 *
 * A task is shown if it has no deadline (still applicable) or its deadline is
 * on/after the selected date. The relative order of the remaining tasks is
 * preserved — this function never reorders or re-sorts. The Hero Task, if it
 * qualifies, stays at the top (it is already first in the global queue).
 */
export function filterTasksByDate(
	tasks: HomeTask[],
	selectedDate: string
): HomeTask[] {
	return tasks.filter((task) => {
		const deadline = normalizeDate(task.deadline);
		if (!deadline) return true;
		return deadline >= selectedDate;
	});
}

export type CalendarSortCriteria =
	| 'manual'
	| 'priority'
	| 'deadline'
	| 'category'
	| 'createdAt';

const PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = {
	high: 0,
	medium: 1,
	low: 2,
};

function getPriorityRank(priority: unknown): number | null {
	if (
		priority === 'high' ||
		priority === 'medium' ||
		priority === 'low'
	) {
		return PRIORITY_RANK[priority];
	}
	return null;
}

function parseDeadlineDate(value: string | null): number | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
		value?.slice(0, 10) ?? ''
	);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const daysInMonth = [
		31,
		isLeapYear ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31,
	][month - 1];

	if (!daysInMonth || day < 1 || day > daysInMonth) return null;
	return year * 10000 + month * 100 + day;
}

function parseCreatedAt(value: string | null | undefined): number | null {
	if (!value) return null;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : null;
}

function compareOptionalNumbers(
	first: number | null,
	second: number | null,
	direction: 1 | -1 = 1
): number {
	if (first === null) return second === null ? 0 : 1;
	if (second === null) return -1;
	return direction * (first - second);
}

/** Sort a copy of the Calendar's task view without changing queue order. */
export function sortCalendarTasks(
	tasks: readonly HomeTask[],
	criteria: CalendarSortCriteria
): HomeTask[] {
	if (criteria === 'manual') return [...tasks];

	return tasks
		.map((task, index) => ({ task, index }))
		.sort((first, second) => {
			let comparison = 0;
			switch (criteria) {
				case 'priority':
					comparison = compareOptionalNumbers(
						getPriorityRank(first.task.priority),
						getPriorityRank(second.task.priority)
					);
					break;
				case 'deadline':
					comparison = compareOptionalNumbers(
						parseDeadlineDate(first.task.deadline),
						parseDeadlineDate(second.task.deadline)
					);
					break;
				case 'createdAt':
					comparison = compareOptionalNumbers(
						parseCreatedAt(first.task.createdAt),
						parseCreatedAt(second.task.createdAt),
						-1
					);
					break;
				case 'category': {
					const firstCategory =
						typeof first.task.categoryName === 'string'
							? first.task.categoryName
							: '';
					const secondCategory =
						typeof second.task.categoryName === 'string'
							? second.task.categoryName
							: '';
					comparison = firstCategory.localeCompare(secondCategory);
					break;
				}
			}
			return comparison || first.index - second.index;
		})
		.map(({ task }) => task);
}

/**
 * The available Calendar filter criteria. These only determine which tasks
 * remain visible after the view-level sort.
 */
export type CalendarFilterCriteria = CalendarSortCriteria;

/**
 * Filter the tasks by the given criterion + value, preserving their relative
 * order. This never reorders the tasks.
 *
 * - 'manual'   → no filter (show all tasks).
 * - 'category' → keep tasks whose category name matches `value`.
 * - 'priority' → keep tasks whose priority matches `value`.
 * - 'deadline' → keep tasks whose deadline is on/after `value` (YYYY-MM-DD).
 * - 'createdAt'→ keep tasks created on/after `value` (YYYY-MM-DD).
 *
 * A missing/null value behaves like 'manual' (no filtering) for that criterion.
 */
export function filterTasks(
	tasks: HomeTask[],
	criteria: CalendarFilterCriteria,
	value: string | null
): HomeTask[] {
	if (!value) return tasks;
	switch (criteria) {
		case 'category':
			return tasks.filter((t) => t.categoryName === value);
		case 'priority':
			return tasks.filter((t) => t.priority === value);
		case 'deadline':
			return tasks.filter((t) => {
				const deadline = normalizeDate(t.deadline);
				return !!deadline && deadline >= value;
			});
		case 'createdAt':
			return tasks.filter((t) => {
				const createdAt =
					typeof t.createdAt === 'string'
						? t.createdAt.slice(0, 10)
						: null;
				return (
					!!createdAt &&
					parseDeadlineDate(createdAt) !== null &&
					createdAt >= value
				);
			});
		case 'manual':
		default:
			return tasks;
	}
}
