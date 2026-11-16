import { supabase } from '../../lib/supabase';

export async function getProfile(userId: string) {
	const { data, error } = await supabase
		.from('profiles')
		.select('username, display_name')
		.eq('id', userId)
		.single();

	return { data, error };
}

export async function updateProfile(
	userId: string,
	updates: { username?: string; display_name?: string }
) {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError) return { data: null, error: userError };
	if (!user || user.id !== userId) {
		return {
			data: null,
			error: new Error('You can only update your own profile.'),
		};
	}

	const authUpdates: Record<string, string> = {};
	if (updates.username !== undefined) {
		authUpdates.username = updates.username.trim().toLowerCase();
	}
	if (updates.display_name !== undefined) {
		authUpdates.display_name = updates.display_name.trim();
	}

	const profileUpdates = { ...updates };
	if (updates.username !== undefined) {
		profileUpdates.username = authUpdates.username;
	}
	if (updates.display_name !== undefined) {
		profileUpdates.display_name = authUpdates.display_name;
	}

	if (Object.keys(authUpdates).length > 0) {
		const { error: authError } = await supabase.auth.updateUser({
			data: authUpdates,
		});
		if (authError) return { data: null, error: authError };
	}

	const { data, error } = await supabase
		.from('profiles')
		.update({
			...profileUpdates,
			updated_at: new Date().toISOString(),
		})
		.eq('id', userId)
		.select('id')
		.maybeSingle();

	if (error || !data) {
		const updateError =
			error ?? new Error('Profile could not be updated. Please try again.');
		let reportedError: Error | typeof updateError = updateError;

		if (Object.keys(authUpdates).length > 0) {
			const rollbackMetadata: Record<string, unknown> = {};
			if (updates.username !== undefined) {
				rollbackMetadata.username = user.user_metadata?.username ?? null;
			}
			if (updates.display_name !== undefined) {
				rollbackMetadata.display_name =
					user.user_metadata?.display_name ?? null;
			}

			const { error: rollbackError } = await supabase.auth.updateUser({
				data: rollbackMetadata,
			});
			if (rollbackError) {
				console.error(
					'Failed to restore profile metadata after profile update failed:',
					rollbackError.message
				);
				reportedError = new Error(
					`${updateError.message} Account metadata could not be restored: ${rollbackError.message}`
				);
			}
		}

		return { data: null, error: reportedError };
	}

	return { data, error: null };
}
