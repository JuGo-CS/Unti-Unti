import { useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Keyboard,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
	addCollaboratorByUsername,
	createCollaborativeTask,
	deleteCollaborativeList,
	deleteCollaborativeTask,
	leaveCollaborativeList,
	removeCollaborator,
	restoreCollaborativeTask,
	setCollaborativeTaskStatus,
	updateCollaborativeTask,
	type CollaborativeTaskSnapshot,
	type CollaborativeListMember,
	type CollaborativeListSummary,
	type CollaborativeListTask,
} from '@/features/lists/lists.api';

const PREVIEW_COUNT = 3;
const sortTasks = (tasks: CollaborativeListTask[]) =>
	[...tasks].sort((first, second) => {
		const completionOrder =
			Number(first.status === 'completed') -
			Number(second.status === 'completed');
		return (
			completionOrder ||
			first.createdAt.localeCompare(second.createdAt) ||
			first.id.localeCompare(second.id)
		);
	});

type ListAction =
	| 'task'
	| 'member'
	| 'editTask'
	| 'deleteTask'
	| 'deleteList'
	| 'leaveList'
	| 'removeMember';

export default function CollaborativeListCard({
	list,
	expanded,
	onToggleExpanded,
	onActionComplete,
	onOptimisticUpdate,
}: {
	list: CollaborativeListSummary;
	expanded: boolean;
	onToggleExpanded: () => void;
	onActionComplete: (
		message: string,
		onUndo?: () => void,
		onExpire?: () => void,
		showToast?: boolean
	) => void;
	onOptimisticUpdate: (
		update: (
			lists: CollaborativeListSummary[]
		) => CollaborativeListSummary[]
	) => void;
}) {
	const [action, setAction] = useState<ListAction | null>(null);
	const [editingTask, setEditingTask] =
		useState<CollaborativeListTask | null>(null);
	const [memberToRemove, setMemberToRemove] =
		useState<CollaborativeListMember | null>(null);
	const [taskTitle, setTaskTitle] = useState('');
	const [taskDescription, setTaskDescription] = useState('');
	const [username, setUsername] = useState('');
	const [membersExpanded, setMembersExpanded] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [taskActionError, setTaskActionError] = useState<string | null>(null);
	const [processingTaskIds, setProcessingTaskIds] = useState<Set<string>>(
		() => new Set()
	);
	const [saving, setSaving] = useState(false);

	const updateList = (update: (current: CollaborativeListSummary) => CollaborativeListSummary) => {
		onOptimisticUpdate((lists) =>
			lists.map((current) => (current.id === list.id ? update(current) : current))
		);
	};

	const restoreTaskLocally = (task: CollaborativeListTask) => {
		updateList((current) => ({
			...current,
			tasks: sortTasks(
				current.tasks.some((item) => item.id === task.id)
					? current.tasks.map((item) =>
							item.id === task.id ? task : item
						)
					: [...current.tasks, task]
			),
		}));
	};

	const updateTaskLocally = (
		taskId: string,
		update: (task: CollaborativeListTask) => CollaborativeListTask
	) => {
		updateList((current) => ({
			...current,
			tasks: sortTasks(
				current.tasks.map((task) =>
					task.id === taskId ? update(task) : task
				)
			),
		}));
	};

	const removeTaskLocally = (taskId: string) => {
		updateList((current) => ({
			...current,
			tasks: current.tasks.filter((task) => task.id !== taskId),
		}));
	};

	const makeUndo = (
		message: string,
		undoLocal: () => void,
		reapplyLocal: () => void,
		operation: () => Promise<void>
	) => () => {
		undoLocal();
		void operation()
			.then(() => onActionComplete(message))
			.catch((error: unknown) => {
				console.error('Failed to undo collaborative-list action:', error);
				reapplyLocal();
				onActionComplete(
					error instanceof Error
						? `Undo failed: ${error.message}`
						: 'Undo failed. Please try again.'
				);
			});
	};

	const scheduleRemoval = (
		message: string,
		undoMessage: string,
		operation: () => Promise<void>,
		undoLocal: () => void
	) => {
		onActionComplete(message, () => {
			undoLocal();
			onActionComplete(undoMessage);
		}, () => {
			void operation()
				.then(() =>
					onActionComplete(message, undefined, undefined, false)
				)
				.catch((error: unknown) => {
					console.error(
						'Failed to complete scheduled collaborative-list action:',
						error
					);
					Alert.alert(
						'Action failed',
						error instanceof Error
							? error.message
							: 'Please try again.'
					);
					undoLocal();
					onActionComplete('The action could not be completed.', undefined, undefined, false);
				});
		});
	};

	const visibleTasks = expanded
		? list.tasks
		: list.tasks.slice(0, PREVIEW_COUNT);
	const completedCount = list.tasks.filter(
		(task) => task.status === 'completed'
	).length;

	const openAction = (
		nextAction: ListAction,
		task: CollaborativeListTask | null = null,
		member: CollaborativeListMember | null = null
	) => {
		setEditingTask(task);
		setMemberToRemove(member);
		setTaskTitle(task?.title ?? '');
		setTaskDescription(task?.description ?? '');
		setUsername('');
		setActionError(null);
		setTaskActionError(null);
		setAction(nextAction);
	};

	const finishAction = () => {
		Keyboard.dismiss();
		setAction(null);
		setEditingTask(null);
		setMemberToRemove(null);
	};

	const closeAction = () => {
		if (saving) return;
		finishAction();
	};

	const submitAction = async () => {
		if (!action) return;
		setActionError(null);

		if (action === 'deleteTask') {
			if (!editingTask) {
				setActionError('Select a task to delete.');
				return;
			}

			setSaving(true);
			try {
				const task = editingTask;
				updateList((current) => ({
					...current,
					tasks: current.tasks.filter((item) => item.id !== task.id),
				}));
				finishAction();
				scheduleRemoval(
					'Task deleted.',
					'Task deletion undone.',
					() => deleteCollaborativeTask(list.id, task.id),
					() => restoreTaskLocally(task)
				);
			} catch (error) {
				setActionError(
					error instanceof Error
						? error.message
						: 'Could not delete the task. Please try again.'
				);
			} finally {
				setSaving(false);
			}
			return;
		}

		if (action === 'deleteList') {
			if (!list.isOwner) {
				setActionError('Only the list creator can delete this list.');
				return;
			}

			setSaving(true);
			try {
				const listId = list.id;
				const restoreList = () =>
					onOptimisticUpdate((lists) =>
						lists.some((item) => item.id === list.id)
							? lists
							: [...lists, list]
					);
				onOptimisticUpdate((lists) =>
					lists.filter((item) => item.id !== listId)
				);
				finishAction();
				scheduleRemoval(
					'Collaborative list deleted.',
					'List deletion undone.',
					() => deleteCollaborativeList(listId),
					restoreList
				);
			} catch (error) {
				setActionError(
					error instanceof Error
						? error.message
						: 'Could not delete the collaborative list. Please try again.'
				);
			} finally {
				setSaving(false);
			}
			return;
		}

		if (action === 'leaveList') {
			if (list.isOwner) {
				setActionError('The list creator cannot leave their own list.');
				return;
			}

			setSaving(true);
			try {
				const listId = list.id;
				const restoreList = () =>
					onOptimisticUpdate((lists) =>
						lists.some((item) => item.id === list.id)
							? lists
							: [...lists, list]
					);
				onOptimisticUpdate((lists) =>
					lists.filter((item) => item.id !== listId)
				);
				finishAction();
				scheduleRemoval(
					'You left the collaborative list.',
					'You are back in the collaborative list.',
					() => leaveCollaborativeList(listId),
					restoreList
				);
			} catch (error) {
				setActionError(
					error instanceof Error
						? error.message
						: 'Could not leave the collaborative list. Please try again.'
				);
			} finally {
				setSaving(false);
			}
			return;
		}

		if (action === 'removeMember') {
			if (!list.isOwner) {
				setActionError('Only the list creator can remove members.');
				return;
			}
			if (!memberToRemove) {
				setActionError('Select a member to remove.');
				return;
			}

			setSaving(true);
			try {
				const member = memberToRemove;
				const userId = member.userId;
				const memberLabel =
					member.username ??
					member.displayName ??
					'Member';
				updateList((current) => ({
					...current,
					members: current.members.filter(
						(member) => member.userId !== userId
					),
				}));
				finishAction();
				scheduleRemoval(
					`${memberLabel} was removed from the list.`,
					`${memberLabel} was added back to the list.`,
					() => removeCollaborator(list.id, userId),
					() =>
						updateList((current) => ({
							...current,
							members: current.members.some(
								(member) => member.userId === userId
							)
								? current.members
								: [...current.members, member],
						}))
				);
			} catch (error) {
				setActionError(
					error instanceof Error
						? error.message
						: 'Could not remove this member. Please try again.'
				);
			} finally {
				setSaving(false);
			}
			return;
		}

		if (action === 'task' || action === 'editTask') {
			const title = taskTitle.trim();
			if (!title) {
				setActionError('Enter a task title.');
				return;
			}
			if (title.length > 100 || taskDescription.trim().length > 500) {
				setActionError(
					'Task titles are limited to 100 characters and descriptions to 500.'
				);
				return;
			}

			setSaving(true);
			Keyboard.dismiss();

			if (action === 'editTask') {
				if (!editingTask) {
					setActionError('Select a task to edit.');
					setSaving(false);
					return;
				}

				const task = editingTask;
				const updatedTask = {
					...task,
					title,
					description: taskDescription.trim() || null,
				};
				updateTaskLocally(task.id, () => updatedTask);
				finishAction();

				try {
					const snapshot = await updateCollaborativeTask(list.id, task.id, {
						title,
						description: taskDescription.trim() || null,
					});
					onActionComplete(
						'Task details updated.',
						makeUndo(
							'Task changes undone.',
							() => restoreTaskLocally(task),
							() => updateTaskLocally(task.id, () => updatedTask),
							() => restoreCollaborativeTask(list.id, task.id, snapshot)
						)
					);
				} catch (error) {
					restoreTaskLocally(task);
					Alert.alert(
						'Could not save task',
						error instanceof Error
							? error.message
							: 'Please try again.'
					);
				} finally {
					setSaving(false);
				}
				return;
			}

			const optimisticId = `optimistic-${Date.now()}`;
			const optimisticTask: CollaborativeListTask = {
				id: optimisticId,
				title,
				description: taskDescription.trim() || null,
				status: 'pending',
				position: null,
				createdAt: new Date().toISOString(),
			};
			updateList((current) => ({
				...current,
				tasks: sortTasks([...current.tasks, optimisticTask]),
			}));
			finishAction();

			try {
				const taskId = await createCollaborativeTask(list.id, {
					title,
					description: taskDescription.trim() || null,
				});
				const savedTask = { ...optimisticTask, id: taskId };
				updateTaskLocally(optimisticId, () => savedTask);
				onActionComplete(
					'Task added to the shared list.',
					makeUndo(
						'Task addition undone.',
						() => removeTaskLocally(taskId),
						() => restoreTaskLocally(savedTask),
						() => deleteCollaborativeTask(list.id, taskId)
					)
				);
			} catch (error) {
				removeTaskLocally(optimisticId);
				Alert.alert(
					'Could not add task',
					error instanceof Error ? error.message : 'Please try again.'
				);
			} finally {
				setSaving(false);
			}
			return;
		}

		const normalizedUsername = username.trim().toLowerCase();
		if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
			setActionError(
				'Enter a valid username (3–30 letters, numbers, or underscores).'
			);
			return;
		}

		setSaving(true);
		const optimisticId = `optimistic-${Date.now()}`;
		const optimisticMember: CollaborativeListMember = {
			id: optimisticId,
			userId: optimisticId,
			username: normalizedUsername,
			displayName: null,
			addedAt: new Date().toISOString(),
		};
		updateList((current) => ({
			...current,
			members: [...current.members, optimisticMember],
		}));
		Keyboard.dismiss();
		finishAction();
		try {
			const result = await addCollaboratorByUsername(
				list.id,
				normalizedUsername
			);
			if (result.added && result.userId) {
				const userId = result.userId;
				const savedMember = {
					...optimisticMember,
					id: userId,
					userId,
				};
				updateList((current) => ({
					...current,
					members: current.members.map((member) =>
						member.id === optimisticId ? savedMember : member
					),
				}));
				onActionComplete(
					`@${normalizedUsername} was added to the list.`,
					makeUndo(
						'Member addition undone.',
						() =>
							updateList((current) => ({
								...current,
								members: current.members.filter(
									(member) => member.userId !== userId
								),
							})),
						() => updateList((current) => ({
							...current,
							members: current.members.some(
								(member) => member.userId === userId
							)
								? current.members
								: [...current.members, savedMember],
						})),
						() => removeCollaborator(list.id, userId)
					)
				);
			} else {
				updateList((current) => ({
					...current,
					members: current.members.filter(
						(member) => member.id !== optimisticId
					),
				}));
				onActionComplete(`@${normalizedUsername} is already a member.`);
			}
		} catch (error) {
			updateList((current) => ({
				...current,
				members: current.members.filter(
					(member) => member.id !== optimisticId
				),
			}));
			Alert.alert(
				'Could not add member',
				error instanceof Error
					? error.message
					: 'Please try again.'
			);
		} finally {
			setSaving(false);
		}
	};

	const toggleTaskStatus = async (task: CollaborativeListTask) => {
		if (processingTaskIds.has(task.id)) return;
		const nextStatus = task.status === 'completed' ? 'pending' : 'completed';

		setTaskActionError(null);
		setProcessingTaskIds((current) => new Set(current).add(task.id));
		const updatedTask = {
			...task,
			status: nextStatus,
		};
		updateTaskLocally(task.id, () => updatedTask);
		try {
			const snapshot: CollaborativeTaskSnapshot =
				await setCollaborativeTaskStatus(list.id, task.id, nextStatus);
			onActionComplete(
				nextStatus === 'completed'
					? 'Task marked as done.'
					: 'Task moved back to your active list.',
				makeUndo(
					'Task status change undone.',
					() => restoreTaskLocally(task),
					() => updateTaskLocally(task.id, () => updatedTask),
					() => restoreCollaborativeTask(list.id, task.id, snapshot)
				)
			);
		} catch (error) {
			restoreTaskLocally(task);
			setTaskActionError(
				error instanceof Error
					? error.message
					: 'Could not update the task. Please try again.'
			);
		} finally {
			setProcessingTaskIds((current) => {
				const next = new Set(current);
				next.delete(task.id);
				return next;
			});
		}
	};

	return (
		<>
			<View className="mb-4 overflow-hidden rounded-3xl border border-mutedBrown/15 bg-bgCardBg shadow-sm">
				<View className="bg-focusHero/10 px-4 pb-4 pt-4">
					<View className="flex-row items-start">
						<View className="mr-3 rounded-2xl bg-focusHero/15 p-3">
							<Ionicons
								name="people"
								size={22}
								color="#6B8E70"
							/>
						</View>
						<View className="flex-1">
							<View className="flex-row flex-wrap items-center">
								<Text className="mr-2 text-lg font-fredoka-bold text-deepBrown">
									{list.title}
								</Text>
								<View className="rounded-full bg-white/70 px-2.5 py-1">
									<Text className="text-xs font-fredoka-semibold text-mutedBrown">
										{list.isOwner ? 'Creator' : 'Member'}
									</Text>
								</View>
							</View>
							{list.description ? (
								<Text className="mt-1 font-fredoka text-mutedBrown">
									{list.description}
								</Text>
							) : null}
						</View>
					</View>
					<View className="mt-4 flex-row items-center">
						<Ionicons
							name="checkmark-done-outline"
							size={16}
							color="#6B8E70"
						/>
						<Text className="ml-1.5 font-fredoka-medium text-mutedBrown">
							{completedCount} of {list.tasks.length} completed
						</Text>
					</View>
				</View>

				<View className="px-4 pb-4 pt-2">
					{list.isOwner && (
						<View className="mb-2 rounded-xl  bg-focusHero/20 px-3 py-2">
							<TouchableOpacity
								onPress={() =>
									setMembersExpanded((expanded) => !expanded)
								}
								activeOpacity={0.75}
								className="flex-row items-center justify-between py-1"
								accessibilityRole="button"
								accessibilityState={{
									expanded: membersExpanded,
								}}
							>
								<View className="flex-row items-center ml-1">
									<Ionicons
										name="people-outline"
										size={18}
										color="#6B8E70"
									/>
									<Text className="ml-3 font-fredoka-medium text-deepBrown">
										Member/s ({list.members.length})
									</Text>
								</View>
								<Ionicons
									name={
										membersExpanded
											? 'chevron-up'
											: 'chevron-down'
									}
									size={18}
									color="#7D6E6B"
								/>
							</TouchableOpacity>
							{membersExpanded &&
								(list.members.length === 0 ? (
									<Text className="pb-2 pt-1 font-fredoka text-mutedBrown">
										No members have joined yet.
									</Text>
								) : (
									list.members.map((member) => {
										const memberLabel = member.username
											? `@${member.username}`
											: (member.displayName ??
												'Unnamed member');
										const memberIsPending =
											member.id.startsWith('optimistic-');
										return (
											<View
												key={member.id}
												className="mt-1 flex-row items-center justify-between rounded-xl bg-white/70 px-3 py-2 mb-1"
											>
												<View className="mr-3 flex-1">
													<Text
														numberOfLines={1}
														className="font-fredoka-medium text-deepBrown"
													>
														{memberLabel}
													</Text>
													{member.username &&
														member.displayName && (
															<Text
																numberOfLines={
																	1
																}
																className="font-fredoka text-xs text-mutedBrown"
															>
																{
																	member.displayName
																}
															</Text>
														)}
												</View>
												{memberIsPending ? (
													<ActivityIndicator
														size="small"
														color="#6B8E70"
													/>
												) : (
													<TouchableOpacity
														onPress={() =>
															openAction(
																'removeMember',
																null,
																member
															)
														}
														activeOpacity={0.7}
														className="flex-row items-center rounded-lg border border-[#C0392B]/20 px-2.5 py-1.5"
														accessibilityRole="button"
														accessibilityLabel={`Remove ${memberLabel} from list`}
													>
														<Ionicons
															name="person-remove-outline"
															size={15}
															color="#C0392B"
														/>
														<Text className="ml-1 font-fredoka-semibold text-xs text-[#C0392B]">
															Remove
														</Text>
													</TouchableOpacity>
												)}
											</View>
										);
									})
								))}
						</View>
					)}

					{list.tasks.length === 0 ? (
						<View className="items-center rounded-2xl bg-taskStack/50 px-4 py-5">
							<Ionicons
								name="clipboard-outline"
								size={28}
								color="#7D6E6B"
							/>
							<Text className="mt-2 text-center font-fredoka-medium text-mutedBrown">
								This list is ready for its first task.
							</Text>
						</View>
					) : (
						<View>
							{visibleTasks.map((task) => {
								const completed = task.status === 'completed';
								const processing =
									processingTaskIds.has(task.id) ||
									task.id.startsWith('optimistic-');
								return (
									<View
										key={task.id}
										className="mb-2 flex-row items-center rounded-xl bg-taskStack/45 px-3 py-2.5"
									>
										<TouchableOpacity
											onPress={() => toggleTaskStatus(task)}
											disabled={processing}
											activeOpacity={0.7}
											hitSlop={8}
											accessibilityRole="button"
											accessibilityLabel={
												completed
													? `Mark ${task.title} as not done`
													: `Mark ${task.title} as done`
											}
											accessibilityState={{
												checked: completed,
												disabled: processing,
											}}
										>
											{processing ? (
												<ActivityIndicator
													size="small"
													color="#6B8E70"
												/>
											) : (
												<Ionicons
													name={
														completed
															? 'checkmark-circle'
															: 'ellipse-outline'
													}
													size={22}
													color={
														completed
															? '#6B8E70'
															: '#7D6E6B'
													}
												/>
											)}
										</TouchableOpacity>
										<TouchableOpacity
											onPress={() =>
												openAction('editTask', task)
											}
											disabled={processing}
											activeOpacity={0.7}
											className="ml-3 flex-1"
											accessibilityRole="button"
											accessibilityLabel={`Edit ${task.title}`}
										>
											<Text
												numberOfLines={2}
												className={`font-fredoka-medium ${
													completed
														? 'text-mutedBrown line-through'
														: 'text-deepBrown'
												}`}
											>
												{task.title}
											</Text>
											{task.description ? (
												<Text
													numberOfLines={2}
													className="mt-0.5 font-fredoka text-sm text-mutedBrown"
												>
													{task.description}
												</Text>
											) : null}
										</TouchableOpacity>
										<TouchableOpacity
											onPress={() =>
												openAction('editTask', task)
											}
											disabled={processing}
											activeOpacity={0.7}
											className="ml-2 p-1"
											hitSlop={6}
											accessibilityRole="button"
											accessibilityLabel={`Edit ${task.title}`}
										>
											<Ionicons
												name="create-outline"
												size={19}
												color="#7D6E6B"
											/>
										</TouchableOpacity>
									</View>
								);
							})}
							{list.tasks.length > PREVIEW_COUNT && (
								<TouchableOpacity
									onPress={onToggleExpanded}
									activeOpacity={0.7}
									className="mb-2 flex-row items-end justify-end rounded-xl py-2"
								>
									<Text className="font-fredoka-semibold text-deepBrown underline">
										{expanded
											? 'See fewer tasks'
											: `See all ${list.tasks.length} tasks`}
									</Text>
									<Ionicons
										name={
											expanded
												? 'chevron-up'
												: 'chevron-down'
										}
										size={16}
										color="#3D2E2B"
										style={{ marginLeft: 5 }}
									/>
								</TouchableOpacity>
							)}
						</View>
					)}

					{taskActionError ? (
						<Text className="mb-2 rounded-xl bg-[#C0392B]/10 px-3 py-2 font-fredoka text-[#C0392B]">
							{taskActionError}
						</Text>
					) : null}

					<View className="mt-2 flex-row">
						{list.isOwner && (
							<TouchableOpacity
								onPress={() => openAction('member')}
								activeOpacity={0.8}
								className="mr-2 flex-1 flex-row items-center justify-center rounded-xl border border-focusHero/30 bg-white py-3"
							>
								<Ionicons
									name="person-add-outline"
									size={18}
									color="#6B8E70"
								/>
								<Text className="ml-1.5 font-fredoka-semibold text-focusHero">
									Add member
								</Text>
							</TouchableOpacity>
						)}
						<TouchableOpacity
							onPress={() => openAction('task')}
							activeOpacity={0.8}
							className="flex-1 flex-row items-center justify-center rounded-xl bg-focusHero py-3"
						>
							<Ionicons
								name="add-circle-outline"
								size={18}
								color="#FFFFFF"
							/>
							<Text className="ml-1.5 font-fredoka-semibold text-white">
								Add task
							</Text>
						</TouchableOpacity>
					</View>
					{list.isOwner && (
						<TouchableOpacity
							onPress={() => openAction('deleteList')}
							activeOpacity={0.75}
							className="mt-2 flex-row items-center justify-center rounded-xl border border-[#C0392B]/20 py-2.5"
							accessibilityRole="button"
							accessibilityLabel={`Delete collaborative list ${list.title}`}
						>
							<Ionicons
								name="trash-outline"
								size={16}
								color="#C0392B"
							/>
							<Text className="ml-1.5 font-fredoka-semibold text-[#C0392B]">
								Delete collaborative list
							</Text>
						</TouchableOpacity>
					)}
					{!list.isOwner && (
						<TouchableOpacity
							onPress={() => openAction('leaveList')}
							activeOpacity={0.75}
							className="mt-2 flex-row items-center justify-center rounded-xl border border-[#C0392B]/20 py-2.5"
							accessibilityRole="button"
							accessibilityLabel={`Leave collaborative list ${list.title}`}
						>
							<Ionicons
								name="exit-outline"
								size={17}
								color="#C0392B"
							/>
							<Text className="ml-1.5 font-fredoka-semibold text-[#C0392B]">
								Leave list
							</Text>
						</TouchableOpacity>
					)}
				</View>
			</View>

			<Modal
				visible={action !== null}
				transparent
				animationType="slide"
				onRequestClose={closeAction}
			>
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					className="flex-1 justify-end bg-black/50"
				>
					<View className="rounded-t-3xl bg-cozyBg px-5 pb-10 pt-5">
						<View className="mb-4 flex-row items-center justify-between">
							<View className="mr-4 flex-1">
								<Text className="text-xl font-fredoka-bold text-deepBrown">
									{action === 'task'
										? 'Add a task'
										: action === 'editTask'
											? 'Edit task'
											: action === 'member'
												? 'Add a member'
												: action === 'deleteTask'
													? 'Delete task?'
													: action === 'deleteList'
														? 'Delete collaborative list?'
															: action === 'leaveList'
																? 'Leave collaborative list?'
																: 'Remove member?'}
								</Text>
							</View>
							<TouchableOpacity
								onPress={closeAction}
								disabled={saving}
								hitSlop={10}
								accessibilityLabel="Close"
							>
								<Ionicons
									name="close"
									size={24}
									color="#7D6E6B"
								/>
							</TouchableOpacity>
						</View>

						{action === 'task' || action === 'editTask' ? (
							<>
								<TextInput
									value={taskTitle}
									onChangeText={setTaskTitle}
									placeholder="Task title"
									placeholderTextColor="#7D6E6B"
									maxLength={100}
									autoFocus={
										action === 'task' ||
										action === 'editTask'
									}
									className="mb-3 rounded-xl bg-bgCardBg px-4 py-3 font-fredoka text-deepBrown"
								/>
								<TextInput
									value={taskDescription}
									onChangeText={setTaskDescription}
									placeholder="Details (optional)"
									placeholderTextColor="#7D6E6B"
									maxLength={500}
									multiline
									className="mb-3 min-h-[76px] rounded-xl bg-bgCardBg px-4 py-3 font-fredoka text-deepBrown"
								/>
								{action === 'editTask' && (
									<TouchableOpacity
										onPress={() => {
											setActionError(null);
											Keyboard.dismiss();
											setAction('deleteTask');
										}}
										disabled={saving}
										activeOpacity={0.75}
										className="mb-3 flex-row items-center justify-center rounded-xl border border-[#C0392B]/25 py-3"
									>
										<Ionicons
											name="trash-outline"
											size={17}
											color="#C0392B"
										/>
										<Text className="ml-2 font-fredoka-semibold text-[#C0392B]">
											Delete task
										</Text>
									</TouchableOpacity>
								)}
							</>
						) : action === 'member' ? (
							<>
								<Text className="mb-2 font-fredoka text-mutedBrown">
									Only the creator can invite people. Enter their exact username.
								</Text>
								<View className="mb-3 flex-row items-center rounded-xl bg-bgCardBg px-4">
									<Text className="font-fredoka-semibold text-mutedBrown">
										@
									</Text>
									<TextInput
										value={username}
										onChangeText={(value) => {
											setUsername(value);
											setActionError(null);
										}}
										placeholder="username"
										placeholderTextColor="#7D6E6B"
										autoCapitalize="none"
										autoCorrect={false}
										maxLength={30}
										autoFocus
										className="flex-1 py-3 pl-1 font-fredoka text-deepBrown"
									/>
								</View>
								{actionError && (
									<View className="mb-3 flex-row items-start rounded-xl bg-[#C0392B]/10 px-3 py-2.5">
										<Ionicons
											name="alert-circle-outline"
											size={18}
											color="#C0392B"
										/>
										<Text className="ml-2 flex-1 font-fredoka text-[#C0392B]">
											{actionError}
										</Text>
									</View>
								)}
							</>
						) : action === 'deleteTask' ? (
							<View className="mb-4 rounded-2xl bg-[#C0392B]/10 px-4 py-4">
								<Text className="font-fredoka-semibold text-deepBrown">
									{editingTask?.title}
								</Text>
								<Text className="mt-1 font-fredoka text-mutedBrown">
									This removes the task from the shared list. You can undo it from the toast.
								</Text>
							</View>
						) : action === 'deleteList' ? (
							<View className="mb-4 rounded-2xl bg-[#C0392B]/10 px-4 py-4">
								<Text className="font-fredoka-semibold text-deepBrown">
									{list.title}
								</Text>
								<Text className="mt-1 font-fredoka text-mutedBrown">
									This removes the list, its tasks, and its members. You can undo it from the toast.
								</Text>
							</View>
						) : action === 'leaveList' ? (
							<View className="mb-4 rounded-2xl bg-[#C0392B]/10 px-4 py-4">
								<Text className="font-fredoka-semibold text-deepBrown">
									{list.title}
								</Text>
								<Text className="mt-1 font-fredoka text-mutedBrown">
									This removes your access, but does not delete the list or its other members. You can undo it from the toast.
								</Text>
							</View>
						) : (
							<View className="mb-4 rounded-2xl bg-[#C0392B]/10 px-4 py-4">
								<Text className="font-fredoka-semibold text-deepBrown">
									{memberToRemove?.username
										? `@${memberToRemove.username}`
										: (memberToRemove?.displayName ??
											'This member')}
								</Text>
								<Text className="mt-1 font-fredoka text-mutedBrown">
									This removes their access to the list. You can undo it from the toast.
								</Text>
							</View>
						)}

						{actionError && action !== 'member' && (
							<Text className="mb-3 font-fredoka text-[#C0392B]">
								{actionError}
							</Text>
						)}

						<TouchableOpacity
							onPress={submitAction}
							disabled={saving}
							activeOpacity={0.8}
							className={`items-center justify-center rounded-xl py-3.5 ${
								action === 'deleteTask' ||
								action === 'deleteList' ||
								action === 'leaveList' ||
								action === 'removeMember'
									? 'bg-[#C0392B]'
									: 'bg-focusHero'
							} ${
								saving ? 'opacity-60' : ''
							}`}
						>
							{saving ? (
								<ActivityIndicator color="#FFFFFF" />
							) : (
								<Text className="font-fredoka-bold text-white">
									{action === 'task'
										? 'Add task'
										: action === 'editTask'
											? 'Save changes'
											: action === 'member'
												? 'Check username & add'
													: action === 'deleteTask'
														? 'Delete task'
														: action === 'deleteList'
															? 'Delete list'
															: action === 'leaveList'
																? 'Leave list'
																: 'Remove member'}
								</Text>
							)}
						</TouchableOpacity>
						{(action === 'deleteTask' ||
							action === 'deleteList' ||
							action === 'leaveList' ||
							action === 'removeMember') && (
							<TouchableOpacity
								onPress={() => {
									setActionError(null);
									if (action === 'deleteTask') {
										setAction('editTask');
									} else {
										finishAction();
									}
								}}
								disabled={saving}
								activeOpacity={0.75}
								className="mt-2 items-center rounded-xl py-3"
							>
								<Text className="font-fredoka-semibold text-deepBrown">
									Cancel
								</Text>
							</TouchableOpacity>
						)}
					</View>
				</KeyboardAvoidingView>
			</Modal>
		</>
	);
}
