import type { Gesture, PoseActivity } from '../vision/types';

export interface GestureInfo {
  id: Exclude<Gesture, 'unknown'>;
  label: string;
  emoji: string;
  description: string;
  /** What the gesture does in the Particle Studio. */
  action: string;
  twoHanded?: boolean;
}

export const GESTURES: GestureInfo[] = [
  { id: 'open_palm', label: 'Open Palm', emoji: '✋', description: 'All five fingers extended', action: 'Spread particles outward' },
  { id: 'closed_fist', label: 'Closed Fist', emoji: '✊', description: 'All fingers curled in', action: 'Attract particles to the hand' },
  { id: 'pinch', label: 'Pinch', emoji: '🤏', description: 'Thumb and index tips touching', action: 'Scale formation with pinch width' },
  { id: 'one_finger', label: 'Point', emoji: '☝️', description: 'Only the index finger extended', action: 'Steer the interaction cursor' },
  { id: 'victory', label: 'Victory', emoji: '✌️', description: 'Index and middle spread in a V', action: 'Next formation' },
  { id: 'two_finger', label: 'Two Fingers', emoji: '🤞', description: 'Index and middle held together', action: 'Previous formation' },
  { id: 'thumbs_up', label: 'Thumbs Up', emoji: '👍', description: 'Fist with the thumb pointing up', action: 'Energy burst + faster spin' },
  { id: 'thumbs_down', label: 'Thumbs Down', emoji: '👎', description: 'Fist with the thumb pointing down', action: 'Reverse rotation' },
  { id: 'waving', label: 'Wave', emoji: '👋', description: 'Open hand moved side to side', action: 'Ripple wave through the field' },
  { id: 'both_hands_raised', label: 'Both Hands Up', emoji: '🙌', description: 'Two open palms raised high', action: 'Expand the environment', twoHanded: true },
  { id: 'hands_together', label: 'Hands Together', emoji: '🙏', description: 'Both palms brought close', action: 'Compact formation', twoHanded: true },
];

export const GESTURE_MAP = Object.fromEntries(GESTURES.map((g) => [g.id, g])) as Record<GestureInfo['id'], GestureInfo>;

export function gestureLabel(g: Gesture | null | undefined): string {
  if (!g || g === 'unknown') return '—';
  return GESTURE_MAP[g]?.label ?? g;
}

export function gestureEmoji(g: Gesture | null | undefined): string {
  if (!g || g === 'unknown') return '·';
  return GESTURE_MAP[g]?.emoji ?? '·';
}

export const POSE_LABELS: Record<PoseActivity, string> = {
  standing: 'Standing',
  sitting: 'Sitting',
  arms_raised: 'Arms raised',
  left_arm_raised: 'Left arm raised',
  right_arm_raised: 'Right arm raised',
  t_pose: 'T-pose',
  leaning_left: 'Leaning left',
  leaning_right: 'Leaning right',
  unknown: 'Upper body',
};
