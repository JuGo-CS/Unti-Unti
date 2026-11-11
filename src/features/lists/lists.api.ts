import { supabase } from '../../lib/supabase';

const PERSONAL_LIST_TITLE = 'Personal To-Do List';

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
