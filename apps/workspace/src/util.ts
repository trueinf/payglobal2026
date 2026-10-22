export const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const fmtDateTime = (d: Date) => `${fmtDate(d)} ${fmtTime(d)}`;
export const isToday = (d: Date) => { const n = new Date(); return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); };
export const isThisMonth = (d: Date) => { const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); };
export const shortWhen = (d: Date) => isToday(d) ? fmtTime(d) : `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
export const initials = (name: string) => name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
export const avatarColor = (name: string) => { const palette = ["#0f6cbd", "#0e7a5f", "#7a3e9d", "#b4530a", "#0b6a85", "#8a1c3b"]; let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return palette[h % palette.length]; };
export const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;
