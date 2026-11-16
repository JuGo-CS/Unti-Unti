import { AuthProvider, useAuth } from '@/context/AuthContext';
import {
	Fredoka_400Regular,
	Fredoka_500Medium,
	Fredoka_600SemiBold,
	Fredoka_700Bold,
	useFonts,
} from '@expo-google-fonts/fredoka';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import OfflineBanner from '@/components/ui/offline-banner';
import {
	subscribeToTaskChanges,
	subscribeToTaskDeadlineChanges,
} from '@/lib/data-events';
import {
	clearTaskDeadlineNotifications,
	synchronizeTaskDeadlineNotifications,
} from '@/lib/notifications/task-deadline-notifications';
import {
	setFocusWidgetAccount,
	synchronizeFocusWidget,
} from '@/features/focus-widget/focus-widget-sync';
import '../../global.css';

// Inner navigator that guards routes based on auth state.
function RootNavigator() {
	const { session, isLoading } = useAuth();
	const segments = useSegments();
	const router = useRouter();
	const userId = session?.user.id;

	// Protect routes based on auth state
	useEffect(() => {
		if (isLoading) {
			// While loading, we don't want to redirect yet
			return;
		}

		const isAuthRoute = segments[0] === '(auth)';
		const isAuthenticated = !!session;

		if (!isAuthenticated && !isAuthRoute) {
			// User is not auth and trying to access a protected route -> redirect to sign-in
			router.replace('/(auth)/sign-in');
		} else if (isAuthenticated && isAuthRoute) {
			// User is auth and trying to access an auth route -> redirect to home
			router.replace('/');
		}
	}, [isLoading, session, segments, router]);

	useEffect(() => {
		if (isLoading) return;

		if (!userId) {
			clearTaskDeadlineNotifications().catch((error) => {
				console.error(
					'Failed to clear task deadline notifications:',
					error
				);
			});
			return;
		}

		const synchronize = () => {
			synchronizeTaskDeadlineNotifications().catch((error) => {
				console.error(
					'Failed to synchronize task deadline notifications:',
					error
				);
			});
		};
		const unsubscribe = subscribeToTaskDeadlineChanges(synchronize);
		let previousAppState = AppState.currentState;
		const appStateSubscription = AppState.addEventListener(
			'change',
			(nextAppState) => {
				if (
					nextAppState === 'active' &&
					previousAppState !== null &&
					previousAppState !== 'active'
				) {
					synchronize();
				}
				previousAppState = nextAppState;
			}
		);

		synchronize();

		return () => {
			unsubscribe();
			appStateSubscription.remove();
		};
	}, [isLoading, userId]);

	useEffect(() => {
		if (isLoading || Platform.OS !== 'android') return;

		const authenticatedUserId = userId ?? null;
		const accountReady = setFocusWidgetAccount(authenticatedUserId);
		let active = true;

		if (!authenticatedUserId) {
			accountReady.catch((error) => {
				console.error(
					'Failed to clear the focus widget account:',
					error
				);
			});
			return () => {
				active = false;
			};
		}

		let synchronizationInProgress = false;
		let synchronizationRequested = false;

		const synchronize = () => {
			if (synchronizationInProgress) {
				synchronizationRequested = true;
				return;
			}

			synchronizationInProgress = true;
			const run = async () => {
				try {
					do {
						synchronizationRequested = false;
						try {
							await accountReady;
							if (!active) return;
							await synchronizeFocusWidget(authenticatedUserId);
						} catch (error) {
							console.error(
								'Failed to synchronize the focus widget:',
								error
							);
						}
					} while (active && synchronizationRequested);
				} finally {
					synchronizationInProgress = false;
				}
			};

			void run();
		};

		const unsubscribe = subscribeToTaskChanges(synchronize);
		let previousAppState = AppState.currentState;
		const appStateSubscription = AppState.addEventListener(
			'change',
			(nextAppState) => {
				if (
					nextAppState === 'active' &&
					previousAppState !== null &&
					previousAppState !== 'active'
				) {
					synchronize();
				}
				previousAppState = nextAppState;
			}
		);

		synchronize();

		return () => {
			active = false;
			unsubscribe();
			appStateSubscription.remove();
		};
	}, [isLoading, userId]);

	return (
		<View className="flex-1">
			{isLoading ? (
				<View className="flex-1 items-center justify-center bg-cozyBg">
					<ActivityIndicator size="large" color="#3D2E2B" />
				</View>
			) : (
				<Slot />
			)}
			<OfflineBanner />
		</View>
	);
}

// Root layout: loads fonts, provides auth context, and renders the matched route.
export default function RootLayout() {
	const [fontsLoaded] = useFonts({
		Fredoka_400Regular,
		Fredoka_500Medium,
		Fredoka_600SemiBold,
		Fredoka_700Bold,
	});

	useEffect(() => {
		if (fontsLoaded) {
			SplashScreen.hideAsync();
		}
	}, [fontsLoaded]);

	if (!fontsLoaded) {
		return (
			<View className="flex-1 items-center justify-center bg-cozyBg">
				<ActivityIndicator size="large" color="#3D2E2B" />
			</View>
		);
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<AuthProvider>
				<RootNavigator />
			</AuthProvider>
		</GestureHandlerRootView>
	);
}
