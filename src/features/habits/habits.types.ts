import { CategoryIconName } from '@/utils/category-icon';

export interface HabitData {
	id: string;
	title: string;
	/** Category icon shown on the left of the habit card. */
	iconName: CategoryIconName;
	completed?: boolean;
}
