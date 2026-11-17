import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { FocusWidgetSnapshot } from './focus-widget-snapshot';

export const FOCUS_WIDGET_NAME = 'FocusWidget';

const FOCUS_GREEN = '#6B8E70';
const DEEP_GREEN = '#58785D';
const COZY_BACKGROUND = '#FDFBF7';
const DEEP_BROWN = '#2C221E';
const MUTED_BROWN = '#7D6E6B';
const SOFT_GREEN = '#E2EBE2';

interface FocusWidgetProps {
	snapshot: FocusWidgetSnapshot | null;
	widgetWidth: number;
	widgetHeight: number;
}

function formatDeadline(
	deadline: string | null | undefined,
	deadlineTime: string | null | undefined
): string | null {
	if (!deadline) return null;

	const [year, month, day] = deadline.split('-').map(Number);
	if (!year || !month || !day) return null;

	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}

	const dateLabel = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
	}).format(date);
	const timeParts = deadlineTime?.match(/^(\d{2}):(\d{2})$/);
	if (!timeParts) return `Due ${dateLabel}`;

	const hour = Number(timeParts[1]);
	const minute = Number(timeParts[2]);
	if (hour > 23 || minute > 59) return `Due ${dateLabel}`;

	const time = new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	}).format(new Date(2000, 0, 1, hour, minute));
	return `Due ${dateLabel} at ${time}`;
}

export function FocusWidget({
	snapshot,
	widgetWidth,
	widgetHeight,
}: FocusWidgetProps) {
	const focusTitle = snapshot?.focusTaskTitle ?? null;
	const focusDescription = snapshot?.focusTaskDescription?.trim() || null;
	const deadlineLabel = formatDeadline(
		snapshot?.focusTaskDeadline,
		snapshot?.focusTaskDeadlineTime
	);
	const remainingTaskCount = snapshot?.remainingTaskCount ?? 0;
	const compact = widgetWidth < 220 || widgetHeight < 150;
	const showDescription = Boolean(
		focusDescription && (!compact || !deadlineLabel)
	);
	const showDeadline = Boolean(
		deadlineLabel && (compact || !focusDescription)
	);

	return (
		<FlexWidget
			clickAction="OPEN_APP"
			style={{
				flex: 1,
				flexDirection: 'column',
				width: 'match_parent',
				height: 'match_parent',
				padding: compact ? 9 : 14,
				borderRadius: compact ? 23 : 28,
				backgroundGradient: {
					from: FOCUS_GREEN,
					to: DEEP_GREEN,
					orientation: 'TL_BR',
				},
			}}
		>
			<FlexWidget
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<FlexWidget style={{ flex: 1, marginRight: 6 }}>
					<TextWidget
						text={compact ? 'YOUR FOCUS' : 'FOCUS FOR NOW'}
						style={{
							fontFamily: 'Fredoka_700Bold',
							fontSize: compact ? 11 : 13,
							letterSpacing: compact ? 0.5 : 0.8,
							color: COZY_BACKGROUND,
						}}
						allowFontScaling={false}
						maxLines={1}
						truncate="END"
					/>
				</FlexWidget>
				{focusTitle && remainingTaskCount > 0 ? (
					<FlexWidget
						style={{
							paddingHorizontal: compact ? 7 : 9,
							paddingVertical: compact ? 3 : 5,
							borderRadius: 14,
							backgroundColor: 'rgba(255, 255, 255, 0.2)',
						}}
					>
						<TextWidget
							text={`+${remainingTaskCount} left`}
							style={{
								fontFamily: 'Fredoka_500Medium',
								fontSize: compact ? 10 : 12,
								color: COZY_BACKGROUND,
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
					height: 1,
					marginTop: compact ? 5 : 8,
					backgroundColor: 'rgba(255, 255, 255, 0.42)',
				}}
			/>

			<FlexWidget
				style={{
					flex: 1,
					flexDirection: 'column',
					justifyContent: 'center',
					marginTop: compact ? 6 : 10,
					paddingHorizontal: compact ? 9 : 14,
					paddingVertical: compact ? 6 : 12,
					borderRadius: compact ? 16 : 20,
					backgroundColor: COZY_BACKGROUND,
				}}
			>
				{focusTitle ? (
					<FlexWidget
						style={{
							flex: 1,
							flexDirection: 'column',
							justifyContent: 'center',
						}}
					>
						<TextWidget
							text={focusTitle}
							style={{
								fontFamily: 'Fredoka_700Bold',
								fontSize: compact ? 16 : 20,
								lineHeight: compact ? 19 : 24,
								color: DEEP_BROWN,
							}}
							allowFontScaling={false}
							maxLines={2}
							truncate="END"
						/>
						{showDescription ? (
							<TextWidget
								text={focusDescription ?? ''}
								style={{
									marginTop: compact ? 2 : 5,
									fontFamily: 'Fredoka_500Medium',
									fontSize: compact ? 11 : 14,
									lineHeight: compact ? 13 : 18,
									color: MUTED_BROWN,
								}}
								allowFontScaling={false}
								maxLines={compact ? 1 : 2}
								truncate="END"
							/>
						) : null}
						{showDeadline ? (
							<FlexWidget
								style={{
									alignItems: 'flex-start',
									marginTop: compact ? 3 : 7,
								}}
							>
								<FlexWidget
									style={{
										paddingHorizontal: compact ? 7 : 9,
										paddingVertical: compact ? 3 : 4,
										borderRadius: 12,
										backgroundColor: SOFT_GREEN,
									}}
								>
									<TextWidget
										text={deadlineLabel ?? ''}
										style={{
											fontFamily: 'Fredoka_500Medium',
											fontSize: compact ? 10 : 12,
											color: DEEP_GREEN,
										}}
										allowFontScaling={false}
										maxLines={1}
										truncate="END"
									/>
								</FlexWidget>
							</FlexWidget>
						) : null}
					</FlexWidget>
				) : (
					<FlexWidget
						style={{
							flex: 1,
							flexDirection: 'column',
							justifyContent: 'center',
						}}
					>
						<TextWidget
							text="All done for now!"
							style={{
								fontFamily: 'Fredoka_700Bold',
								fontSize: compact ? 16 : 20,
								lineHeight: compact ? 19 : 24,
								color: DEEP_BROWN,
							}}
							allowFontScaling={false}
							maxLines={1}
							truncate="END"
						/>
						<TextWidget
							text="Take a little breather."
							style={{
								marginTop: compact ? 2 : 5,
								fontFamily: 'Fredoka_500Medium',
								fontSize: compact ? 11 : 14,
								lineHeight: compact ? 13 : 18,
								color: MUTED_BROWN,
							}}
							allowFontScaling={false}
							maxLines={1}
							truncate="END"
						/>
					</FlexWidget>
				)}
			</FlexWidget>
		</FlexWidget>
	);
}
