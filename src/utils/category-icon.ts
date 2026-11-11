import Ionicons from '@expo/vector-icons/Ionicons';

export type CategoryIconName = keyof typeof Ionicons.glyphMap;

const DEFAULT_ICON: CategoryIconName = 'ellipse-outline';

export function getCategoryIconName(
	value: string | null | undefined
): CategoryIconName {
	if (!value) return DEFAULT_ICON;
	if (Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, value)) {
		return value as CategoryIconName;
	}
	return DEFAULT_ICON;
}
