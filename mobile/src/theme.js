// KSU black & gold palette used across every screen.
export const colors = {
  bg: '#FAF7F0',
  surface: '#FFFFFF',
  ink: '#111111',
  inkSoft: '#3A3A3A',
  muted: '#6E6A60',
  line: '#E7E1D3',
  gold: '#FFC629',
  goldSoft: '#FFF3CC',
  black: '#0B0B0B',
  danger: '#C1121F',
  success: '#2D6A4F',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const type = {
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.6, color: colors.muted },
  h1: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.inkSoft, lineHeight: 22 },
  small: { fontSize: 13, color: colors.muted },
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export function fmtTime(d) {
  const date = new Date(d);
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function fmtRange(start, end) {
  const a = fmtTime(start), b = fmtTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

export const fmt = {
  shortDay: (d) => { const x = new Date(d); return `${DAYS[x.getDay()]}, ${MONTHS[x.getMonth()]} ${x.getDate()}`; },
  longDay: (d) => { const x = new Date(d); return `${LONG_DAYS[x.getDay()]}, ${LONG_MONTHS[x.getMonth()]} ${x.getDate()}`; },
  month: (d) => MONTHS[new Date(d).getMonth()],
  day: (d) => String(new Date(d).getDate()),
};
