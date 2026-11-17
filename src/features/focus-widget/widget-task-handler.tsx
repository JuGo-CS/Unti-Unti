import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { FocusWidget, FOCUS_WIDGET_NAME } from './focus-widget';
import {
	readFocusWidgetSnapshot,
	type FocusWidgetSnapshot,
} from './focus-widget-snapshot';

export async function focusWidgetTaskHandler(
	props: WidgetTaskHandlerProps
): Promise<void> {
	if (props.widgetInfo.widgetName !== FOCUS_WIDGET_NAME) {
		console.error(
			`Received an unsupported widget: ${props.widgetInfo.widgetName}`
		);
		return;
	}

	switch (props.widgetAction) {
		case 'WIDGET_ADDED':
		case 'WIDGET_UPDATE':
		case 'WIDGET_RESIZED': {
			let snapshot: FocusWidgetSnapshot | null = null;
			try {
				snapshot = await readFocusWidgetSnapshot();
			} catch (error) {
				console.error(
					'Failed to read the focus widget snapshot:',
					error
				);
			}
			props.renderWidget(
				<FocusWidget
					snapshot={snapshot}
					widgetWidth={props.widgetInfo.width}
					widgetHeight={props.widgetInfo.height}
				/>
			);
			return;
		}
		case 'WIDGET_CLICK':
		case 'WIDGET_DELETED':
			return;
	}
}
