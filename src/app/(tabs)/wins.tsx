import { useEffect, useRef, useState, useCallback } from 'react';
import {
	View,
	Text,
	ScrollView,
	TouchableOpacity,
	RefreshControl,
} from 'react-native';
import {
	useFonts,
	Fredoka_400Regular,
	Fredoka_500Medium,
	Fredoka_600SemiBold,
	Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
	beginTaskMutation,
	emitOptimisticTaskUpdate,
	emitTaskDataChanged,
	finishTaskMutation,
	isTaskMutationInProgress,
	OptimisticTaskUpdate,
	serializeTaskMutation,
	subscribeToOptimisticTaskUpdates,
	subscribeToTaskChanges,
} from '@/lib/data-events';
import WinsTabs, { WinsTab } from '@/components/wins_components/wins-tabs';
import TreasureDateSection from '@/components/wins_components/treasure-date-section';
import WinsCalendarModal from '@/components/wins_components/wins-calendar-modal';
import EditTreasureModal from '@/components/wins_components/edit-treasure-modal';
import DeleteTreasureModal from '@/components/wins_components/delete-treasure-modal';
import Toast, { ToastData } from '@/components/ui/toast';
import {
	TreasureGroup,
	TreasureLog,
	Category,
} from '@/features/treasures/treasures.types';
import {
	fetchTreasureGroups,
	deleteTreasure,
	fetchCategories,
	updateTreasure,
	restoreTreasure,
} from '@/features/treasures/treasures.api';
import { HomeTask, TaskSnapshot } from '@/features/tasks/tasks.types';
import { restoreTaskSnapshot } from '@/features/tasks/tasks.api';
import { triggerHaptic } from '@/utils/haptics';
import { getCategoryIconName } from '@/utils/category-icon';

/** Today's date as `YYYY-MM-DD` in local time. */
function todayDateString(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	let day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatGroupLabel(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(year, month - 1, day).toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});
}

function priorityForTask(priority: string | null): HomeTask['priority'] {
	switch (priority?.toLowerCase()) {
		case 'high':
			return 'high';
		case 'medium':
			return 'medium';
		default:
			return 'low';
	}
}

function logToOptimisticUpdate(
	log: TreasureLog,
	categories: Category[]
): OptimisticTaskUpdate {
	const category = categories.find((item) => item.cat_id === log.catId);
	const task: HomeTask = {
		id: log.id,
		title: log.title,
		description: log.description,
		catId: log.catId,
		userId: log.userId,
		listId: log.listId,
		priority: priorityForTask(log.priority),
		deadline: log.deadline,
		deadlineTime: null,
		categoryName: category?.cat_name ?? null,
		createdAt: log.createdAt,
		position: log.position,
		isFocus: false,
		completed: log.status === 'completed',
		iconName:
			category?.iconName ??
			(log.catId ? log.iconName : getCategoryIconName(null)),
	};
	return {
		task,
		completedDate: log.completedDate || null,
		completedTime: log.completedTime || null,
	};
}

function applyOptimisticUpdateToGroups(
	groups: TreasureGroup[],
	update: OptimisticTaskUpdate
): TreasureGroup[] {
	const withoutTask = groups
		.map((group) => ({
			...group,
			logs: group.logs.filter((log) => log.id !== update.task.id),
		}))
		.filter((group) => group.logs.length > 0);

	if (!update.task.completed) return withoutTask;

	const completedDate = update.completedDate ?? todayDateString();
	const completedTime =
		update.completedTime ?? new Date().toTimeString().slice(0, 8);
	const log: TreasureLog = {
		id: update.task.id,
		title: update.task.title,
		description: update.task.description,
		catId: update.task.catId,
		userId: update.task.userId,
		listId: update.task.listId,
		iconName: update.task.iconName,
		status: 'completed',
		deadline: update.task.deadline,
		priority: update.task.priority,
		position: update.task.position,
		createdAt: update.task.createdAt,
		completedDate,
		completedTime,
	};
	const group = withoutTask.find((item) => item.date === completedDate);
	if (group) {
		group.logs = [...group.logs, log].sort((first, second) =>
			second.completedTime.localeCompare(first.completedTime)
		);
	} else {
		withoutTask.push({
			date: completedDate,
			label: formatGroupLabel(completedDate),
			logs: [log],
		});
	}
	return withoutTask.sort((first, second) =>
		second.date.localeCompare(first.date)
	);
}

