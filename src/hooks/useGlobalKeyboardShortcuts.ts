import { useEffect } from 'react';
import { useAudioStore } from '../store/useAudioStore';
import { extractTargetSnapshot, resolveGlobalShortcut } from '../lib/keyboardShortcuts';

/**
 * Mounts global Linux & WebKitGTK 4.1 safe keyboard shortcuts:
 * - Space: Play / Pause (when not typing or activating a focused control)
 * - Ctrl+K: Toggle Quick Search Command Palette
 * - Ctrl+B: Toggle Bit-Perfect <-> Spatial DSP mode
 * - Ctrl+D: Toggle Dynamic DAC Switcher slide-over drawer
 * - Escape: Close topmost open modal, popover, or drawer
 */
export function useGlobalKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useAudioStore.getState();
      const targetSnapshot = extractTargetSnapshot(e.target);

      const action = resolveGlobalShortcut(
        {
          key: e.key,
          code: e.code,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          repeat: e.repeat,
          isComposing: e.isComposing,
        },
        targetSnapshot,
        {
          commandPaletteOpen: state.commandPaletteOpen,
          signalPathInspectorOpen: state.signalPathInspectorOpen,
          hasActiveDrawer: state.activeDrawer !== 'none',
        }
      );

      if (!action) return;

      e.preventDefault();

      switch (action) {
        case 'toggle_command_palette': {
          const nextOpen = !state.commandPaletteOpen;
          if (nextOpen) {
            state.setSignalPathInspectorOpen(false);
          }
          state.setCommandPaletteOpen(nextOpen);
          break;
        }
        case 'toggle_audio_mode': {
          const currentMode = state.signalPath?.mode ?? 'bit_perfect';
          const nextMode = currentMode === 'bit_perfect' ? 'spatial' : 'bit_perfect';
          void state.setAudioMode(nextMode);
          break;
        }
        case 'toggle_dac_drawer': {
          state.setCommandPaletteOpen(false);
          state.toggleDrawer('dac');
          break;
        }
        case 'toggle_play_pause': {
          const isPlaying = state.playback?.status === 'playing';
          void state.sendTransport({ type: isPlaying ? 'Pause' : 'Play' });
          break;
        }
        case 'dismiss_overlay': {
          if (state.commandPaletteOpen) {
            state.setCommandPaletteOpen(false);
          } else if (state.signalPathInspectorOpen) {
            state.setSignalPathInspectorOpen(false);
          } else if (state.activeDrawer !== 'none') {
            state.closeDrawer();
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
