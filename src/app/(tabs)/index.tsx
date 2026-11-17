import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
	View,
	Text,
	ScrollView,
	ActivityIndicator,
	RefreshControl,
	TouchableOpacity,
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
import { getHomeSortCriteria, setHomeSortCriteria } from '@/lib/home-sort';
import HeroCard from '@/components/index_components/hero-card';
import OtherTasks, {
	OtherTasksHeader,
} from '@/components/index_components/other-tasks';
import CollaborativeLists, {
	CollaborativeListsHeader,
} from '@/components/index_components/collaborative-lists';
import { TaskItemData } from '@/components/index_components/task-item';
import Toast, { ToastData } from '@/components/ui/toast';
import EditTreasureModal from '@/components/wins_components/edit-treasure-modal';
import DeleteTreasureModal from '@/components/wins_components/delete-treasure-modal';
import {
	HomeTask,
	TaskSnapshot,
	HomeSortCriteria,
} from '@/features/tasks/tasks.types';
import {
	fetchPendingTaskQueue,
	completeTask,
	setHeroTask,
	persistTaskPositions,
	sortHomeTasks,
	undoCompleteTask,
	restoreTask,
	restoreTaskSnapshot,
	homeTaskToSnapshot,
} from '@/features/tasks/tasks.api';
import {
	fetchCategories,
	updateTreasure,
	deleteTreasure,
	Category,
	TreasureLog,
} from '@/features/treasures/treasures.api';
import { triggerHaptic } from '@/utils/haptics';
import { getCategoryIconName } from '@/utils/category-icon';
import { supabase } from '@/lib/supabase';
import { getProfile } from '@/dp_operations/profile/profile';
import {
	CollaborativeListSummary,
	fetchCollaborativeLists,
} from '@/features/lists/lists.api';

// Map a HomeTask to the TreasureLog shape the Wins edit/delete modals expect.
// The modals only read id/title/description/catId; completedDate/Time are unused
// in the edit/delete flows, so we supply empty placeholders.
// userId is optional in TreasureLog; include it if available on the task.
function toTreasureLog(task: HomeTask): TreasureLog {
	return {
		id: task.id,
		title: task.title,
		description: task.description,
		catId: task.catId,
		userId: task.userId,
		listId: task.listId,
		iconName: task.iconName,
		status: task.completed ? 'completed' : 'pending',
		deadline: task.deadline,
		priority: task.priority,
		position: task.position,
		createdAt: task.createdAt,
		completedDate: '',
		completedTime: '',
	};
}

// Format a Date into the "Thursday, September 10" style label used on Home.
function formatTodayLabel(date: Date): string {
	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
	});
}

