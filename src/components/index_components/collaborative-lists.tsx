import type { CollaborativeListSummary } from '@/features/lists/lists.api';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import CollaborativeListCard from './collaborative-list-card';

interface CollaborativeListsProps {
	lists: CollaborativeListSummary[];
	loading: boolean;
	error: boolean;
	onRetry: () => void;
	onActionComplete: (message: string) => void;
	expanded: boolean;
}

interface CollaborativeListsHeaderProps {
	lists: CollaborativeListSummary[];
	loading: boolean;
	error: boolean;
	expanded: boolean;
	onToggle: () => void;
}

export function CollaborativeListsHeader({
	lists,
	loading,
	error,
	expanded,
	onToggle,
}: CollaborativeListsHeaderProps) {
	return (
		<View className="bg-cozyBg pt-1">
			<TouchableOpacity
				onPress={onToggle}
				activeOpacity={0.75}
				className="flex-row items-center justify-between rounded-2xl bg-cardBg py-4"
				accessibilityRole="button"
				accessibilityState={{ expanded }}
			>
				<View className="flex-row items-center underline">
					<Ionicons name="people-outline" size={22} color="#3D2E2B" />
					<Text className="ml-3 text-xl font-fredoka-semibold text-deepBrown underline">
						Collaborative Lists
					</Text>
				</View>
				<View className="flex-row items-center">
					{!loading && !error && (
						<Text className="mr-2 font-fredoka text-mutedBrown">
							{lists.length}
						</Text>
					)}
					<Ionicons
						name={expanded ? 'chevron-up' : 'chevron-down'}
						size={20}
						color="#3D2E2B"
					/>
				</View>
			</TouchableOpacity>
		</View>
	);
}

export default function CollaborativeLists({
	lists,
	loading,
	error,
	onRetry,
	onActionComplete,
	expanded,
}: CollaborativeListsProps) {
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

	if (!expanded) return null;

	return (
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
					<Ionicons name="people-outline" size={32} color="#7D6E6B" />
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
						onActionComplete={onActionComplete}
					/>
				))
			)}
		</View>
	);
}
