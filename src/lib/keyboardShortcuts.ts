/**
 * Pure Linux & WebKitGTK 4.1 Safe Global Keyboard Shortcut Resolver
 * Decoupled from DOM APIs for deterministic unit testing via node:test.
 */

export type GlobalShortcutAction =
  | 'toggle_play_pause'
  | 'toggle_command_palette'
  | 'toggle_audio_mode'
  | 'toggle_dac_drawer'
  | 'dismiss_overlay'
  | null;

export interface ShortcutKeyInput {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

export interface ShortcutTargetSnapshot {
  tagName: string;
  inputType?: string;
  isContentEditable?: boolean;
  role?: string | null;
}

export interface ShortcutOverlayState {
  commandPaletteOpen: boolean;
  signalPathInspectorOpen: boolean;
  hasActiveDrawer: boolean;
}

const INTERACTIVE_SPACE_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
  'A',
  'SUMMARY',
  'OPTION',
]);

const INTERACTIVE_SPACE_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'slider',
  'spinbutton',
  'button',
  'switch',
  'checkbox',
  'radio',
  'menuitem',
  'tab',
]);

/**
 * Returns true if the focused element should consume Space natively
 * (prevents WebKitGTK 4.1 double-firing button clicks or hijacking text/slider input).
 */
export function shouldTargetConsumeSpace(target: ShortcutTargetSnapshot | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const upperTag = target.tagName.toUpperCase();
  if (INTERACTIVE_SPACE_TAGS.has(upperTag)) return true;
  if (target.role && INTERACTIVE_SPACE_ROLES.has(target.role.toLowerCase())) return true;
  return false;
}

/**
 * Resolves a global Linux desktop shortcut without conflicting with WebKitGTK
 * IME composition, focused controls, or browser/OS modifiers.
 */
export function resolveGlobalShortcut(
  evt: ShortcutKeyInput,
  target: ShortcutTargetSnapshot | null,
  overlays: ShortcutOverlayState
): GlobalShortcutAction {
  if (evt.isComposing) return null;

  const lowerKey = evt.key.toLowerCase();
  const hasPrimaryMod = evt.ctrlKey || evt.metaKey;

  // Escape always dismisses the topmost open popover/modal/drawer
  if (evt.key === 'Escape') {
    if (
      overlays.commandPaletteOpen ||
      overlays.signalPathInspectorOpen ||
      overlays.hasActiveDrawer
    ) {
      return 'dismiss_overlay';
    }
    return null;
  }

  // Ignore auto-repeat for stateful toggles to avoid rapid flicker
  if (evt.repeat) return null;

  // Primary modifier shortcuts (Ctrl+K, Ctrl+B, Ctrl+D) — ignore Alt/Shift combos
  if (hasPrimaryMod && !evt.altKey && !evt.shiftKey) {
    if (lowerKey === 'k') return 'toggle_command_palette';
    if (lowerKey === 'b') return 'toggle_audio_mode';
    if (lowerKey === 'd') return 'toggle_dac_drawer';
    return null;
  }

  // Space: Play / Pause when not typing or activating a focused interactive control
  const isSpace = evt.key === ' ' || evt.code === 'Space';
  if (isSpace && !hasPrimaryMod && !evt.altKey && !evt.shiftKey) {
    if (overlays.commandPaletteOpen) return null;
    if (shouldTargetConsumeSpace(target)) return null;
    return 'toggle_play_pause';
  }

  return null;
}

/**
 * Safely extracts a lightweight target snapshot from a real DOM EventTarget.
 */
export function extractTargetSnapshot(target: EventTarget | null): ShortcutTargetSnapshot | null {
  if (!target || typeof target !== 'object' || !('tagName' in target)) {
    return null;
  }
  const el = target as HTMLElement;
  return {
    tagName: el.tagName || '',
    inputType: el instanceof HTMLInputElement ? el.type : undefined,
    isContentEditable: Boolean(el.isContentEditable),
    role: typeof el.getAttribute === 'function' ? el.getAttribute('role') : null,
  };
}
