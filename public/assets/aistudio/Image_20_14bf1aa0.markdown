---
name: Audiophile Studio Dark
colors:
  surface: '#0B0D10'
  surface-dim: '#111317'
  surface-bright: '#37393d'
  surface-container-lowest: '#0c0e11'
  surface-container-low: '#1a1c1f'
  surface-container: '#1e2023'
  surface-container-high: '#282a2d'
  surface-container-highest: '#333538'
  on-surface: '#F2F4F8'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#e2e2e6'
  inverse-on-surface: '#2f3034'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#10B981'
  on-primary: '#06130E'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#38BDF8'
  on-secondary: '#06121A'
  secondary-container: '#00a6e0'
  on-secondary-container: '#00374d'
  tertiary: '#ffb3af'
  on-tertiary: '#650911'
  tertiary-container: '#fc7c78'
  on-tertiary-container: '#711419'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#c4e7ff'
  secondary-fixed-dim: '#7bd0ff'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#004c69'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3af'
  on-tertiary-fixed: '#410005'
  on-tertiary-fixed-variant: '#842225'
  background: '#111317'
  on-background: '#e2e2e6'
  surface-variant: '#333538'
  surface-elevated: '#14181F'
  surface-card: '#1C222D'
  border-subtle: '#2B3342'
  on-surface-muted: '#9AA4B2'
  primary-hover: '#34D399'
  warning: '#F59E0B'
  on-warning: '#1A1002'
  danger: '#EF4444'
  on-danger: '#1F0505'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 36.8px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  heading-md:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 25px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22.5px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  mono-telemetry:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 16px
  gutter-desktop: 24px
  margin: 16px
  margin-desktop: 32px
  space-xs: 4px
  space-sm: 8px
  space-md: 16px
  space-lg: 24px
  space-xl: 32px
---

version: "alpha"
name: "AuraHiFi Studio Dark"
description: "Precision dark audiophile console inspired by reference studio mastering hardware and high-contrast OLED DAC displays."
colors:
surface: "#0B0D10"
surface-elevated: "#14181F"
surface-card: "#1C222D"
border-subtle: "#2B3342"
on-surface: "#F2F4F8"
on-surface-muted: "#9AA4B2"
primary: "#10B981"
on-primary: "#06130E"
primary-hover: "#34D399"
secondary: "#38BDF8"
on-secondary: "#06121A"
warning: "#F59E0B"
on-warning: "#1A1002"
danger: "#EF4444"
on-danger: "#1F0505"
typography:
display-lg:
fontFamily: "Space Grotesk"
fontSize: 2rem
fontWeight: 600
lineHeight: 1.15
letterSpacing: "-0.02em"
heading-md:
fontFamily: "Space Grotesk"
fontSize: 1.25rem
fontWeight: 600
lineHeight: 1.25
body-md:
fontFamily: "Inter"
fontSize: 0.9375rem
fontWeight: 400
lineHeight: 1.5
label-caps:
fontFamily: "Inter"
fontSize: 0.75rem
fontWeight: 600
letterSpacing: "0.08em"
mono-telemetry:
fontFamily: "JetBrains Mono"
fontSize: 0.8125rem
fontWeight: 500
fontFeature: "'tnum' on"
rounded:
sm: 6px
md: 10px
lg: 14px
pill: 9999px
spacing:
xs: 4px
sm: 8px
md: 16px
lg: 24px
xl: 32px
motion:
snappy:
duration: 140ms
timingFunction: "cubic-bezier(0.2, 0, 1)"
mode-swap:
duration: 240ms
timingFunction: "ease-out"
components:
app-shell:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
panel-elevated:
backgroundColor: "{colors.surface-elevated}"
textColor: "{colors.on-surface}"
rounded: "{rounded.lg}"
padding: 16px
card-surface:
backgroundColor: "{colors.surface-card}"
textColor: "{colors.on-surface}"
rounded: "{rounded.md}"
padding: 16px
text-muted-row:
backgroundColor: "{colors.surface-elevated}"
textColor: "{colors.on-surface-muted}"
button-bitperfect:
backgroundColor: "{colors.primary}"
textColor: "{colors.on-primary}"
rounded: "{rounded.pill}"
padding: 12px
button-bitperfect-hover:
backgroundColor: "{colors.primary-hover}"
textColor: "{colors.on-primary}"
button-spatial:
backgroundColor: "{colors.secondary}"
textColor: "{colors.on-secondary}"
rounded: "{rounded.pill}"
padding: 12px
badge-dsp-warning:
backgroundColor: "{colors.warning}"
textColor: "{colors.on-warning}"
rounded: "{rounded.sm}"
padding: 6px
badge-error:
backgroundColor: "{colors.danger}"
textColor: "{colors.on-danger}"
rounded: "{rounded.sm}"
padding: 6px
divider-rule:
backgroundColor: "{colors.border-subtle}"
textColor: "{colors.on-surface}"
