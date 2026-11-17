import { supabase } from '../../lib/supabase';
import { getCategoryIconName } from '@/utils/category-icon';
import { ensurePersonalList } from '@/features/lists/lists.api';
import { emitTaskDeadlineChanged } from '@/lib/data-events';
import {
	TreasureLog,
	TreasureGroup,
	Category,
	TreasureEditPayload,
} from './treasures.types';

export type { Category, TreasureLog, TreasureGroup, TreasureEditPayload };

/** Today's date as `YYYY-MM-DD` in local time, matching `completed_date`. */
function todayDateString(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Current time as `HH:MM:SS` in local time, matching `completed_time`. */
function nowTimeString(): string {
	return new Date().toTimeString().slice(0, 8);
}

/**
 * Raw shape of a row from the `tasks` table (joined with its category).
 * Column names match the Supabase schema exactly — we do not modify the schema.
 */
interface CompletedTaskRow {
	task_id: string;
	cat_id: string | null;
	title: string;
	description: string | null;
	status: string;
	priority: string | null;
	deadline: string | null;
	position: number | null;
	completed_date: string | null;
	completed_time: string | null;
	created_at: string;
	// UBAC fields
	user_id: string;
	list_id: string | null;
	// Joined from `categories` via cat_id
	categories?: { emoji_holder: string | null } | null;
}

/** Format a `YYYY-MM-DD` date into a friendly label like "September 9, 2026". */
function formatDateLabel(dateStr: string): string {
	const [year, month, day] = dateStr.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});
}

/** Convert a raw completed task row into a `TreasureLog`. */
function toTreasureLog(row: CompletedTaskRow): TreasureLog {
	return {
		id: row.task_id,
		title: row.title,
		description: row.description,
		catId: row.cat_id,
		userId: row.user_id,
		listId: row.list_id,
		iconName: getCategoryIconName(row.categories?.emoji_holder),
		status: row.status === 'pending' ? 'pending' : 'completed',
		deadline: row.deadline ? row.deadline.slice(0, 10) : null,
		priority: row.priority,
		position: row.position,
		createdAt: row.created_at,
		completedDate: row.completed_date ?? '',
		completedTime: row.completed_time ?? '',
	};
}

/**
 * Fetch all completed tasks and group them by completion date, newest first.
 *
 * Each group is ordered by its date descending, and the logs within a group are
 * ordered by completion time descending. This mirrors the Wins screen's grouped,
 * day-by-day layout. The completed tasks are not deleted — they stay in the
 * `tasks` table for history, and are grouped here by their `completed_date`.
 */
export async function fetchTreasureGroups(): Promise<TreasureGroup[]> {
	const listId = await ensurePersonalList();
	const { data, error } = await supabase
		.from('tasks')
		.select('*, categories(emoji_holder)')
		.eq('status', 'completed')
		.eq('list_id', listId)
		.not('completed_date', 'is', null)
		.order('completed_date', { ascending: false })
		.order('completed_time', { ascending: false });

	if (error) {
		console.error('Failed to fetch completed tasks:', error.message);
		throw error;
	}

	const rows = (data ?? []) as unknown as CompletedTaskRow[];
	const logs = rows.map(toTreasureLog);

	// Group logs by their completion date, preserving the newest-first order.
	const groups = new Map<string, TreasureLog[]>();
	for (const log of logs) {
		const group = groups.get(log.completedDate);
		if (group) {
			group.push(log);
		} else {
			groups.set(log.completedDate, [log]);
		}
	}

	return Array.from(groups.entries()).map(([date, groupLogs]) => ({
		date,
		label: formatDateLabel(date),
		logs: groupLogs,
	}));
}

/**
 * Update the title of a completed task log ("Treasure").
 *
 * The completed task stays in the `tasks` table; only its title is edited.
 * This keeps the edit action persistent across app reloads.
 */
export async function updateTreasureTitle(
	taskId: string,
	title: string
): Promise<void> {
	const { error } = await supabase
		.from('tasks')
		.update({ title })
		.eq('task_id', taskId);

	if (error) {
		console.error('Failed to update treasure title:', error.message);
		throw error;
	}
}

/**
 * Delete a completed task log ("Treasure") from the `tasks` table.
 *
 * This permanently removes the task record. Use with care — the completion
 * history is not recoverable once deleted.
 */
export async function deleteTreasure(taskId: string): Promise<void> {
	const { error } = await supabase
		.from('tasks')
		.delete()
		.eq('task_id', taskId);

	if (error) {
		console.error('Failed to delete treasure:', error.message);
		throw error;
	}

	emitTaskDeadlineChanged();
}

/**
 * Restore a previously deleted completed task ("Treasure") with its original
 * completion data. Used to undo a deletion from the Wins tab.
 */
export async function restoreTreasure(log: TreasureLog): Promise<void> {
	// Get the current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		console.error('Failed to get current user:', userError?.message);
		throw new Error('User not authenticated');
	}

	const { error } = await supabase.from('tasks').insert({
		task_id: log.id,
		cat_id: log.catId,
		title: log.title,
		description: log.description,
		status: 'completed',
		is_focus: false,
		priority: log.priority,
		deadline: log.deadline,
		position: log.position,
		created_at: log.createdAt,
		completed_date: log.completedDate || null,
		completed_time: log.completedTime || null,
		user_id: log.userId ?? user.id,
		list_id: log.listId ?? null,
	});

	if (error) {
		console.error('Failed to restore treasure:', error.message);
		throw error;
	}
}

