import { supabase } from '../../lib/supabase';
import { withClockSkewRetry } from '@/lib/auth-errors';

const PERSONAL_LIST_TITLE = 'Personal To-Do List';

export interface CollaborativeListTask {
	id: string;
	title: string;
	description: string | null;
	status: string;
	position: number | null;
	createdAt: string;
}

export interface CollaborativeListMember {
	id: string;
	userId: string;
	username: string | null;
	displayName: string | null;
	addedAt: string;
}

export interface CollaborativeListSummary {
	id: string;
	title: string;
	description: string | null;
	isOwner: boolean;
	tasks: CollaborativeListTask[];
	members: CollaborativeListMember[];
}

export interface CreateCollaborativeListInput {
	title: string;
	description: string | null;
}

export interface CreateCollaborativeTaskInput {
	title: string;
	description: string | null;
}

export interface UpdateCollaborativeTaskInput {
	title: string;
	description: string | null;
}

export interface CollaborativeTaskSnapshot {
	title: string;
	description: string | null;
	status: string;
	completedDate: string | null;
	completedTime: string | null;
	isFocus: boolean;
}

export interface AddCollaboratorResult {
	added: boolean;
	userId: string | null;
}

function todayDateString(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function nowTimeString(): string {
	return new Date().toTimeString().slice(0, 8);
}

export async function createCollaborativeList(
	input: CreateCollaborativeListInput
): Promise<void> {
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

	const { error } = await supabase.from('lists').insert({
		owner_id: user.id,
		title: input.title,
		description: input.description,
		is_collaborative: true,
	});

	if (error) {
		console.error('Failed to create collaborative list:', error.message);
		throw error;
	}
}

export async function createCollaborativeTask(
	listId: string,
	input: CreateCollaborativeTaskInput
): Promise<string> {
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

	const { data, error } = await supabase
		.from('tasks')
		.insert({
			title: input.title.trim(),
			description: input.description?.trim() || null,
			status: 'pending',
			is_focus: false,
			priority: 'medium',
			user_id: user.id,
			list_id: listId,
		})
		.select('task_id')
		.single();

	if (error) {
		console.error('Failed to create collaborative task:', error.message);
		if (error.code === '42501') {
			throw new Error(
				'You do not have access to add tasks to this list.'
			);
		}
		if (error.code === 'P0002') {
			throw new Error('This collaborative list could not be found.');
		}
		throw new Error('Could not add the task. Please try again.');
	}

	return data.task_id;
}

async function getCollaborativeTaskSnapshot(
	listId: string,
	taskId: string
): Promise<CollaborativeTaskSnapshot> {
	const { data, error } = await supabase
		.from('tasks')
		.select(
			'title, description, status, completed_date, completed_time, is_focus'
		)
		.eq('task_id', taskId)
		.eq('list_id', listId)
		.single();

	if (error) {
		console.error(
			'Failed to read collaborative task before update:',
			error.message
		);
		throw error;
	}

	return {
		title: data.title,
		description: data.description,
		status: data.status,
		completedDate: data.completed_date,
		completedTime: data.completed_time,
		isFocus: data.is_focus,
	};
}

export async function restoreCollaborativeTask(
	listId: string,
	taskId: string,
	snapshot: CollaborativeTaskSnapshot
): Promise<void> {
	const { data, error } = await supabase
		.from('tasks')
		.update({
			title: snapshot.title,
			description: snapshot.description,
			status: snapshot.status,
			completed_date: snapshot.completedDate,
			completed_time: snapshot.completedTime,
			is_focus: snapshot.isFocus,
		})
		.eq('task_id', taskId)
		.eq('list_id', listId)
		.select('task_id')
		.maybeSingle();

	if (error) {
		console.error(
			'Failed to undo collaborative task change:',
			error.message
		);
		throw error;
	}
	if (!data) {
		throw new Error('This task is no longer available to undo.');
	}
}

export async function updateCollaborativeTask(
	listId: string,
	taskId: string,
	input: UpdateCollaborativeTaskInput
): Promise<CollaborativeTaskSnapshot> {
	const snapshot = await getCollaborativeTaskSnapshot(listId, taskId);
	const { data, error } = await supabase
		.from('tasks')
		.update({
			title: input.title.trim(),
			description: input.description?.trim() || null,
		})
		.eq('task_id', taskId)
		.eq('list_id', listId)
		.select('task_id')
		.maybeSingle();

	if (error) {
		console.error('Failed to update collaborative task:', error.message);
		throw error;
	}
	if (!data) {
		const missingTaskError = new Error(
			'Task could not be updated. It may have been deleted or you may not have access.'
		);
		console.error(missingTaskError.message);
		throw missingTaskError;
	}
	return snapshot;
}

export async function setCollaborativeTaskStatus(
	listId: string,
	taskId: string,
	status: 'completed' | 'pending'
): Promise<CollaborativeTaskSnapshot> {
	const snapshot = await getCollaborativeTaskSnapshot(listId, taskId);
	const completed = status === 'completed';
	const { data, error } = await supabase
		.from('tasks')
		.update({
			status,
			completed_date: completed ? todayDateString() : null,
			completed_time: completed ? nowTimeString() : null,
			is_focus: false,
		})
		.eq('task_id', taskId)
		.eq('list_id', listId)
		.select('task_id')
		.maybeSingle();

	if (error) {
		console.error(
			'Failed to update collaborative task status:',
			error.message
		);
		throw error;
	}
	if (!data) {
		const missingTaskError = new Error(
			'Task status could not be changed. It may have been deleted or you may not have access.'
		);
		console.error(missingTaskError.message);
		throw missingTaskError;
	}
	return snapshot;
}

export async function deleteCollaborativeTask(
	listId: string,
	taskId: string
): Promise<void> {
	const { data, error } = await supabase
		.from('tasks')
		.delete()
		.eq('task_id', taskId)
		.eq('list_id', listId)
		.select('task_id')
		.maybeSingle();

	if (error) {
		console.error('Failed to delete collaborative task:', error.message);
		throw error;
	}
	if (!data) {
		const missingTaskError = new Error(
			'Task could not be deleted. It may have already been removed or you may not have access.'
		);
		console.error(missingTaskError.message);
		throw missingTaskError;
	}
}

export async function deleteCollaborativeList(listId: string): Promise<void> {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError) {
		console.error(
			'Failed to verify collaborative-list owner:',
			userError.message
		);
		throw userError;
	}
	if (!user) {
		throw new Error('User not authenticated');
	}

	const { data, error } = await supabase
		.from('lists')
		.delete()
		.eq('list_id', listId)
		.eq('owner_id', user.id)
		.eq('is_collaborative', true)
		.select('list_id')
		.maybeSingle();

	if (error) {
		console.error('Failed to delete collaborative list:', error.message);
		throw error;
	}
	if (!data) {
		throw new Error(
			'Only the creator can delete this collaborative list, or it no longer exists.'
		);
	}
}

