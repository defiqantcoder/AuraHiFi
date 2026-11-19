import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGlobalShortcut,
  shouldTargetConsumeSpace,
  type ShortcutOverlayState,
} from './keyboardShortcuts';
import { isTauriRuntime, createAudioBridge, MockAudioBridge } from './audioBridge';
import { TauriAudioBridge } from './tauriAudioBridge';

const CLOSED_OVERLAYS: ShortcutOverlayState = {
  commandPaletteOpen: false,
  signalPathInspectorOpen: false,
  hasActiveDrawer: false,
};

test('Space toggles play/pause on body/main but never hijacks inputs, textareas, selects, buttons, or sliders', () => {
  assert.equal(
    resolveGlobalShortcut(
      { key: ' ', code: 'Space', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'BODY' },
      CLOSED_OVERLAYS
    ),
    'toggle_play_pause'
  );

  for (const blocked of [
    { tagName: 'INPUT', inputType: 'text' },
    { tagName: 'INPUT', inputType: 'range' },
    { tagName: 'TEXTAREA' },
    { tagName: 'SELECT' },
    { tagName: 'BUTTON' },
    { tagName: 'DIV', isContentEditable: true },
    { tagName: 'DIV', role: 'slider' },
  ]) {
    assert.equal(shouldTargetConsumeSpace(blocked), true);
    assert.equal(
      resolveGlobalShortcut(
        { key: ' ', code: 'Space', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
        blocked,
        CLOSED_OVERLAYS
      ),
      null
    );
  }
});

test('Ctrl+K, Ctrl+B, and Ctrl+D resolve exact global actions and ignore key repeats or IME composition', () => {
  assert.equal(
    resolveGlobalShortcut(
      { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'INPUT' },
      CLOSED_OVERLAYS
    ),
    'toggle_command_palette'
  );

  assert.equal(
    resolveGlobalShortcut(
      { key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'MAIN' },
      CLOSED_OVERLAYS
    ),
    'toggle_audio_mode'
  );

  assert.equal(
    resolveGlobalShortcut(
      { key: 'd', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'MAIN' },
      CLOSED_OVERLAYS
    ),
    'toggle_dac_drawer'
  );

  assert.equal(
    resolveGlobalShortcut(
      { key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: true },
      { tagName: 'MAIN' },
      CLOSED_OVERLAYS
    ),
    null
  );

  assert.equal(
    resolveGlobalShortcut(
      { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: true },
      { tagName: 'INPUT' },
      CLOSED_OVERLAYS
    ),
    null
  );
});

test('Escape dismisses overlays only when a modal, popover, or drawer is open', () => {
  assert.equal(
    resolveGlobalShortcut(
      { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'BODY' },
      CLOSED_OVERLAYS
    ),
    null
  );

  assert.equal(
    resolveGlobalShortcut(
      { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'INPUT' },
      { commandPaletteOpen: true, signalPathInspectorOpen: false, hasActiveDrawer: false }
    ),
    'dismiss_overlay'
  );

  assert.equal(
    resolveGlobalShortcut(
      { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'BODY' },
      { commandPaletteOpen: false, signalPathInspectorOpen: true, hasActiveDrawer: false }
    ),
    'dismiss_overlay'
  );

  assert.equal(
    resolveGlobalShortcut(
      { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
      { tagName: 'BODY' },
      { commandPaletteOpen: false, signalPathInspectorOpen: false, hasActiveDrawer: true }
    ),
    'dismiss_overlay'
  );
});

test('isTauriRuntime and createAudioBridge select MockAudioBridge in browser/Node and TauriAudioBridge when __TAURI_INTERNALS__ exists', () => {
  assert.equal(isTauriRuntime(undefined), false);
  assert.equal(isTauriRuntime({}), false);
  assert.equal(isTauriRuntime({ __TAURI_INTERNALS__: {} }), true);

  const mockBridge = createAudioBridge({});
  assert.ok(mockBridge instanceof MockAudioBridge);

  const tauriBridge = createAudioBridge({ __TAURI_INTERNALS__: {} });
  assert.ok(tauriBridge instanceof TauriAudioBridge);
});
