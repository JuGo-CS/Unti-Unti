import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { FocusWidgetSnapshot } from './focus-widget-snapshot';

export const FOCUS_WIDGET_NAME = 'FocusWidget';

const FOCUS_GREEN = '#6B8E70';
const DEEP_GREEN = '#58785D';
const COZY_BACKGROUND = '#FDFBF7';
const DEEP_BROWN = '#2C221E';
const MUTED_BROWN = '#7D6E6B';
const SOFT_GREEN = '#E2EBE2';
const PILL_BACKGROUND = 'rgba(255, 255, 255, 0.22)';
const DIVIDER = 'rgba(255, 255, 255, 0.45)';

interface FocusWidgetProps {
	snapshot: FocusWidgetSnapshot | null;
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

/**
 * Widget layout.
 *
 * Rendered by react-native-android-widget as real Android views
 * (LinearLayout/TextView), not RemoteViews. Two rules keep it from collapsing:
 *
 * 1. A vertical child must never use `flex: 1` — the library maps it to
 *    `layout_weight`, which makes the child 0dp tall when the parent's height is
 *    itself WRAP_CONTENT. The root is MATCH_PARENT so only it may use `flex`.
 * 2. `justifyContent` on a column maps to vertical gravity, so `center` shifts
 *    content out of the visible area once it is taller than the widget.
 *
 * `scripts/render-widget.mjs` reproduces these rules to check the layout.
 */
export function FocusWidget({ snapshot }: FocusWidgetProps) {
	const focusTitle = snapshot?.focusTaskTitle ?? null;
	const focusDescription = snapshot?.focusTaskDescription?.trim() || null;
	const deadlineLabel = formatDeadline(
		snapshot?.focusTaskDeadline,
		snapshot?.focusTaskDeadlineTime
	);
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
				backgroundGradient: {
					from: FOCUS_GREEN,
					to: DEEP_GREEN,
					orientation: 'TL_BR',
				},
			}}
		>
			<FlexWidget
				style={{
					width: 'match_parent',
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<FlexWidget
					style={{
						flex: 1,
						flexDirection: 'column',
						alignItems: 'flex-start',
						marginRight: 8,
					}}
				>
					<TextWidget
						text="Focus for now:"
						style={{
							fontFamily: 'Fredoka_700Bold',
							fontSize: 18,
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
							paddingHorizontal: 10,
							paddingVertical: 4,
							borderRadius: 12,
							backgroundColor: PILL_BACKGROUND,
						}}
					>
						<TextWidget
							text={`+${remainingTaskCount} left`}
							style={{
								fontFamily: 'Fredoka_500Medium',
								fontSize: 12,
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
					height: 2,
					marginTop: 8,
					borderRadius: 1,
					backgroundColor: DIVIDER,
				}}
			/>

			{focusTitle ? (
				<FlexWidget
					style={{
						flexDirection: 'column',
						marginTop: 10,
						paddingHorizontal: 14,
						paddingVertical: 12,
						borderRadius: 18,
						backgroundColor: COZY_BACKGROUND,
					}}
				>
					<TextWidget
						text={focusTitle}
						style={{
							fontFamily: 'Fredoka_700Bold',
							fontSize: 19,
							lineHeight: 23,
							color: DEEP_BROWN,
						}}
						allowFontScaling={false}
						maxLines={2}
						truncate="END"
					/>
					{focusDescription ? (
						<TextWidget
							text={focusDescription}
							style={{
								marginTop: 4,
								fontFamily: 'Fredoka_500Medium',
								fontSize: 13,
								lineHeight: 17,
								color: MUTED_BROWN,
							}}
							allowFontScaling={false}
							maxLines={2}
							truncate="END"
						/>
					) : null}
					{deadlineLabel ? (
						<FlexWidget
							style={{
								alignItems: 'flex-start',
								marginTop: 8,
							}}
						>
							<FlexWidget
								style={{
									paddingHorizontal: 9,
									paddingVertical: 4,
									borderRadius: 10,
									backgroundColor: SOFT_GREEN,
								}}
							>
								<TextWidget
									text={deadlineLabel}
									style={{
										fontFamily: 'Fredoka_500Medium',
										fontSize: 12,
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
						flexDirection: 'column',
						marginTop: 10,
						paddingHorizontal: 14,
						paddingVertical: 14,
						borderRadius: 18,
						backgroundColor: COZY_BACKGROUND,
					}}
				>
					<TextWidget
						text="All done for now!"
						style={{
							fontFamily: 'Fredoka_700Bold',
							fontSize: 19,
							lineHeight: 23,
							color: DEEP_BROWN,
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
							fontSize: 13,
							lineHeight: 17,
							color: MUTED_BROWN,
						}}
						allowFontScaling={false}
						maxLines={1}
						truncate="END"
					/>
				</FlexWidget>
			)}
		</FlexWidget>
	);
}