export async function leaveCollaborativeList(listId: string): Promise<void> {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError) {
		console.error(
			'Failed to verify collaborative-list member:',
			userError.message
		);
		throw userError;
	}
	if (!user) {
		throw new Error('User not authenticated');
	}

	const { data: membership, error: membershipError } = await supabase
		.from('list_members')
		.select('id')
		.eq('list_id', listId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (membershipError) {
		console.error(
			'Failed to check collaborative-list membership:',
			membershipError.message
		);
		throw membershipError;
	}
	if (!membership) {
		throw new Error(
			'Your account is not a member of this collaborative list.'
		);
	}

	const { error: deleteError } = await supabase
		.from('list_members')
		.delete()
		.eq('id', membership.id)
		.eq('list_id', listId)
		.eq('user_id', user.id);

	if (deleteError) {
		console.error(
			'Failed to leave collaborative list:',
			deleteError.message
		);
		throw deleteError;
	}

	const { data: remainingMembership, error: verificationError } =
		await supabase
			.from('list_members')
			.select('id')
			.eq('list_id', listId)
			.eq('user_id', user.id)
			.maybeSingle();

	if (verificationError) {
		console.error(
			'Failed to verify collaborative-list departure:',
			verificationError.message
		);
		throw verificationError;
	}
	if (remainingMembership) {
		const policyError = new Error(
			'Supabase did not remove your membership. Check that the list_members DELETE policy allows authenticated users to delete their own row (user_id = auth.uid()).'
		);
		console.error(policyError.message);
		throw policyError;
	}
}

export async function addCollaboratorByUsername(
	listId: string,
	username: string
): Promise<AddCollaboratorResult> {
	const normalizedUsername = username.trim().toLowerCase();
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

	const creatorUsername = user.user_metadata?.username;
	if (
		typeof creatorUsername === 'string' &&
		creatorUsername.trim().toLowerCase() === normalizedUsername
	) {
		throw new Error(
			'You cannot add yourself; you are already the creator of this list.'
		);
	}

	const { data, error } = await supabase.rpc('add_collaborator_by_username', {
		target_list_id: listId,
		target_username: normalizedUsername,
	});

	if (error) {
		if (error.code === '42501') {
			console.error(
				'Failed to add collaborative-list member:',
				error.message
			);
			throw new Error('Only the list creator can add members.');
		}
		if (error.code === 'P0002') {
			if (error.message.toLowerCase().includes('collaborative list')) {
				throw new Error('This collaborative list could not be found.');
			}
			throw new Error(
				'This user was not found. Check the username and confirm it is saved in their profile.'
			);
		}
		if (error.code === '22023') {
			if (error.message.toLowerCase().includes('creator')) {
				throw new Error(
					'You cannot add yourself; you are already the creator of this list.'
				);
			}
			throw new Error('Enter a valid username and try again.');
		}
		console.error(
			'Failed to add collaborative-list member:',
			error.message
		);
		throw new Error('Could not add that user. Please try again.');
	}

	const { data: members, error: membersError } = await supabase.rpc(
		'get_collaborative_list_members',
		{ target_list_ids: [listId] }
	);

	if (membersError) {
		console.error(
			'Failed to identify collaborative-list member for Undo:',
			membersError.message
		);
		throw new Error(
			data
				? 'The user was added, but Undo could not be prepared. Refresh the list and try again.'
				: 'Could not verify the existing member. Please try again.'
		);
	}

	const member = members?.find(
		(candidate: { username: string | null; user_id: string }) =>
			candidate.username?.toLowerCase() === normalizedUsername
	);
	if (!member) {
		throw new Error(
			data
				? 'The user was added, but their membership could not be identified for Undo.'
				: 'Could not verify the existing member. Please try again.'
		);
	}

	return {
		added: data,
		userId: data ? member.user_id : null,
	};
}