/**
 * Fetch all available task categories for the edit form.
 * The user can pick a new category when editing a completed task.
 */
export async function fetchCategories(): Promise<Category[]> {
	// Get the current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		console.error('Failed to get current user:', userError?.message);
		throw new Error('User not authenticated');
	}

	const { data, error } = await supabase
		.from('categories')
		.select('cat_id, cat_name, emoji_holder')
		.order('cat_name', { ascending: true });

	if (error) {
		console.error('Failed to fetch categories:', error.message);
		throw error;
	}

	const rows = (data ?? []) as unknown as {
		cat_id: string;
		cat_name: string;
		emoji_holder: string | null;
	}[];
	return rows.map((row) => ({
		cat_id: row.cat_id,
		cat_name: row.cat_name,
		iconName: getCategoryIconName(row.emoji_holder),
	}));
}

/**
 * Update a completed task ("Treasure") with the edited fields.
 *
 * Reopened tasks rejoin the end of their active queue without focus. Editing an
 * already-pending task preserves its focus and position.
 */
export async function updateTreasure(
	taskId: string,
	payload: TreasureEditPayload
): Promise<void> {
	const { data: currentTask, error: currentTaskError } = await supabase
		.from('tasks')
		.select('status, is_focus, list_id, user_id')
		.eq('task_id', taskId)
		.maybeSingle();

	if (currentTaskError) {
		console.error(
			'Failed to read task before updating:',
			currentTaskError.message
		);
		throw currentTaskError;
	}
	if (!currentTask) {
		throw new Error('Task not found or not accessible');
	}

	const update: Record<string, unknown> = {
		title: payload.title,
		description: payload.description,
		cat_id: payload.cat_id,
		deadline: payload.deadline,
	};
	const wasCompleted = currentTask.status === 'completed';

	if (payload.status === 'pending') {
		update.status = 'pending';
		if (wasCompleted) {
			// Reopened tasks rejoin the end of their existing queue as non-focus.
			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();
			if (userError || !user) {
				console.error('Failed to get current user:', userError?.message);
				throw new Error('User not authenticated');
			}

			let positionQuery = supabase
				.from('tasks')
				.select('position')
				.eq('status', 'pending')
				.not('position', 'is', null);
			positionQuery = currentTask.list_id
				? positionQuery.eq('list_id', currentTask.list_id)
				: positionQuery.eq(
						'user_id',
						currentTask.user_id ?? user.id
					);
			const { data: posRows, error: posError } = await positionQuery;

			if (posError) {
				console.error(
					'Failed to read task positions:',
					posError.message
				);
				throw posError;
			}

			const maxPosition = (posRows ?? []).reduce(
				(max, row) =>
					Math.max(max, (row as { position: number }).position),
				0
			);
			update.completed_date = null;
			update.completed_time = null;
			update.is_focus = false;
			update.position = (posRows ?? []).length > 0 ? maxPosition + 1 : 0;
		} else {
			// Editing an already-pending task must not demote its focus or move it.
			update.is_focus = currentTask.is_focus;
		}
	} else {
		update.status = 'completed';
		update.is_focus = false;

		// Only stamp a completion date/time when the task was NOT already
		// completed — editing an existing completed task must not change its
		// original completion timestamp.
		if (!wasCompleted) {
			update.completed_date = todayDateString();
			update.completed_time = nowTimeString();
		}
	}

	const { error } = await supabase
		.from('tasks')
		.update(update)
		.eq('task_id', taskId);

	if (error) {
		console.error('Failed to update treasure:', error.message);
		throw error;
	}

	if (
		payload.status === 'completed' &&
		!wasCompleted &&
		currentTask.is_focus
	) {
		let nextTaskQuery = supabase
			.from('tasks')
			.select('task_id, is_focus, position, created_at')
			.eq('status', 'pending')
			.neq('task_id', taskId);
		nextTaskQuery = currentTask.list_id
			? nextTaskQuery.eq('list_id', currentTask.list_id)
			: nextTaskQuery.eq('user_id', currentTask.user_id);
		const { data: pendingTasks, error: pendingTasksError } =
			await nextTaskQuery;

		if (pendingTasksError) {
			console.error(
				'Failed to load the next focus task:',
				pendingTasksError.message
			);
			throw pendingTasksError;
		}

		const orderedTasks = (pendingTasks ?? []) as {
			task_id: string;
			is_focus: boolean;
			position: number | null;
			created_at: string;
		}[];
		const nextTask =
			orderedTasks.find((task) => task.is_focus) ??
			orderedTasks.sort((first, second) => {
				if (first.position != null && second.position != null) {
					return first.position - second.position;
				}
				if (first.position != null) return -1;
				if (second.position != null) return 1;
				return first.created_at.localeCompare(second.created_at);
			})[0];

		if (nextTask && !nextTask.is_focus) {
			const { error: promoteError } = await supabase
				.from('tasks')
				.update({ is_focus: true })
				.eq('task_id', nextTask.task_id);
			if (promoteError) {
				console.error(
					'Failed to promote the next focus task:',
					promoteError.message
				);
				throw promoteError;
			}
		}
	}

	emitTaskDeadlineChanged();
}
