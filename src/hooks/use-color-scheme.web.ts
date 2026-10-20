import { useLayoutEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
	const [colorScheme, setColorScheme] = useState('light');
	const colorSchemeValue = useRNColorScheme();

	useLayoutEffect(() => {
		// Defer state update to avoid setState in useEffect/useLayoutEffect warning
		setTimeout(() => {
			setColorScheme(colorSchemeValue);
		}, 0);
	}, [colorSchemeValue]);

	return colorScheme;
}
