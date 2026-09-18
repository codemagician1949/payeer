import confetti from "canvas-confetti";

export function celebrate() {
  const colors = ["#8b7cff", "#5bb8ff", "#5ee0a8", "#ffd166"];
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors, disableForReducedMotion: true });
  setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 }, colors, disableForReducedMotion: true }), 150);
  setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 }, colors, disableForReducedMotion: true }), 300);
}
