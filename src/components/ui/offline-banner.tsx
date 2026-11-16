import Ionicons from '@expo/vector-icons/Ionicons';
import { useNetworkState } from 'expo-network';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
	const { isConnected, isInternetReachable } = useNetworkState();
	const insets = useSafeAreaInsets();

	if (isConnected !== false && isInternetReachable !== false) {
		return null;
	}

	return (
		<View
			pointerEvents="none"
			accessibilityRole="alert"
			className="absolute left-4 right-4 z-50 flex-row items-center rounded-2xl bg-deepBrown px-4 py-3 shadow-lg"
			style={{ top: insets.top + 8, elevation: 10 }}
		>
			<Ionicons name="cloud-offline-outline" size={20} color="#FDFBF7" />
			<Text className="ml-2 flex-1 font-fredoka-medium text-cozyBg">
				You&apos;re offline. Some features may be unavailable.
			</Text>
		</View>
	);
}
