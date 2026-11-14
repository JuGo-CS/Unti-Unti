import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { CollaborativeListSummary } from '@/features/lists/lists.api';

const PREVIEW_COUNT = 3;

interface CollaborativeListsProps {
	lists: CollaborativeListSummary[];
	loading: boolean;
	error: boolean;
	onRetry: () => void;
}

export default function CollaborativeLists({
	lists,
	loading,
	error,
	onRetry,
}: CollaborativeListsProps) {
	const [sectionExpanded, setSectionExpanded] = useState(false);
	const [expandedLists, setExpandedLists] = useState<Set<string>>(
		() => new Set()
	);

	const toggleList = (listId: string) => {
		setExpandedLists((current) => {
			const next = new Set(current);
			if (next.has(listId)) next.delete(listId);
			else next.add(listId);
			return next;
		});
	};

	return (
		<View className="mt-8">
			<TouchableOpacity
				onPress={() => setSectionExpanded((expanded) => !expanded)}
				activeOpacity={0.75}
				className="flex-row items-center justify-between rounded-2xl bg-cardBg px-4 py-4"
				accessibilityRole="button"
				accessibilityState={{ expanded: sectionExpanded }}
			>
				<View className="flex-row items-center">
					<Ionicons name="people-outline" size={22} color="#3D2E2B" />
					<Text className="ml-3 text-xl font-fredoka-semibold text-deepBrown">
						Collaborative lists
					</Text>
				</View>
				<View className="flex-row items-center">
					{!loading && !error && (
						<Text className="mr-2 font-fredoka text-mutedBrown">
							{lists.length}
						</Text>
					)}
					<Ionicons
						name={sectionExpanded ? 'chevron-up' : 'chevron-down'}
						size={20}
						color="#3D2E2B"
					/>
				</View>
			</TouchableOpacity>

			{sectionExpanded && (
				<View className="mt-3">
					{loading ? (
						<View className="items-center rounded-2xl bg-cardBg px-4 py-6">
							<ActivityIndicator color="#6B8E70" />
							<Text className="mt-2 font-fredoka text-mutedBrown">
								Loading collaborative lists...
							</Text>
						</View>
					) : error ? (
						<View className="items-center rounded-2xl bg-cardBg px-4 py-5">
							<Text className="text-center font-fredoka text-deepBrown">
								Could not load collaborative lists.
							</Text>
							<TouchableOpacity
								onPress={onRetry}
								activeOpacity={0.7}
								className="mt-3 rounded-xl bg-focusHero px-4 py-2"
							>
								<Text className="font-fredoka-semibold text-white">
									Try again
								</Text>
							</TouchableOpacity>
						</View>
					) : lists.length === 0 ? (
						<View className="items-center rounded-2xl bg-cardBg px-4 py-6">
							<Ionicons
								name="people-outline"
								size={32}
								color="#7D6E6B"
							/>
							<Text className="mt-2 text-center font-fredoka text-mutedBrown">
								You haven&apos;t joined any collaborative lists yet.
							</Text>
						</View>
					) : (
						lists.map((list) => (
							<CollaborativeListCard
								key={list.id}
								list={list}
								expanded={expandedLists.has(list.id)}
								onToggleExpanded={() => toggleList(list.id)}
							/>
						))
					)}
				</View>
			)}
		</View>
	);
}

function CollaborativeListCard({
	list,
	expanded,
	onToggleExpanded,
}: {
	list: CollaborativeListSummary;
	expanded: boolean;
	onToggleExpanded: () => void;
}) {
	const tasks = expanded ? list.tasks : list.tasks.slice(0, PREVIEW_COUNT);

	return (
		<View className="mb-3 rounded-2xl border border-white/60 bg-taskStack px-4 py-4">
			<View className="mb-3 flex-row items-start justify-between">
				<View className="mr-3 flex-1">
					<Text className="text-lg font-fredoka-semibold text-deepBrown">
						{list.title}
					</Text>
					{list.description ? (
						<Text className="mt-1 font-fredoka text-mutedBrown">
							{list.description}
						</Text>
					) : null}
				</View>
				<Text className="font-fredoka text-mutedBrown">
					{list.tasks.length} {list.tasks.length === 1 ? 'task' : 'tasks'}
				</Text>
			</View>

			{list.tasks.length === 0 ? (
				<Text className="py-2 font-fredoka text-mutedBrown">
					No tasks in this list yet.
				</Text>
			) : (
				tasks.map((task) => {
					const completed = task.status === 'completed';
					return (
						<View
							key={task.id}
							className="flex-row items-center border-t border-deepBrown/10 py-3"
						>
							<Ionicons
								name={completed ? 'checkmark-circle' : 'ellipse-outline'}
								size={20}
								color={completed ? '#6B8E70' : '#7D6E6B'}
							/>
							<Text
								numberOfLines={2}
								className={`ml-3 flex-1 font-fredoka-medium ${
									completed
										? 'text-mutedBrown line-through'
										: 'text-deepBrown'
								}`}
							>
								{task.title}
							</Text>
						</View>
					);
				})
			)}

			{list.tasks.length > PREVIEW_COUNT && (
				<TouchableOpacity
					onPress={onToggleExpanded}
					activeOpacity={0.7}
					className="mt-2 flex-row items-center justify-end"
				>
					<Text className="font-fredoka-semibold text-deepBrown underline">
						{expanded ? 'See fewer' : 'See more'}
					</Text>
					<Ionicons
						name={expanded ? 'chevron-up' : 'chevron-down'}
						size={16}
						color="#3D2E2B"
						style={{ marginLeft: 4 }}
					/>
				</TouchableOpacity>
			)}
		</View>
	);
}