export default function WinsScreen() {
	const [fontsLoaded] = useFonts({
		Fredoka_400Regular,
		Fredoka_500Medium,
		Fredoka_600SemiBold,
		Fredoka_700Bold,
	});

	const [activeTab, setActiveTab] = useState<WinsTab>('treasures');
	const [groups, setGroups] = useState<TreasureGroup[]>([]);
	const refreshGeneration = useRef(0);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [calendarVisible, setCalendarVisible] = useState(false);
	const [selectedDate, setSelectedDate] = useState<string>(todayDateString());

	// Edit modal state.
	const [editingLog, setEditingLog] = useState<TreasureLog | null>(null);
	const [editModalVisible, setEditModalVisible] = useState(false);
	const [categories, setCategories] = useState<Category[]>([]);
	const [saving, setSaving] = useState(false);

	// Delete confirmation modal state.
	const [deletingLog, setDeletingLog] = useState<TreasureLog | null>(null);
	const [deleteModalVisible, setDeleteModalVisible] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Success toast feedback for edit/delete actions.
	const [toast, setToast] = useState<ToastData | null>(null);

	// Ref to the scrollable logbook + a map of each date group's y-offset.
	const scrollRef = useRef<ScrollView>(null);
	const dateOffsets = useRef<Record<string, number>>({});

	// Refetch the completed task logs (Treasures) + categories from Supabase.
	// Used on focus, on pull-to-refresh, and when task data changes elsewhere.
	const refresh = useCallback(() => {
		if (isTaskMutationInProgress()) return Promise.resolve();
		const generation = ++refreshGeneration.current;
		return Promise.all([
			fetchTreasureGroups().then((nextGroups) => {
				if (
					generation === refreshGeneration.current &&
					!isTaskMutationInProgress()
				) {
					setGroups(nextGroups);
				}
			}),
			fetchCategories().then((nextCategories) => {
				if (
					generation === refreshGeneration.current &&
					!isTaskMutationInProgress()
				) {
					setCategories(nextCategories);
				}
			}),
		])
			.catch((err) => {
				if (
					generation === refreshGeneration.current &&
					!isTaskMutationInProgress()
				) {
					console.error('Failed to load treasures:', err);
				}
			})
			.finally(() => {
				if (
					generation === refreshGeneration.current &&
					!isTaskMutationInProgress()
				) {
					setLoading(false);
				}
			});
	}, []);

	// Refetch whenever the screen gains focus so newly completed tasks appear.
	useFocusEffect(
		useCallback(() => {
			let active = true;
			setLoading(true);
			refresh()
				.catch((err) => {
					if (active) {
						console.error('Failed to load treasures:', err);
					}
				})
				.finally(() => {
					if (active) setLoading(false);
				});
			return () => {
				active = false;
			};
		}, [refresh])
	);

	// Refetch whenever another screen mutates task data, so Wins stays in sync.
	useEffect(() => {
		const unsubscribe = subscribeToTaskChanges(() => {
			refresh();
		});
		return unsubscribe;
	}, [refresh]);

	useEffect(() => {
		return subscribeToOptimisticTaskUpdates((update) => {
			refreshGeneration.current += 1;
			setGroups((current) =>
				applyOptimisticUpdateToGroups(current, update)
			);
		});
	}, []);

	// Open the editor for a completed task.
	const handleEditLog = useCallback((log: TreasureLog) => {
		triggerHaptic.light(); // Opening treasure for editing
		triggerHaptic.medium(); // Opening modal
		setEditingLog(log);
		setEditModalVisible(true);
	}, []);

	// Apply the edit to Wins and Home immediately, then persist it.
	const handleConfirmEdit = useCallback(
		(payload: {
			status: 'completed' | 'pending';
			title: string;
			description: string | null;
			cat_id: string | null;
			deadline: string | null;
		}) => {
			if (!editingLog) return;
			const logToEdit =
				groups
					.flatMap((group) => group.logs)
					.find((log) => log.id === editingLog.id) ?? null;
			if (!logToEdit) {
				setEditModalVisible(false);
				setEditingLog(null);
				setToast({
					message: 'This task has changed. Reopen it to edit.',
				});
				return;
			}
			if (!beginTaskMutation(logToEdit.id)) {
				setToast({ message: 'This task is still being updated.' });
				return;
			}
			// Capture the task's full state before the edit so Undo can restore it.
			const snapshot: TaskSnapshot = {
				id: logToEdit.id,
				title: logToEdit.title,
				description: logToEdit.description,
				catId: logToEdit.catId,
				listId: logToEdit.listId,
				priority: logToEdit.priority,
				deadline: logToEdit.deadline,
				status: logToEdit.status,
				isFocus: false,
				position: logToEdit.position,
				completedDate: logToEdit.completedDate || null,
				completedTime: logToEdit.completedTime || null,
				createdAt: logToEdit.createdAt,
			};
			const originalUpdate = logToOptimisticUpdate(
				logToEdit,
				categories
			);
			const selectedCategory = categories.find(
				(category) => category.cat_id === payload.cat_id
			);
			const updatedLog: TreasureLog = {
				...logToEdit,
				title: payload.title,
				description: payload.description,
				catId: payload.cat_id,
				iconName:
					selectedCategory?.iconName ??
					(payload.cat_id === logToEdit.catId
						? logToEdit.iconName
						: getCategoryIconName(null)),
				deadline: payload.deadline,
				status: payload.status,
			};
			const optimisticUpdate = logToOptimisticUpdate(
				updatedLog,
				categories
			);
			if (payload.status !== 'completed') {
				optimisticUpdate.completedDate = null;
				optimisticUpdate.completedTime = null;
			}
			refreshGeneration.current += 1;
			setGroups((current) =>
				applyOptimisticUpdateToGroups(current, optimisticUpdate)
			);
			emitOptimisticTaskUpdate(optimisticUpdate);
			setEditModalVisible(false);
			setEditingLog(null);
			setSaving(true);
			void serializeTaskMutation(async () => {
				try {
					await updateTreasure(logToEdit.id, payload);
					setToast({
						message: 'Treasure updated!',
						undoLabel: 'Undo',
						onUndo: () => {
							if (!beginTaskMutation(logToEdit.id)) {
								setToast({
									message:
										'This task is still being updated.',
								});
								return;
							}
							setGroups((current) =>
								applyOptimisticUpdateToGroups(
									current,
									originalUpdate
								)
							);
							emitOptimisticTaskUpdate(originalUpdate);
							void serializeTaskMutation(async () => {
								try {
									await restoreTaskSnapshot(snapshot);
									setToast({
										message: 'Treasure restored.',
									});
								} catch (err) {
									console.error(
										'Failed to undo treasure edit:',
										err
									);
									setGroups((current) =>
										applyOptimisticUpdateToGroups(
											current,
											optimisticUpdate
										)
									);
									emitOptimisticTaskUpdate(
										optimisticUpdate
									);
									setToast({
										message:
											'Could not undo. Please try again.',
									});
								} finally {
									finishTaskMutation(logToEdit.id);
								}
							});
						},
					});
					triggerHaptic.success(); // Successful update
				} catch (err) {
					console.error('Failed to update treasure:', err);
					setGroups((current) =>
						applyOptimisticUpdateToGroups(current, originalUpdate)
					);
					emitOptimisticTaskUpdate(originalUpdate);
					try {
						await restoreTaskSnapshot(snapshot);
					} catch (rollbackError) {
						console.error(
							'Failed to restore the previous treasure:',
							rollbackError
						);
					}
					setToast({
						message: 'Could not update the task. Please try again.',
					});
				} finally {
					setSaving(false);
					finishTaskMutation(logToEdit.id);
				}
			});
		},
		[editingLog, groups, categories]
	);

	// Handle tapping Delete — open the confirmation dialog (does not delete yet).
	const handleDeleteLog = useCallback((log: TreasureLog) => {
		triggerHaptic.warning(); // Delete prompt
		triggerHaptic.medium(); // Opening modal
		setDeletingLog(log);
		setDeleteModalVisible(true);
	}, []);

	// Handle confirming the permanent deletion. Only deletes after confirmation.
	const handleConfirmDelete = useCallback(
		(log: TreasureLog) => {
			setDeleting(true);
			deleteTreasure(log.id)
				.then(() => {
					// Remove the task from the Treasures UI immediately.
					setGroups((prev) =>
						prev
							.map((group) => ({
								...group,
								logs: group.logs.filter((l) => l.id !== log.id),
							}))
							.filter((group) => group.logs.length > 0)
					);
					setDeleteModalVisible(false);
					setDeletingLog(null);
					setToast({
						message: 'Treasure deleted.',
						undoLabel: 'Undo',
						onUndo: () => {
							restoreTreasure(log)
								.then(() => fetchTreasureGroups())
								.then((data) => {
									setGroups(data);
									setToast({ message: 'Treasure restored.' });
									emitTaskDataChanged();
								})
								.catch((err) => {
									console.error(
										'Failed to undo treasure deletion:',
										err
									);
									setToast({
										message:
											'Could not undo. Please try again.',
									});
								});
						},
					});
				})
				.catch((err) => {
					// Keep the task visible on failure; the user can retry.
					console.error('Failed to delete treasure:', err);
				})
				.finally(() => {
					setDeleting(false);
				});
		},
		[setDeleting, setDeleteModalVisible, setToast]
	);

	// Jump the logbook to the selected date. Does NOT filter — the whole
	// logbook stays scrollable so the user can continue browsing nearby days.
	const handleSelectDate = useCallback((date: string) => {
		triggerHaptic.light(); // Date selection
		setSelectedDate(date);
		const y = dateOffsets.current[date];
		if (y != null) {
			scrollRef.current?.scrollTo({ y, animated: true });
		}
	}, []); // scrollRef and dateOffsets are refs, stable

	// Pull-to-refresh: refetch treasures, guarding against duplicate runs.
	const handleRefresh = useCallback(() => {
		if (refreshing) return;
		setRefreshing(true);
		refresh().finally(() => {
			setRefreshing(false);
		});
	}, [refreshing, refresh]);

	if (!fontsLoaded) {
		return null;
	}

	return (
		<View className="flex-1 bg-cozyBg pt-14 px-5">
			{/* Header row with "Wins" title and sun icon */}
			<View className="flex-row items-start justify-between">
				<View className="flex-1 pr-4">
					<Text className="text-4xl font-fredoka-semibold font-bold text-deepBrown mt-2 leading-tight">
						Wins
					</Text>
				</View>
				<Ionicons
					name="sunny"
					size={80}
					color="#F4C542"
					style={{ marginTop: -22 }}
				/>
			</View>
			<View className="h-[2px] bg-deepBrown mr-28 -mt-2" />

			{/* Treasures / Mosaic toggle */}
			<WinsTabs activeTab={activeTab} onChangeTab={setActiveTab} />

			{/* Single calendar icon at the top of the Treasures section */}
			{activeTab === 'treasures' && (
				<View className="flex-row items-center justify-end mt-4">
					<TouchableOpacity
						onPress={() => setCalendarVisible(true)}
						activeOpacity={0.7}
						className="p-2"
					>
						<Ionicons
							name="calendar-outline"
							size={24}
							color="#7D6E6B"
						/>
					</TouchableOpacity>
				</View>
			)}

			{/* Scrollable logbook content */}
			<ScrollView
				ref={scrollRef}
				className="flex-1 mt-2"
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingBottom: 120 }}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={handleRefresh}
						tintColor="#6B8E70"
					/>
				}
			>
				{activeTab === 'treasures' ? (
					loading ? (
						<Text className="text-base font-fredoka text-mutedBrown">
							Loading your treasures...
						</Text>
					) : groups.length === 0 ? (
						<Text className="text-base font-fredoka text-mutedBrown">
							No treasures yet. Complete a task to see it here!
						</Text>
					) : (
						groups.map((group) => (
							<View
								key={group.date}
								onLayout={(e) => {
									dateOffsets.current[group.date] =
										e.nativeEvent.layout.y;
								}}
							>
								<TreasureDateSection
									group={group}
									onEditLog={handleEditLog}
									onDeleteLog={handleDeleteLog}
								/>
							</View>
						))
					)
				) : (
					// Mosaic section — will display Daily Habit completion logs later.
					<Text className="text-base font-fredoka text-mutedBrown">
						Mosaic is coming soon!
					</Text>
				)}
			</ScrollView>

			{/* Calendar modal */}
			<WinsCalendarModal
				visible={calendarVisible}
				onClose={() => setCalendarVisible(false)}
				onSelectDate={handleSelectDate}
				selectedDate={selectedDate}
			/>

			{/* Edit treasure modal */}
			<EditTreasureModal
				key={`${editModalVisible}-${editingLog?.id ?? 'none'}`}
				visible={editModalVisible}
				log={editingLog}
				categories={categories}
				onClose={() => {
					setEditModalVisible(false);
					setEditingLog(null);
				}}
				onConfirm={handleConfirmEdit}
				saving={saving}
			/>

			{/* Delete confirmation modal */}
			<DeleteTreasureModal
				visible={deleteModalVisible}
				log={deletingLog}
				onClose={() => {
					setDeleteModalVisible(false);
					setDeletingLog(null);
				}}
				onConfirmDelete={handleConfirmDelete}
				deleting={deleting}
			/>

			{/* Success toast for edit/delete actions. */}
			<Toast toast={toast} onDismiss={() => setToast(null)} />
		</View>
	);
}