export async function removeCollaborator(
	listId: string,
	userId: string
): Promise<void> {
	const { data, error } = await supabase.rpc(
		'remove_collaborative_list_member',
		{
			target_list_id: listId,
			target_user_id: userId,
		}
	);

	if (error) {
		console.error(
			'Failed to remove collaborative-list member:',
			error.message
		);
		if (error.code === '42501') {
			throw new Error('Only the list creator can remove members.');
		}
		if (error.code === 'P0002') {
			throw new Error(
				'This member or collaborative list no longer exists.'
			);
		}
		throw new Error('Could not remove this member. Please try again.');
	}
	if (!data) {
		throw new Error('This user is no longer a member of the list.');
	}
}

/**
 * Fetch collaborative lists visible to the signed-in user and their tasks.
 * Row-level security on both tables controls which lists and tasks are returned.
 */
export async function fetchCollaborativeLists(): Promise<
	CollaborativeListSummary[]
> {
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

	const { data: lists, error: listsError } = await supabase
		.from('lists')
		.select('list_id, title, description, owner_id')
		.eq('is_collaborative', true)
		.order('created_at', { ascending: true });

	if (listsError) {
		console.error(
			'Failed to fetch collaborative lists:',
			listsError.message
		);
		throw listsError;
	}

	const visibleLists = lists ?? [];
	if (visibleLists.length === 0) return [];

	const listIds = visibleLists.map((list) => list.list_id);
	const { data: tasks, error: tasksError } = await supabase
		.from('tasks')
		.select(
			'task_id, list_id, title, description, status, position, created_at'
		)
		.in('list_id', listIds)
		.order('created_at', { ascending: true });

	if (tasksError) {
		console.error(
			'Failed to fetch collaborative list tasks:',
			tasksError.message
		);
		throw tasksError;
	}

	const ownedListIds = visibleLists
		.filter((list) => list.owner_id === user.id)
		.map((list) => list.list_id);
	let membersByList = new Map<string, CollaborativeListMember[]>();

	if (ownedListIds.length > 0) {
		const { data: members, error: membersError } = await supabase.rpc(
			'get_collaborative_list_members',
			{ target_list_ids: ownedListIds }
		);

		if (membersError) {
			console.error(
				'Failed to fetch collaborative-list members:',
				membersError.message
			);
			throw membersError;
		}

		membersByList = new Map<string, CollaborativeListMember[]>();
		for (const member of members ?? []) {
			const listMembers = membersByList.get(member.list_id) ?? [];
			listMembers.push({
				id: member.membership_id,
				userId: member.user_id,
				username: member.username,
				displayName: member.display_name,
				addedAt: member.added_at,
			});
			membersByList.set(member.list_id, listMembers);
		}
	}

	const tasksByList = new Map<string, CollaborativeListTask[]>();
	for (const task of tasks ?? []) {
		if (!task.list_id) continue;
		const listTasks = tasksByList.get(task.list_id) ?? [];
		listTasks.push({
			id: task.task_id,
			title: task.title,
			description: task.description,
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
		isOwner: list.owner_id === user.id,
		members: membersByList.get(list.list_id) ?? [],
		tasks: (tasksByList.get(list.list_id) ?? []).sort((first, second) => {
			const completionOrder =
				Number(first.status === 'completed') -
				Number(second.status === 'completed');
			return (
				completionOrder ||
				first.createdAt.localeCompare(second.createdAt) ||
				first.id.localeCompare(second.id)
			);
		}),
	}));
}

/**
 * Return the signed-in user's personal list, creating it on first task creation.
 * Existing personal tasks without a list are attached to it during the same
 * initialization so they remain part of the user's personal list.
 */
export async function ensurePersonalList(): Promise<string> {
	return withClockSkewRetry(resolvePersonalList);
}

async function resolvePersonalList(): Promise<string> {
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
			console.error(
				'Failed to create personal list:',
				createError.message
			);
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
