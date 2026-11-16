import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { FocusWidgetSnapshot } from './focus-widget-snapshot';

export const FOCUS_WIDGET_NAME = 'FocusWidget';

const FOCUS_GREEN = '#6B8E70';
const WHITE = '#FFFFFF';

interface FocusWidgetProps {
	snapshot: FocusWidgetSnapshot | null;
}

export function FocusWidget({ snapshot }: FocusWidgetProps) {
	const focusTitle = snapshot?.focusTaskTitle ?? null;
	const remainingTaskCount = snapshot?.remainingTaskCount ?? 0;

	return (
		<FlexWidget
			clickAction="OPEN_APP"
			style={{
				flex: 1,
				flexDirection: 'column',
				width: 'match_parent',
				height: 'match_parent',
				padding: 16,
				borderRadius: 24,
				backgroundColor: FOCUS_GREEN,
			}}
		>
			<FlexWidget
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<FlexWidget style={{ flex: 1, marginRight: 8 }}>
					<TextWidget
						text="Focus for now:"
						style={{
							fontFamily: 'Fredoka_700Bold',
							fontSize: 18,
							color: WHITE,
						}}
						allowFontScaling={false}
						maxLines={1}
						truncate="END"
					/>
				</FlexWidget>
				{focusTitle && remainingTaskCount > 0 ? (
					<FlexWidget
						style={{
							paddingHorizontal: 8,
							paddingVertical: 4,
							borderRadius: 12,
							backgroundColor: 'rgba(255, 255, 255, 0.2)',
						}}
					>
						<TextWidget
							text={`+${remainingTaskCount} left`}
							style={{
								fontFamily: 'Fredoka_500Medium',
								fontSize: 12,
								color: WHITE,
							}}
							allowFontScaling={false}
							maxLines={1}
						/>
					</FlexWidget>
				) : null}
			</FlexWidget>

			<FlexWidget
				style={{
					width: 'match_parent',
					height: 2,
					marginTop: 6,
					backgroundColor: 'rgba(255, 255, 255, 0.8)',
				}}
			/>

			{focusTitle ? (
				<FlexWidget
					style={{
						flex: 1,
						flexDirection: 'row',
						alignItems: 'center',
						marginTop: 12,
					}}
				>
					<FlexWidget
						style={{
							width: 18,
							height: 18,
							borderWidth: 2,
							borderRadius: 9,
							borderColor: WHITE,
						}}
					/>
					<FlexWidget style={{ flex: 1, marginLeft: 12 }}>
						<TextWidget
							text={focusTitle}
							style={{
								fontFamily: 'Fredoka_500Medium',
								fontSize: 18,
								color: WHITE,
							}}
							allowFontScaling={false}
							maxLines={2}
							truncate="END"
						/>
					</FlexWidget>
				</FlexWidget>
			) : (
				<FlexWidget
					style={{
						flex: 1,
						justifyContent: 'center',
						marginTop: 8,
					}}
				>
					<TextWidget
						text="All done for now!"
						style={{
							fontFamily: 'Fredoka_700Bold',
							fontSize: 17,
							color: WHITE,
						}}
						allowFontScaling={false}
						maxLines={1}
						truncate="END"
					/>
					<TextWidget
						text="Take a little breather."
						style={{
							marginTop: 4,
							fontFamily: 'Fredoka_500Medium',
							fontSize: 14,
							color: WHITE,
						}}
						allowFontScaling={false}
						maxLines={2}
						truncate="END"
					/>
				</FlexWidget>
			)}
		</FlexWidget>
	);
}