function completionDateTime(): {
	completedDate: string;
	completedTime: string;
} {
	const now = new Date();
	return {
		completedDate: `${now.getFullYear()}-${String(
			now.getMonth() + 1
		).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
		completedTime: now.toTimeString().slice(0, 8),
	};
}

function compareQueueOrder(first: HomeTask, second: HomeTask): number {
	if (first.position != null && second.position != null) {
		return first.position - second.position;
	}
	if (first.position != null) return -1;
	if (second.position != null) return 1;
	return first.createdAt.localeCompare(second.createdAt);
}

function applyOptimisticTaskUpdate(
	queue: HomeTask[],
	update: {
		task: HomeTask;
		previousIndex?: number;
		previousWasFocus?: boolean;
	},
	sortCriteria: HomeSortCriteria
): HomeTask[] {
	const existingIndex = queue.findIndex(
		(task) => task.id === update.task.id
	);
	const existingTask =
		existingIndex >= 0 ? queue[existingIndex] : undefined;

	if (update.task.completed) {
		const nextQueue = queue.filter((task) => task.id !== update.task.id);
		const wasFocus =
			update.previousWasFocus === true || existingTask?.isFocus === true;
		if (
			wasFocus &&
			nextQueue.length > 0 &&
			!nextQueue.some((task) => task.isFocus)
		) {
			const nextFocus = nextQueue
				.filter((task) => !task.isFocus)
				.sort(compareQueueOrder)[0];
			if (nextFocus) {
				const nextFocusIndex = nextQueue.findIndex(
					(task) => task.id === nextFocus.id
				);
				nextQueue[nextFocusIndex] = {
					...nextFocus,
					isFocus: true,
					position: null,
				};
			}
		}
		return sortHomeTasks(nextQueue, sortCriteria);
	}

	const nextTask: HomeTask = {
		...update.task,
		position: existingTask?.position ?? update.task.position,
	};
	const nextQueue = [...queue];
	if (existingIndex >= 0) {
		nextQueue[existingIndex] = nextTask;
	} else {
		const insertAt =
			update.previousIndex == null
				? nextQueue.length
				: Math.max(0, Math.min(update.previousIndex, nextQueue.length));
		nextQueue.splice(insertAt, 0, nextTask);
	}

	if (nextTask.isFocus) {
		for (let index = 0; index < nextQueue.length; index += 1) {
			if (nextQueue[index].id !== nextTask.id) {
				nextQueue[index] = {
					...nextQueue[index],
					isFocus: false,
				};
			}
		}
	}
	return sortHomeTasks(nextQueue, sortCriteria);
}

export default function HomeScreen() {
	// 1. ALL HOOK DECLARATIONS MUST COME FIRST (Never place early returns above these)
	const [fontsLoaded] = useFonts({
		Fredoka_400Regular,
		Fredoka_500Medium,
		Fredoka_600SemiBold,
		Fredoka_700Bold,
	});

	// The current device date. Updated automatically when the day changes.
	const [today, setToday] = useState(() => new Date());

	// The ordered task queue. Index 0 is the current Hero Task.
	const [taskQueue, setTaskQueue] = useState<HomeTask[]>([]);
	const taskRefreshGeneration = useRef(0);
	const settingHeroRef = useRef(false);
	const [tasksLoading, setTasksLoading] = useState(true);
	const [taskError, setTaskError] = useState(false);

	// Whether the "Other tasks" section is in edit mode (drag + hero selection).
	const [editMode, setEditMode] = useState(false);

	// Active sort criterion for the "Other tasks" queue.
	const [sortCriteria, setSortCriteria] =
		useState<HomeSortCriteria>('manual');

	const [collaborativeLists, setCollaborativeLists] = useState<
		CollaborativeListSummary[]
	>([]);
	const [collaborativeListsLoading, setCollaborativeListsLoading] =
		useState(true);
	const [collaborativeListsError, setCollaborativeListsError] =
		useState(false);
	const [collaborativeSectionExpanded, setCollaborativeSectionExpanded] =
		useState(false);

	// Whether the "Other tasks" queue is expanded.
	const [otherTasksExpanded, setOtherTasksExpanded] = useState(false);

	// Success toast feedback for daily habit completion.
	const [toast, setToast] = useState<ToastData | null>(null);

	// Pull-to-refresh state for the task queue.
	const [refreshing, setRefreshing] = useState(false);

	// Edit / delete modal state.
	const [editingTask, setEditingTask] = useState<HomeTask | null>(null);
	const [editModalVisible, setEditModalVisible] = useState(false);
	const [categories, setCategories] = useState<Category[]>([]);
	const [saving, setSaving] = useState(false);
	const [deletingTask, setDeletingTask] = useState<HomeTask | null>(null);
	const [deleteModalVisible, setDeleteModalVisible] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// --- EFFECTS & CALLBACKS ---

	// Refresh the date at the next midnight so it stays current.
	useEffect(() => {
		const now = new Date();
		const nextMidnight = new Date(now);
		nextMidnight.setHours(24, 0, 0, 0);
		const timer = setTimeout(() => {
			setToday(new Date());
		}, nextMidnight.getTime() - now.getTime());
		return () => clearTimeout(timer);
	}, [today]);

	// Load the persisted sort criterion when the screen mounts.
	useEffect(() => {
		let active = true;
		getHomeSortCriteria().then((criteria) => {
			if (active) setSortCriteria(criteria);
		});
		return () => {
			active = false;
		};
	}, []);

	// Persist the sort criterion whenever it changes.
	useEffect(() => {
		setHomeSortCriteria(sortCriteria);
	}, [sortCriteria]);

	const refreshTasks = useCallback(() => {
		if (isTaskMutationInProgress()) return Promise.resolve();
		const generation = ++taskRefreshGeneration.current;
		setTaskError(false); // reset error at start of fetch
		return Promise.all([fetchPendingTaskQueue(), getHomeSortCriteria()])
			.then(([tasks, criteria]) => {
				if (
					generation !== taskRefreshGeneration.current ||
					isTaskMutationInProgress()
				) {
					return;
				}
				setSortCriteria(criteria);
				setTaskQueue(sortHomeTasks(tasks as HomeTask[], criteria));
			})
			.catch((err) => {
				if (
					generation === taskRefreshGeneration.current &&
					!isTaskMutationInProgress()
				) {
					console.error('Failed to load task queue:', err);
					setTaskError(true);
				}
			})
			.finally(() => {
				if (
					generation === taskRefreshGeneration.current &&
					!isTaskMutationInProgress()
				) {
					setTasksLoading(false);
				}
			});
	}, []);

	const refreshCollaborativeLists = useCallback(() => {
		setCollaborativeListsError(false);
		return fetchCollaborativeLists()
			.then(setCollaborativeLists)
			.catch((err) => {
				console.error('Failed to load collaborative lists:', err);
				setCollaborativeListsError(true);
			})
			.finally(() => setCollaborativeListsLoading(false));
	}, []);

	// Load the pending task queue whenever the screen gains focus.
	useFocusEffect(
		useCallback(() => {
			let active = true;
			setTaskError(false); // reset error at start of fetch
			refreshTasks().catch((err) => {
				if (active) {
					console.error('Failed to load task queue:', err);
					setTaskError(true);
				}
			});
			return () => {
				active = false;
			};
		}, [refreshTasks])
	);

	// Refetch task data and collaborative previews whenever task data changes.
	useEffect(() => {
		const subs = subscribeToTaskChanges(() => {
			refreshTasks();
			refreshCollaborativeLists();
		});
		return subs;
	}, [refreshTasks, refreshCollaborativeLists]);

	useEffect(() => {
		return subscribeToOptimisticTaskUpdates((update) => {
			taskRefreshGeneration.current += 1;
			setTaskQueue((current) =>
				applyOptimisticTaskUpdate(current, update, sortCriteria)
			);
		});
	}, [sortCriteria]);

	useFocusEffect(
		useCallback(() => {
			refreshCollaborativeLists();
		}, [refreshCollaborativeLists])
	);

	// Fetch categories once on mount.
	useEffect(() => {
		let isMounted = true;
		fetchCategories()
			.then((data) => {
				if (isMounted) setCategories(data);
			})
			.catch((err) => {
				if (isMounted) console.error('Failed to load categories:', err);
			});
		return () => {
			isMounted = false;
		};
	}, []);

	// 2. NOW IT IS SAFE TO DO EARLY RETURNS (All hooks have been registered)

	// The queue state is kept already ordered (hero first, then the active sort
	// order) so the Other Tasks list updates immediately when a task change is
	// emitted — no re-sort is needed on render.
	const heroTask = taskQueue[0];
	// The remaining tasks form the "Other tasks" queue, in order.
	const otherTasks = taskQueue.slice(1);

	// Persist the positions of the active non-Hero tasks so the database order
	// matches the given visible queue. Uses the current sort to determine the
	// final order of the non-Hero tasks.
	const syncPositions = useCallback(
		(queue: HomeTask[], criteria: HomeSortCriteria) => {
			const sorted = sortHomeTasks(queue, criteria);
			const hero = sorted.find((t) => t.isFocus) ?? null;
			const others = sorted.filter((t) => !t.isFocus);
			return persistTaskPositions(
				others.map((t) => t.id),
				hero?.id ?? null
			);
		},
		[]
	);

	// Undo a task completion optimistically, then restore it in Supabase.
	const undoTaskCompletion = useCallback(
		(
			task: TaskItemData,
			wasHero: boolean,
			showToast: boolean = true,
			previousIndex?: number,
			completedDate?: string,
			completedTime?: string
		) => {
			const fullTask = task as HomeTask;
			if (!beginTaskMutation(task.id)) {
				if (showToast) {
					setToast({ message: 'This task is still being updated.' });
				}
				return;
			}

			const restoredTask = {
				...fullTask,
				completed: false,
				isFocus: wasHero,
			};
			const optimisticUpdate = {
				task: restoredTask,
				completedDate: null,
				completedTime: null,
				previousIndex,
				previousWasFocus: wasHero,
			};
			setTaskQueue((current) =>
				applyOptimisticTaskUpdate(current, optimisticUpdate, sortCriteria)
			);
			emitOptimisticTaskUpdate(optimisticUpdate);

			void serializeTaskMutation(async () => {
				try {
					await undoCompleteTask(task.id, wasHero);
					const currentQueue =
						(await fetchPendingTaskQueue()) as HomeTask[];
					await syncPositions(currentQueue, sortCriteria);
					if (showToast) {
						setToast({ message: 'Task restored.' });
					}
				} catch (err) {
					console.error('Failed to undo task completion:', err);
					const completedTask = {
						...fullTask,
						completed: true,
						isFocus: false,
					};
					const rollbackUpdate = {
						task: completedTask,
						completedDate: completedDate ?? null,
						completedTime: completedTime ?? null,
						previousIndex,
					};
					setTaskQueue((current) =>
						applyOptimisticTaskUpdate(
							current,
							rollbackUpdate,
							sortCriteria
						)
					);
					emitOptimisticTaskUpdate(rollbackUpdate);
					if (showToast) {
						setToast({
							message: 'Could not undo. Please try again.',
						});
					}
				} finally {
					finishTaskMutation(task.id);
				}
			});
		},
		[syncPositions, sortCriteria]
	);

	// Undo a task deletion: restore the deleted task and refresh the UI.
	const undoTaskDeletion = useCallback(
		(task: HomeTask) => {
			restoreTask(task)
				.then(() => fetchPendingTaskQueue())
				.then((tasks) => {
					const nextQueue = tasks as HomeTask[];
					setTaskQueue(nextQueue);
					return syncPositions(nextQueue, sortCriteria).then(() => {
						setToast({ message: 'Task restored.' });
						emitTaskDataChanged();
					});
				})
				.catch((err) => {
					console.error('Failed to undo task deletion:', err);
					setToast({ message: 'Could not undo. Please try again.' });
				});
		},
		[syncPositions, sortCriteria]
	);

	// Completing any task removes it immediately; the queue head is promoted
	// when the completed task was the current focus.
	const handleCompleteTask = useCallback(
		(task: TaskItemData) => {
			triggerHaptic.heavy(); // Task completion toggle
			const previousIndex = taskQueue.findIndex(
				(queuedTask) => queuedTask.id === task.id
			);
			const currentTask = taskQueue[previousIndex];
			if (!currentTask || !beginTaskMutation(task.id)) {
				if (currentTask) {
					setToast({
						message: 'This task is still being updated.',
					});
				}
				return;
			}

			const wasHero = currentTask.isFocus || previousIndex === 0;
			const { completedDate, completedTime } = completionDateTime();
			const completedTask: HomeTask = {
				...currentTask,
				completed: true,
				isFocus: false,
			};
			const optimisticUpdate = {
				task: completedTask,
				completedDate,
				completedTime,
				previousIndex,
				previousWasFocus: wasHero,
			};
			taskRefreshGeneration.current += 1;
			setTaskQueue((current) =>
				applyOptimisticTaskUpdate(current, optimisticUpdate, sortCriteria)
			);
			emitOptimisticTaskUpdate(optimisticUpdate);

			void serializeTaskMutation(async () => {
				try {
					await completeTask(task.id);
					const currentQueue =
						(await fetchPendingTaskQueue()) as HomeTask[];
					await syncPositions(currentQueue, sortCriteria);
					setToast({
						message: 'Task completed!',
						undoLabel: 'Undo',
						onUndo: () =>
							undoTaskCompletion(
								currentTask,
								wasHero,
								true,
								previousIndex,
								completedDate,
								completedTime
							),
					});
				} catch (err) {
					console.error('Failed to complete task:', err);
					const rollbackUpdate = {
						task: currentTask,
						completedDate: null,
						completedTime: null,
						previousIndex,
						previousWasFocus: wasHero,
					};
					setTaskQueue((current) =>
						applyOptimisticTaskUpdate(
							current,
							rollbackUpdate,
							sortCriteria
						)
					);
					emitOptimisticTaskUpdate(rollbackUpdate);

					let rollbackFailed = false;
					try {
						await undoCompleteTask(task.id, wasHero);
						const restoredQueue =
							(await fetchPendingTaskQueue()) as HomeTask[];
						await syncPositions(restoredQueue, sortCriteria);
					} catch (rollbackError) {
						rollbackFailed = true;
						console.error(
							'Failed to roll back task completion:',
							rollbackError
						);
					}
					setToast({
						message: rollbackFailed
							? 'The task may still be completed. Refresh and check its status.'
							: 'Could not complete the task. Please try again.',
						undoLabel: undefined,
					});
				} finally {
					finishTaskMutation(task.id);
				}
			});
		},
		[taskQueue, sortCriteria, syncPositions, undoTaskCompletion]
	);
	const handleHeroComplete = handleCompleteTask;
	const handleToggleTask = handleCompleteTask;

	// Toggle edit mode for the Other tasks section.
	const handleToggleEdit = useCallback(() => {
		setEditMode((prev) => !prev);
	}, []);

	// Change the active sort criterion for the Other tasks queue.
	// The new sorted order of the non-Hero tasks is persisted to `position`,
	// and the sort mode is persisted so Calendar reflects the same mode.
	const handleChangeSort = useCallback(
		(criteria: HomeSortCriteria) => {
			triggerHaptic.light(); // Filter/sort change
			setSortCriteria(criteria);
			Promise.all([
				setHomeSortCriteria(criteria),
				syncPositions(taskQueue, criteria),
			])
				.then(() => {
					emitTaskDataChanged();
				})
				.catch((err) => {
					console.error('Failed to persist sort order:', err);
				});
		},
		[taskQueue, syncPositions]
	);

	// Make the given task the Hero Task. Persists `is_focus` to Supabase.
	const handleMakeHero = useCallback(
		(task: TaskItemData) => {
			if (settingHeroRef.current) return;

			const selectedTask = taskQueue.find(
				(queueTask) => queueTask.id === task.id
			);
			if (!selectedTask || selectedTask.isFocus) return;

			const previousHero = taskQueue.find(
				(queueTask) => queueTask.isFocus
			);
			const mutationIds = [
				selectedTask.id,
				...(previousHero ? [previousHero.id] : []),
			];
			if (!beginTaskMutation(mutationIds)) {
				setToast({ message: 'A task in this change is still updating.' });
				return;
			}

			settingHeroRef.current = true;
			const previousIndex = taskQueue.findIndex(
				(queueTask) => queueTask.id === selectedTask.id
			);
			const remainingTasks = taskQueue.filter(
				(queueTask) =>
					queueTask.id !== selectedTask.id && !queueTask.isFocus
			);
			const focusedTask = {
				...selectedTask,
				isFocus: true,
				position: null,
			};
			const nextQueue = sortHomeTasks(
				[
					focusedTask,
					...remainingTasks,
					...(previousHero
						? [{ ...previousHero, isFocus: false }]
						: []),
				],
				sortCriteria
			);
			taskRefreshGeneration.current += 1;
			setTaskQueue(nextQueue);
			if (previousHero) {
				emitOptimisticTaskUpdate({
					task: previousHero,
					completedDate: null,
					completedTime: null,
				});
			}
			emitOptimisticTaskUpdate({
				task: focusedTask,
				completedDate: null,
				completedTime: null,
				previousIndex,
			});

			void serializeTaskMutation(async () => {
				try {
					await setHeroTask(selectedTask.id);
					await syncPositions(nextQueue, sortCriteria);
				} catch (err) {
					console.error('Failed to set hero task:', err);
					setTaskQueue((current) => {
						const selectedRollback = applyOptimisticTaskUpdate(
							current,
							{
								task: { ...selectedTask, isFocus: false },
								previousIndex,
							},
							sortCriteria
						);
						return previousHero
							? applyOptimisticTaskUpdate(
									selectedRollback,
									{
										task: previousHero,
										previousWasFocus: true,
									},
									sortCriteria
								)
							: selectedRollback;
					});
					emitOptimisticTaskUpdate({
						task: { ...selectedTask, isFocus: false },
						completedDate: null,
						completedTime: null,
						previousIndex,
					});
					if (previousHero) {
						emitOptimisticTaskUpdate({
							task: previousHero,
							completedDate: null,
							completedTime: null,
						});
					}

					try {
						if (previousHero) {
							await setHeroTask(previousHero.id);
							const restoredQueue =
								(await fetchPendingTaskQueue()) as HomeTask[];
							await syncPositions(restoredQueue, sortCriteria);
						}
					} catch (rollbackError) {
						console.error(
							'Failed to restore the previous focus task:',
							rollbackError
						);
					}
					setToast({
						message:
							'Could not set the focused task. Please try again.',
					});
				} finally {
					finishTaskMutation(mutationIds);
					settingHeroRef.current = false;
				}
			});
		},
		[taskQueue, sortCriteria, syncPositions]
	);

	// Persist a manual drag reorder of the non-Hero tasks.
	const handleReorder = useCallback(
		(orderedOtherIds: string[]) => {
			// Build the new queue (hero first, then the dragged non-Hero order).
			const hero = taskQueue.find((t) => t.isFocus) ?? null;
			const orderedOthers = orderedOtherIds
				.map((id) => taskQueue.find((t) => t.id === id))
				.filter((t): t is HomeTask => !!t);
			const nextQueue = hero ? [hero, ...orderedOthers] : orderedOthers;

			// A manual drag overrides any automatic sort, so the display reverts to
			// the persisted `position` order ('manual').
			setSortCriteria('manual');
			setTaskQueue(nextQueue);
			// Persist the new non-Hero positions, then notify subscribed screens so
			// they refetch and re-sync to the new order.
			syncPositions(nextQueue, 'manual')
				.then(() => {
					emitTaskDataChanged();
				})
				.catch((err) => {
					console.error('Failed to persist reorder:', err);
				});
		},
		[taskQueue, setSortCriteria, setTaskQueue, syncPositions]
	);

	// Open the edit modal for a task (edit mode → tap body → Edit).
	const handleEditTask = useCallback((task: TaskItemData) => {
		triggerHaptic.light(); // Opening task for editing
		triggerHaptic.medium(); // Opening modal
		setEditingTask(task as HomeTask);
		setEditModalVisible(true);
	}, []);

	// Undo a task edit: restore the pre-edit snapshot and refresh the UI.
	const undoTaskEdit = useCallback(
		(
			snapshot: TaskSnapshot,
			restoreUpdate: OptimisticTaskUpdate,
			currentUpdate: OptimisticTaskUpdate
		) => {
			if (!beginTaskMutation(snapshot.id)) {
				setToast({ message: 'This task is still being updated.' });
				return;
			}
			taskRefreshGeneration.current += 1;
			setTaskQueue((current) =>
				applyOptimisticTaskUpdate(
					current,
					restoreUpdate,
					sortCriteria
				)
			);
			emitOptimisticTaskUpdate(restoreUpdate);
			void serializeTaskMutation(async () => {
				try {
					await restoreTaskSnapshot(snapshot);
					if (snapshot.isFocus && snapshot.status === 'pending') {
						await setHeroTask(snapshot.id);
					}
					setToast({ message: 'Task restored.' });
				} catch (err) {
					console.error('Failed to undo task edit:', err);
					setTaskQueue((current) =>
						applyOptimisticTaskUpdate(
							current,
							currentUpdate,
							sortCriteria
						)
					);
					emitOptimisticTaskUpdate(currentUpdate);
					setToast({ message: 'Could not undo. Please try again.' });
				} finally {
					finishTaskMutation(snapshot.id);
				}
			});
		},
		[sortCriteria]
	);

	// Confirm the edited task, then refresh the queue.
	const handleConfirmEdit = useCallback(
		(payload: {
			status: 'completed' | 'pending';
			title: string;
			description: string | null;
			cat_id: string | null;
			deadline: string | null;
		}) => {
			if (!editingTask) return;
			if (!beginTaskMutation(editingTask.id)) {
				setToast({ message: 'This task is still being updated.' });
				return;
			}
			const taskToEdit =
				taskQueue.find((task) => task.id === editingTask.id) ??
				editingTask;
			// Capture the task's full state before the edit so Undo can restore it.
			const snapshot = homeTaskToSnapshot(taskToEdit);
			const previousIndex = taskQueue.findIndex(
				(task) => task.id === taskToEdit.id
			);
			const selectedCategory = categories.find(
				(category) => category.cat_id === payload.cat_id
			);
			const wasFocus =
				taskToEdit.isFocus ||
				(taskQueue[0]?.id === taskToEdit.id && previousIndex === 0);
			const updatedTask: HomeTask = {
				...taskToEdit,
				title: payload.title,
				description: payload.description,
				catId: payload.cat_id,
				categoryName:
					payload.cat_id === taskToEdit.catId
						? (selectedCategory?.cat_name ??
							taskToEdit.categoryName)
						: (selectedCategory?.cat_name ?? null),
				iconName:
					selectedCategory?.iconName ??
					(payload.cat_id === taskToEdit.catId
						? taskToEdit.iconName
						: getCategoryIconName(null)),
				deadline: payload.deadline,
				deadlineTime: null,
				completed: payload.status === 'completed',
				isFocus:
					payload.status === 'pending' && taskToEdit.isFocus,
			};
			const completion = updatedTask.completed
				? completionDateTime()
				: { completedDate: null, completedTime: null };
			const optimisticUpdate = {
				task: updatedTask,
				...completion,
				previousIndex,
				previousWasFocus: wasFocus,
			};
			const previousUpdate = {
				task: taskToEdit,
				completedDate: null,
				completedTime: null,
				previousIndex,
				previousWasFocus: wasFocus,
			};
			taskRefreshGeneration.current += 1;
			setTaskQueue((current) =>
				applyOptimisticTaskUpdate(current, optimisticUpdate, sortCriteria)
			);
			emitOptimisticTaskUpdate(optimisticUpdate);
			setEditModalVisible(false);
			setEditingTask(null);
			setSaving(true);
			void serializeTaskMutation(async () => {
				try {
					await updateTreasure(taskToEdit.id, payload);
					setToast({
						message: 'Task updated!',
						undoLabel: 'Undo',
						onUndo: () =>
							undoTaskEdit(
								snapshot,
								previousUpdate,
								optimisticUpdate
							),
					});
					triggerHaptic.success(); // Successful update
				} catch (err) {
					console.error('Failed to update task:', err);
					setTaskQueue((current) =>
						applyOptimisticTaskUpdate(
							current,
							previousUpdate,
							sortCriteria
						)
					);
					emitOptimisticTaskUpdate(previousUpdate);
					try {
						await restoreTaskSnapshot(snapshot);
					} catch (rollbackError) {
						console.error(
							'Failed to restore the previous task after edit:',
							rollbackError
						);
					}
					setToast({
						message: 'Could not update the task. Please try again.',
					});
				} finally {
					setSaving(false);
					finishTaskMutation(taskToEdit.id);
				}
			});
		},
		[
			editingTask,
			taskQueue,
			categories,
			sortCriteria,
			undoTaskEdit,
		]
	);

	// Open the delete confirmation for a task (edit mode → tap body → Delete).
	const handleDeleteTask = useCallback((task: TaskItemData) => {
		triggerHaptic.warning(); // Delete prompt
		triggerHaptic.medium(); // Opening modal
		setDeletingTask(task as HomeTask);
		setDeleteModalVisible(true);
	}, []);

	// Confirm the permanent deletion, then refresh the queue.
	const handleConfirmDelete = useCallback(
		(task: HomeTask) => {
			setDeleting(true);
			deleteTreasure(task.id)
				.then(() => {
					setDeleteModalVisible(false);
					setDeletingTask(null);
					setToast({
						message: 'Task deleted.',
						undoLabel: 'Undo',
						onUndo: () => undoTaskDeletion(task),
					});
					return refreshTasks().then(() => {
						emitTaskDataChanged();
					});
				})
				.catch((err) => {
					console.error('Failed to delete task:', err);
				})
				.finally(() => {
					setDeleting(false);
				});
		},
		[refreshTasks, undoTaskDeletion]
	);

	// Pull-to-refresh: refetch tasks and collaborative lists.
	const handleRefresh = useCallback(() => {
		if (refreshing) return;
		setRefreshing(true);
		setTaskError(false); // reset error on refresh
		Promise.all([refreshTasks(), refreshCollaborativeLists()])
			.catch((err) => {
				console.error('Failed to refresh Home:', err);
				setTaskError(true);
			})
			.finally(() => {
				setRefreshing(false);
			});
	}, [refreshing, refreshTasks, refreshCollaborativeLists]);

	const [userName, setUserName] = useState<string>('');
	const [loading, setLoading] = useState(true);

	const fetchUserName = useCallback(async () => {
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (user) {
				// Priority: Database profile -> Metadata -> Email prefix -> Fallback
				const { data } = await getProfile(user.id);
				const name =
					data?.display_name ||
					data?.username ||
					user.user_metadata?.display_name ||
					user.user_metadata?.full_name ||
					user.email?.split('@')[0] ||
					'Friend';

				setUserName(name);
			}
		} catch (err) {
			console.error('Error loading username on home:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	// Re-fetch profile name whenever Home gains focus
	useFocusEffect(
		useCallback(() => {
			fetchUserName();
		}, [fetchUserName])
	);

	useEffect(() => {
		const { data: authListener } = supabase.auth.onAuthStateChange(
			(_event, session) => {
				if (session?.user) {
					fetchUserName();
				}
			}
		);

		return () => {
			authListener.subscription.unsubscribe();
		};
	}, [fetchUserName]);

	const currentHour = today.getHours();
	const isDaytime = currentHour >= 6 && currentHour < 18;

	if (!fontsLoaded) {
		return null;
	}

	return (
		<View className="flex-1 bg-cozyBg pt-14 px-5">
			{/* Header row with greeting and sun icon — fixed */}
			<View className="flex-row items-start justify-between">
				<View className="flex-1 pr-4">
					<Text className="text-4xl font-fredoka-semibold text-deepBrown leading-tight">
						{isDaytime ? 'Maayung\nadlaw, ' : 'Maayung\ngabe, '}{' '}
						{loading ? '...' : `${userName}!`}
					</Text>
					{/* Horizontal line underneath the heading */}
					<View className="h-[2px] bg-deepBrown mt-2" />
					{/* Current device date */}
					<Text className="text-lg text-mutedBrown mt-2">
						{formatTodayLabel(today)}
					</Text>
				</View>
				{/* Sun icon in the top-right, slightly above the text */}
				<Ionicons
					name={isDaytime ? 'sunny' : 'moon'}
					size={isDaytime ? 80 : 70}
					color={isDaytime ? '#F4C542' : '#5069A0'}
					style={{ marginTop: isDaytime ? -22 : -12 }}
				/>
			</View>

			{/* Main content scrolls so the focus card and task header move away naturally. */}
			{/* Three fixed wrapper views before the collaborative header keep its sticky index stable. */}
			<ScrollView
				className="flex-1"
				showsVerticalScrollIndicator={false}
				stickyHeaderIndices={[3]}
				contentContainerStyle={{ paddingBottom: 120 }}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={handleRefresh}
						tintColor="#6B8E70"
					/>
				}
			>
				{/* Hero Card — highlights the single focus task, or a relaxing message when all done */}
				<View className="mt-8">
					{tasksLoading ? (
						<View className="rounded-3xl bg-focusHero p-5 items-center justify-center">
							<ActivityIndicator color="#FFFFFF" />
							<Text className="text-lg font-fredoka-medium text-white mt-3">
								Loading your tasks...
							</Text>
						</View>
					) : taskError ? (
						<View className="rounded-3xl bg-focusHero p-5 items-center justify-center">
							<Text className="text-lg font-fredoka-medium text-deepBrown mt-3">
								Failed to load tasks. Please try again.
							</Text>
							<TouchableOpacity
								onPress={handleRefresh}
								activeOpacity={0.7}
								className="mt-4 bg-focusHero text-white px-6 py-3 rounded-xl font-fredoka-semibold"
							>
								<Text className="font-fredoka-semibold">
									Retry
								</Text>
							</TouchableOpacity>
						</View>
					) : (
						<HeroCard
							task={heroTask}
							empty={!heroTask}
							onComplete={handleHeroComplete}
						/>
					)}
				</View>

				{/* Other tasks title + sort + edit button */}
				<View
					className={
						!tasksLoading && !taskError && otherTasks.length > 0
							? 'mt-8'
							: ''
					}
				>
					{!tasksLoading && !taskError && otherTasks.length > 0 && (
						<OtherTasksHeader
							editMode={editMode}
							onToggleEdit={handleToggleEdit}
							sortCriteria={sortCriteria}
							onChangeSort={handleChangeSort}
						/>
					)}
				</View>

				{/* Other tasks — stacked queue preview with expand/collapse */}
				<View>
					{!tasksLoading && !taskError && (
						<OtherTasks
							tasks={otherTasks}
							onToggleTask={handleToggleTask}
							expanded={otherTasksExpanded}
							onToggleExpanded={() =>
								setOtherTasksExpanded((prev) => !prev)
							}
							editMode={editMode}
							sortCriteria={sortCriteria}
							onMakeHero={handleMakeHero}
							onReorder={handleReorder}
							onEdit={handleEditTask}
							onDelete={handleDeleteTask}
						/>
					)}
				</View>

				<CollaborativeListsHeader
					lists={collaborativeLists}
					loading={collaborativeListsLoading}
					error={collaborativeListsError}
					expanded={collaborativeSectionExpanded}
					onToggle={() =>
						setCollaborativeSectionExpanded((expanded) => !expanded)
					}
				/>
				<CollaborativeLists
					lists={collaborativeLists}
					loading={collaborativeListsLoading}
					error={collaborativeListsError}
					onRetry={refreshCollaborativeLists}
					expanded={collaborativeSectionExpanded}
					onOptimisticUpdate={setCollaborativeLists}
					onActionComplete={(
						message,
						onUndo,
						onExpire,
						showToast = true
					) => {
						if (showToast) {
							setToast({
								message,
								undoLabel: onUndo ? 'Undo' : undefined,
								onUndo,
								onExpire,
							});
						}
						if (!onExpire) emitTaskDataChanged();
					}}
				/>
			</ScrollView>

			{/* Edit task modal */}
			<EditTreasureModal
				key={`${editModalVisible}-${editingTask?.id ?? 'none'}`}
				visible={editModalVisible}
				log={editingTask ? toTreasureLog(editingTask) : null}
				categories={categories}
				onClose={() => {
					setEditModalVisible(false);
					setEditingTask(null);
				}}
				onConfirm={handleConfirmEdit}
				saving={saving}
			/>

			{/* Delete confirmation modal */}
			<DeleteTreasureModal
				visible={deleteModalVisible}
				log={deletingTask ? toTreasureLog(deletingTask) : null}
				onClose={() => {
					setDeleteModalVisible(false);
					setDeletingTask(null);
				}}
				onConfirmDelete={(log) => handleConfirmDelete(deletingTask!)}
				deleting={deleting}
			/>

			<Toast toast={toast} onDismiss={() => setToast(null)} />
		</View>
	);
}
