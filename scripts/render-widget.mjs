/**
 * Dev-only harness: renders the widget tree with a faithful port of
 * react-native-android-widget's native layout rules (LinearLayout + gravity +
 * weight + WRAP_CONTENT/MATCH_PARENT), so layout bugs are caught on the machine
 * instead of on a phone.
 *
 * Run with: node scripts/render-widget.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const widgetSource = readFileSync(
	path.join(projectRoot, 'src/features/focus-widget/focus-widget.tsx'),
	'utf8'
);

// --- Minimal JSX evaluation -------------------------------------------------
// The widget file is a pure function of its props, so we transpile it with
// sucrase (already a project dependency) and provide tiny FlexWidget/TextWidget
// stubs that record the tree exactly like the library's buildWidgetTree does.
import { transform } from 'sucrase';

function loadWidget() {
	const { code } = transform(widgetSource, {
		transforms: ['typescript', 'jsx'],
		jsxPragma: 'h',
		production: true,
	});

	const body = code
		.replace(/import\s*\{[^}]*\}\s*from\s*'[^']*';?/g, '')
		.replace(/import[^;\n]*from\s*'[^']*';?/g, '')
		.replace(/^export /gm, '');

	if (/\bimport\b/.test(body)) {
		throw new Error('Failed to strip imports from widget source');
	}

	const h = (type, props, ...children) => {
		const name = type?.__name__ ?? type?.name ?? 'FlexWidget';
		const merged = { ...(props ?? {}) };
		if (children.length > 0) {
			const existing = merged.children;
			const list = existing
				? Array.isArray(existing)
					? [...existing, ...children]
					: [existing, ...children]
				: children;
			merged.children = list.flat(Infinity).filter(Boolean);
		}
		return { type: name, props: merged };
	};
	// The library's buildWidgetTree unwraps components whose type has no
	// __name__ by calling them, so our stubs must be plain named functions.
	const FlexWidget = (props) => ({ type: 'FlexWidget', props: props ?? {} });
	const TextWidget = (props) => ({ type: 'TextWidget', props: props ?? {} });
	FlexWidget.__name__ = 'LinearLayoutWidget';
	TextWidget.__name__ = 'TextWidget';

	const factory = new Function(
		'h',
		'FlexWidget',
		'TextWidget',
		`${body}\nreturn FocusWidget;`
	);
	return factory(h, FlexWidget, TextWidget);
}

// --- Layout engine (mirror of BaseWidget/LinearLayoutWidget) ----------------
const GRAVITY = {
	START: 8388611,
	END: 8388613,
	TOP: 48,
	BOTTOM: 80,
	CENTER_HORIZONTAL: 1,
	CENTER_VERTICAL: 16,
};

function getGravity({ flexDirection, justifyContent, alignItems }) {
	let gravity = GRAVITY.START;
	switch (flexDirection === 'row' ? justifyContent : alignItems) {
		case 'flex-start': gravity = GRAVITY.START; break;
		case 'center': gravity = GRAVITY.CENTER_HORIZONTAL; break;
		case 'flex-end': gravity = GRAVITY.END; break;
		default: break;
	}
	switch (flexDirection === 'row' ? alignItems : justifyContent) {
		case 'flex-start': gravity |= GRAVITY.TOP; break;
		case 'center': gravity |= GRAVITY.CENTER_VERTICAL; break;
		case 'flex-end': gravity |= GRAVITY.BOTTOM; break;
		default: break;
	}
	return gravity;
}

function pad(style) {
	const p = { top: 0, right: 0, bottom: 0, left: 0 };
	if ('padding' in style) {
		const v = style.padding ?? 0;
		p.top = p.right = p.bottom = p.left = v;
	}
	if ('paddingHorizontal' in style) p.left = p.right = style.paddingHorizontal ?? 0;
	if ('paddingVertical' in style) p.top = p.bottom = style.paddingVertical ?? 0;
	if ('paddingTop' in style) p.top = style.paddingTop ?? 0;
	if ('paddingRight' in style) p.right = style.paddingRight ?? 0;
	if ('paddingBottom' in style) p.bottom = style.paddingBottom ?? 0;
	if ('paddingLeft' in style) p.left = style.paddingLeft ?? 0;
	return p;
}

function margin(style) {
	const m = { top: 0, right: 0, bottom: 0, left: 0 };
	if ('margin' in style) {
		const v = style.margin ?? 0;
		m.top = m.right = m.bottom = m.left = v;
	}
	if ('marginHorizontal' in style) m.left = m.right = style.marginHorizontal ?? 0;
	if ('marginVertical' in style) m.top = m.bottom = style.marginVertical ?? 0;
	if ('marginTop' in style) m.top = style.marginTop ?? 0;
	if ('marginRight' in style) m.right = style.marginRight ?? 0;
	if ('marginBottom' in style) m.bottom = style.marginBottom ?? 0;
	if ('marginLeft' in style) m.left = style.marginLeft ?? 0;
	return m;
}

function measure(node, availW, availH, isText) {
	// Returns { w, h } intrinsic size given available space (dp).
	const style = node.props?.style ?? {};
	const p = isText ? { top: 0, right: 0, bottom: 0, left: 0 } : pad(style);
	const m = isText ? { top: 0, right: 0, bottom: 0, left: 0 } : margin(style);

	if (isText) {
		const text = String(node.props?.text ?? '');
		const fontSize = style.fontSize ?? 12;
		const maxLines = node.props?.maxLines ?? 1;
		const lineHeight = style.lineHeight ?? fontSize * 1.25;
		const charWidth = fontSize * 0.55;
		const perLine = Math.max(1, Math.floor(availW / charWidth));
		const lines = Math.min(maxLines, Math.max(1, Math.ceil(text.length / perLine)));
		return {
			w: Math.min(availW, Math.ceil(Math.min(text.length, perLine) * charWidth)),
			h: Math.ceil(lines * lineHeight),
			lines,
			text,
		};
	}

	const children = (Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]).filter(
		(c) => c && typeof c === 'object' && c.type
	);
	const innerW = Math.max(0, availW - p.left - p.right - m.left - m.right);
	const innerH = Math.max(0, availH - p.top - p.bottom - m.top - m.bottom);
	const row = style.flexDirection === 'row';

	let w = 0;
	let h = 0;
	const measured = [];
	for (const child of children) {
		const cStyle = child.props?.style ?? {};
		const cm = margin(cStyle);
		const isText = child.type === 'TextWidget';
		const childAvailW = row ? innerW : innerW;
		const childAvailH = row ? innerH : innerH;
		const size = measure(child, childAvailW, childAvailH, isText);
		measured.push({ size, cm, child });
		if (row) {
			w += size.w + cm.left + cm.right;
			h = Math.max(h, size.h + cm.top + cm.bottom);
		} else {
			w = Math.max(w, size.w + cm.left + cm.right);
			h += size.h + cm.top + cm.bottom;
		}
	}

	const explicitW = style.width === 'match_parent' ? innerW : style.width;
	const explicitH = style.height === 'match_parent' ? innerH : style.height;

	return {
		w: typeof explicitW === 'number' ? explicitW + p.left + p.right : w + p.left + p.right,
		h: typeof explicitH === 'number' ? explicitH + p.top + p.bottom : h + p.top + p.bottom,
		children: measured,
		style,
		row,
	};
}

function layout(node, availW, availH, isText, out, offsetX = 0, offsetY = 0) {
	const style = node.props?.style ?? {};
	const p = isText ? { top: 0, right: 0, bottom: 0, left: 0 } : pad(style);
	const size = measure(node, availW, availH, isText);

	const outerW = Math.min(availW, size.w);
	const outerH = Math.min(availH, size.h);
	const x = offsetX;
	const y = offsetY;	const innerW = Math.max(0, outerW - p.left - p.right);
	const innerH = Math.max(0, outerH - p.top - p.bottom);

	out.push({
		kind: isText ? 'text' : 'flex',
		text: isText ? String(node.props?.text ?? '') : undefined,
		lines: isText ? size.lines : undefined,
		x: x + p.left,
		y: y + p.top,
		w: innerW,
		h: innerH,
		style,
	});

	if (isText) return;

	const children = (Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]).filter(
		(c) => c && typeof c === 'object' && c.type
	);
	const row = style.flexDirection === 'row';
	const gravity = getGravity(style);
	const centerH = (gravity & GRAVITY.CENTER_HORIZONTAL) !== 0;
	const centerV = (gravity & GRAVITY.CENTER_VERTICAL) !== 0;

	const sizes = children.map((child) => {
		const cStyle = child.props?.style ?? {};
		const cm = margin(cStyle);
		const s = measure(child, innerW, innerH, child.type === 'TextWidget');
		return { child, cm, s, cStyle };
	});

	const totalMain = sizes.reduce(
		(acc, { s, cm }) => acc + (row ? s.w + cm.left + cm.right : s.h + cm.top + cm.bottom),
		0
	);
	const totalCross = sizes.reduce(
		(acc, { s, cm }) => acc + (row ? s.h + cm.top + cm.bottom : s.w + cm.left + cm.right),
		0
	);

	// LinearLayout with width=match_parent fills its parent; a column's children
	// then get the full inner width (that is why the header row must not be
	// sized from its own content).
	const fillsWidth = style.width === 'match_parent';
	const contentW = fillsWidth ? innerW : totalCross;

	let cursor = 0;
	if (row && centerH) cursor = Math.max(0, (innerW - totalMain) / 2);
	if (!row && centerV) cursor = Math.max(0, (innerH - totalMain) / 2);

	for (const { child, cm, s } of sizes) {
		const childIsText = child.type === 'TextWidget';
		const crossSize = row ? s.h + cm.top + cm.bottom : s.w + cm.left + cm.right;
		let crossOffset = 0;
		if (row) {
			if (centerV) crossOffset = Math.max(0, (innerH - crossSize) / 2);
		} else if (centerH) {
			crossOffset = Math.max(0, (innerW - crossSize) / 2);
		}

		if (row) {
			layout(child, s.w, innerH, childIsText, out, x + p.left + cursor + cm.left, y + p.top + crossOffset + cm.top);
			cursor += s.w + cm.left + cm.right;
		} else {
			layout(child, innerW, s.h, childIsText, out, x + p.left + crossOffset + cm.left, y + p.top + cursor + cm.top);
			cursor += s.h + cm.top + cm.bottom;
		}
	}
	void contentW;
}

// --- Rendering --------------------------------------------------------------
function render(snapshot, width, height) {
	const FocusWidget = loadWidget();
	const tree = FocusWidget({ snapshot });
	const out = [];
	layout(tree, width, height, false, out);
	return out;
}

function describe(snapshot, width, height) {
	const boxes = render(snapshot, width, height);
	const lines = [];
	lines.push(`\n=== widget ${width}x${height}dp ===`);
	for (const box of boxes) {
		const label = box.kind === 'text' ? `"${box.text}"` : '(flex)';
		const visible = box.w > 0 && box.h > 0;
		lines.push(
			`  ${visible ? 'OK ' : 'ZERO'} ${label.padEnd(34)} x=${Math.round(box.x)} y=${Math.round(
				box.y
			)} w=${Math.round(box.w)} h=${Math.round(box.h)}`
		);
	}
	const texts = boxes.filter((b) => b.kind === 'text');
	const zeroTexts = texts.filter((b) => b.w <= 0 || b.h <= 0);
	if (zeroTexts.length) {
		lines.push(`  !! ${zeroTexts.length} text node(s) collapsed to zero size`);
	}
	return lines.join('\n');
}

const snapshot = {
	schemaVersion: 1,
	userId: 'u1',
	focusTaskId: 't1',
	focusTaskTitle: 'Plan weekly groceries',
	focusTaskDescription: 'Pick up a few things for the week.',
	focusTaskDeadline: '2026-11-18',
	focusTaskDeadlineTime: '12:00',
	remainingTaskCount: 2,
};

const emptySnapshot = {
	schemaVersion: 1,
	userId: 'u1',
	focusTaskId: null,
	focusTaskTitle: null,
	remainingTaskCount: 0,
};

const sizes = [
	[250, 110],
	[300, 150],
	[330, 180],
	[400, 200],
];

for (const [w, h] of sizes) {
	console.log(describe(snapshot, w, h));
}
console.log(describe(emptySnapshot, 300, 150));
