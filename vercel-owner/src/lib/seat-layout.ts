export const SEAT_ROWS = ['A','B','C','D','E','F'];
export const SEAT_LABELS = SEAT_ROWS.flatMap(row => Array.from({length:9},(_,i)=>`${row}${i+1}`));
export function normalizeSeat(value:unknown):string { const label=String(value??'').trim().toUpperCase(); if(!label)return ''; if(SEAT_LABELS.includes(label))return label; const n=Number(label); if(Number.isInteger(n)&&n>=1&&n<=54)return SEAT_LABELS[n-1]; const old=label.match(/^([A-F])-0?([1-9])$/); return old?old[1]+old[2]:label; }
