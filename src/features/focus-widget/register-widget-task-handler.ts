import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { focusWidgetTaskHandler } from './widget-task-handler';

if (Platform.OS === 'android') {
	registerWidgetTaskHandler(focusWidgetTaskHandler);
}
