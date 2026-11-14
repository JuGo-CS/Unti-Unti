import { supabase } from '../../lib/supabase';

const PERSONAL_LIST_TITLE = 'Personal To-Do List';

export interface CollaborativeListTask {
	id: string;
	title: string;
	status: string;
	position: number | null;
	createdAt: string;
}

export interface CollaborativeListSummary {
	id: string;
	title: string;
	description: string | null;
	tasks: CollaborativeListTask[];
}

/**
 * Fetch collaborative lists visible to the signed-in user and their tasks.
 * Row-level security on both tables controls which lists and tasks are returned.
 */
export async function fetchCollaborativeLists(): Promise<
	CollaborativeListSummary[]
> {
	const { data: lists, error: listsError } = await supabase
		.from('lists')
		.select('list_id, title, description')
		.eq('is_collaborative', true)
		.order('created_at', { ascending: true });

	if (listsError) {
		console.error('Failed to fetch collaborative lists:', listsError.message);
		throw listsError;
	}

	const visibleLists = lists ?? [];
	if (visibleLists.length === 0) return [];

	const listIds = visibleLists.map((list) => list.list_id);
	const { data: tasks, error: tasksError } = await supabase
		.from('tasks')
		.select('task_id, list_id, title, status, position, created_at')
		.in('list_id', listIds)
		.order('position', { ascending: true, nullsFirst: false })
		.order('created_at', { ascending: true });

	if (tasksError) {
		console.error('Failed to fetch collaborative list tasks:', tasksError.message);
		throw tasksError;
	}

	const tasksByList = new Map<string, CollaborativeListTask[]>();
	for (const task of tasks ?? []) {
		if (!task.list_id) continue;
		const listTasks = tasksByList.get(task.list_id) ?? [];
		listTasks.push({
			id: task.task_id,
			title: task.title,
			status: task.status,
			position: task.position,
			createdAt: task.created_at,
		});
		tasksByList.set(task.list_id, listTasks);
	}

	return visibleLists.map((list) => ({
		id: list.list_id,
		title: list.title,
		description: list.description,
		tasks: tasksByList.get(list.list_id) ?? [],
	}));
}

/**
 * Return the signed-in user's personal list, creating it on first task creation.
 * Existing personal tasks without a list are attached to it during the same
 * initialization so they remain part of the user's personal list.
 */
export async function ensurePersonalList(): Promise<string> {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError) {
		console.error('Failed to get current user:', userError.message);
		throw userError;
	}
	if (!user) {
		throw new Error('User not authenticated');
	}

	const { data: existingList, error: listError } = await supabase
		.from('lists')
		.select('list_id')
		.eq('owner_id', user.id)
		.eq('is_collaborative', false)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();

	if (listError) {
		console.error('Failed to find personal list:', listError.message);
		throw listError;
	}

	let listId = existingList?.list_id;

	if (!listId) {
		const { data: createdList, error: createError } = await supabase
			.from('lists')
			.insert({
				owner_id: user.id,
				title: PERSONAL_LIST_TITLE,
				is_collaborative: false,
			})
			.select('list_id')
			.single();

		if (createError) {
			console.error('Failed to create personal list:', createError.message);
			throw createError;
		}
		listId = createdList.list_id;
	}

	const { error: attachError } = await supabase
		.from('tasks')
		.update({ list_id: listId })
		.eq('user_id', user.id)
		.is('list_id', null);

	if (attachError) {
		console.error(
			'Failed to attach existing personal tasks to their list:',
			attachError.message
		);
		throw attachError;
	}

	return listId;
}
