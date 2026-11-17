const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Make the widget broadcast receivers reachable from outside the app process.
 *
 * `react-native-android-widget` registers each widget receiver with
 * `android:exported="false"`, so the `WIDGET_CLICK` broadcast is only delivered
 * while the app process is alive. Taps on the home-screen widget are sent by the
 * launcher (a different app), so with the app closed Android drops them and the
 * widget appears untappable.
 *
 * This plugin runs after the widget plugin and flips the flag to `true` for the
 * generated widget receivers only, leaving every other receiver untouched.
 */
function withExportedWidgetReceivers(config) {
	return withAndroidManifest(config, (config) => {
		const application = config.modResults.manifest.application?.[0];
		if (!application?.receiver) return config;

		const widgetActions = new Set([
			'android.appwidget.action.APPWIDGET_UPDATE',
			`${config.android?.package}.WIDGET_CLICK`,
		]);

		for (const receiver of application.receiver) {
			const actions = (receiver['intent-filter'] ?? []).flatMap(
				(filter) =>
					(filter.action ?? []).map(
						(action) => action.$?.['android:name']
					)
			);
			const isWidgetReceiver = actions.some((action) =>
				widgetActions.has(action)
			);
			if (!isWidgetReceiver) continue;

			receiver.$ = receiver.$ ?? {};
			receiver.$['android:exported'] = 'true';
		}

		return config;
	});
}

module.exports = withExportedWidgetReceivers;
