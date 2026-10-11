/**
 * Stable per-subject hue, derived from the normalised subject name.
 *
 * Common Swedish school subjects get hand-picked hues so the usual timetable
 * reads well (maths blue, Swedish yellow, English red, …). Anything else is
 * matched on a known subject word it contains ("Slöjd åk8" → slöjd, so a
 * hand-in's course gets its subject's colour), and otherwise hashed (FNV-1a) onto a 12-step hue wheel so neighbouring hashes still look
 * clearly different. The CSS turns the hue into OKLCH colours so every subject
 * has the same perceived weight in both themes.
 */
const KNOWN: Record<string, number> = {
  matematik: 250,
  ma: 250,
  svenska: 85,
  sv: 85,
  'svenska som andraspråk': 85,
  engelska: 30,
  en: 30,
  no: 150,
  biologi: 150,
  kemi: 165,
  fysik: 180,
  so: 320,
  historia: 320,
  geografi: 335,
  samhällskunskap: 310,
  religionskunskap: 300,
  'idrott och hälsa': 200,
  idrott: 200,
  idh: 200,
  slöjd: 60,
  träslöjd: 60,
  textilslöjd: 60,
  musik: 275,
  bild: 0,
  teknik: 230,
  'hem- och konsumentkunskap': 45,
  hemkunskap: 45,
  hkk: 45,
  'moderna språk': 350,
  spanska: 350,
  tyska: 350,
  franska: 350,
  lunch: 110,
  rast: 110,
  mentorstid: 190,
  'elevens val': 300,
};

const WHEEL_STEPS = 12;

export function subjectHue(subject: string): number {
  const known = KNOWN[subject];
  if (known !== undefined) return known;
  // Short codes (ma, sv, no, …) are too ambiguous to match inside other text.
  const word = subject.split(/[^\p{L}]+/u).find((w) => w.length > 3 && KNOWN[w] !== undefined);
  if (word) return KNOWN[word];
  let h = 0x811c9dc5;
  for (let i = 0; i < subject.length; i++) {
    h ^= subject.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Offset by 15° so hashed hues sit between the hand-picked ones.
  return ((h % WHEEL_STEPS) * (360 / WHEEL_STEPS) + 15) % 360;
}
