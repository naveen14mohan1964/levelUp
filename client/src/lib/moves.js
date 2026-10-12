// Animated stick-figure demos for moves that have no matching photo. Side view, facing right; floor at y = 140.
// Each move: props to draw (wall, chair, step…) and looping keyframes (see lib/stickman.js for the pose format).
// Coordinates are SVG units in a 200 × 150 box.

const ANKLE_Y = 136;

export const MOVES = {
  // Hands on the wall at chest height, body in one straight line from heels to head, chest to the wall and back.
  'wall-push-up': {
    props: [{ type: 'wall', x: 165 }],
    frames: [
      {
        pose: { lean: -70, hand: [163, 38], foot: [78, ANKLE_Y], toe: -15, elbow: 'down' },
        hold: 350, move: 1100,
      },
      {
        pose: { lean: -58, hand: [163, 38], foot: [78, ANKLE_Y], toe: -25, elbow: 'down' },
        hold: 250, move: 1100,
      },
    ],
    caption: 'Body stays straight like a plank; only the elbows bend',
  },

  // Fingertips on the wall, rise onto the balls of the feet, lower slowly.
  'calf-raise': {
    props: [{ type: 'wall', x: 150 }],
    frames: [
      { pose: { hip: [110, 65], torso: -90, hand: [146, 48], foot: [112, ANKLE_Y], toe: 0, elbow: 'down' }, hold: 400, move: 800 },
      { pose: { hip: [110, 56.4], torso: -90, hand: [146, 48], foot: [112, 127.4], toe: 60, elbow: 'down' }, hold: 700, move: 1600 },
    ],
    caption: 'Up in 1 second, pause, down in 2 seconds',
  },

  // On hands and knees; reach one arm forward and the OPPOSITE leg back, hips level; then switch.
  'bird-dog': {
    props: [{ type: 'mat' }],
    frames: [
      {
        pose: { hip: [80, 95], torso: 0, head: 8, hand: [126, 138], hand2: [126, 138], foot: [44, ANKLE_Y], foot2: [44, ANKLE_Y], toe: 180, knee: 'down', elbow: 'back' },
        hold: 300, move: 900,
      },
      {
        pose: { hip: [80, 95], torso: 0, head: 8, hand: [174, 91], hand2: [126, 138], foot: [44, ANKLE_Y], foot2: [8, 92], toe: 180, toe2: 180, knee: 'down', knee2: 'up', elbow: 'back' },
        hold: 1100, move: 900,
      },
      {
        pose: { hip: [80, 95], torso: 0, head: 8, hand: [126, 138], hand2: [126, 138], foot: [44, ANKLE_Y], foot2: [44, ANKLE_Y], toe: 180, knee: 'down', elbow: 'back' },
        hold: 300, move: 900,
      },
      {
        pose: { hip: [80, 95], torso: 0, head: 8, hand: [126, 138], hand2: [174, 91], foot: [8, 92], foot2: [44, ANKLE_Y], toe: 180, toe2: 180, knee: 'up', knee2: 'down', elbow: 'back' },
        hold: 1100, move: 900,
      },
    ],
    caption: 'Opposite arm and leg; hips stay level, hold 2 seconds',
  },
};
