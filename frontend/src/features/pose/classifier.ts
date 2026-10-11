/** Rule-based body activity classification on MediaPipe's 33 pose landmarks (person's perspective). */
import type { Landmark, PoseActivity } from '../vision/types';

const L = {
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
} as const;

export function classifyPose(lm: Landmark[], aspect = 1): { activity: PoseActivity; confidence: number } {
  if (!lm || lm.length < 33) return { activity: 'unknown', confidence: 0 };
  const vis = (i: number) => lm[i].visibility ?? 0;
  if (vis(L.leftShoulder) < 0.5 || vis(L.rightShoulder) < 0.5) return { activity: 'unknown', confidence: 0 };

  const ls = lm[L.leftShoulder], rs = lm[L.rightShoulder];
  const shoulderW = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y) || 1e-6;
  const shoulderY = (ls.y + rs.y) / 2;

  const wristUp = (w: number, s: Landmark) => vis(w) > 0.5 && lm[w].y < s.y - 0.25 * shoulderW;
  const leftUp = wristUp(L.leftWrist, ls);
  const rightUp = wristUp(L.rightWrist, rs);

  if (leftUp && rightUp) return { activity: 'arms_raised', confidence: 0.9 };

  const armOut = (w: number, e: number, s: Landmark) =>
    vis(w) > 0.5 &&
    vis(e) > 0.5 &&
    Math.abs(lm[w].y - s.y) < 0.4 * shoulderW &&
    Math.abs(lm[e].y - s.y) < 0.4 * shoulderW &&
    Math.abs(lm[w].x - s.x) * aspect > 1.1 * shoulderW;
  if (armOut(L.leftWrist, L.leftElbow, ls) && armOut(L.rightWrist, L.rightElbow, rs)) {
    return { activity: 't_pose', confidence: 0.85 };
  }
  if (leftUp) return { activity: 'left_arm_raised', confidence: 0.85 };
  if (rightUp) return { activity: 'right_arm_raised', confidence: 0.85 };

  if (vis(L.leftHip) > 0.5 && vis(L.rightHip) > 0.5) {
    const hipY = (lm[L.leftHip].y + lm[L.rightHip].y) / 2;
    const torso = Math.max(1e-6, hipY - shoulderY);
    // In the raw (unmirrored) camera image the person's left side is on the image's right.
    const dx = ((ls.x + rs.x) / 2 - (lm[L.leftHip].x + lm[L.rightHip].x) / 2) * aspect;
    if (dx > 0.3 * torso) return { activity: 'leaning_left', confidence: 0.75 };
    if (dx < -0.3 * torso) return { activity: 'leaning_right', confidence: 0.75 };

    if (vis(L.leftKnee) > 0.5 && vis(L.rightKnee) > 0.5) {
      const kneeY = (lm[L.leftKnee].y + lm[L.rightKnee].y) / 2;
      if (kneeY - hipY < 0.45 * torso) return { activity: 'sitting', confidence: 0.75 };
      return { activity: 'standing', confidence: 0.8 };
    }
  }
  return { activity: 'unknown', confidence: 0.5 };
}
