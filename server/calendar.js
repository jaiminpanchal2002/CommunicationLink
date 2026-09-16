import { z } from 'zod';

const email = value => z.email().parse(String(value).trim());
export function organizerEmail(env, fallback) {
  const configured=env.CALENDAR_ORGANIZER_EMAIL || env.SMTP_FROM;
  if(!configured)return email(fallback);
  const value=String(configured).match(/<([^<>]+)>/)?.[1] || configured;
  return email(value);
}
export const escapeCalendarText=value=>String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
function fold(line) {
  const lines=[];let part='';
  for(const char of line) {if(Buffer.byteLength(part+char,'utf8')>75){lines.push(part);part=' ';}part+=char;}
  lines.push(part);return lines.join('\r\n');
}
export function calendarSnapshot(topic,users,organizer) {
  return {topicId:topic.id,date:topic.date,time:topic.time,duration:topic.duration,sequence:topic.calendarSequence||0,updatedAt:topic.calendarUpdatedAt||topic.createdAt,organizer:email(organizer),attendees:users.map(u=>email(u.email))};
}
export function buildCalendar(snapshot) {
  const start=Date.parse(`${snapshot.date}T${snapshot.time}:00+05:30`);
  if(!Number.isFinite(start)||!Number.isInteger(snapshot.duration)||snapshot.duration<1)throw new Error('Invalid calendar schedule.');
  const sequence=z.number().int().min(0).parse(snapshot.sequence);
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Together//Private conversations//EN','CALSCALE:GREGORIAN','METHOD:REQUEST','BEGIN:VEVENT',
    `UID:${escapeCalendarText(snapshot.topicId)}@together.local`,
    `DTSTAMP:${utc(snapshot.updatedAt)}`,`SEQUENCE:${sequence}`,`DTSTART:${utc(start)}`,`DTEND:${utc(start+snapshot.duration*60000)}`,
    'SUMMARY:Together: our conversation','DESCRIPTION:Open Together to review your private conversation.','CLASS:PRIVATE','STATUS:CONFIRMED','TRANSP:OPAQUE',
    `ORGANIZER:mailto:${email(snapshot.organizer)}`,
    ...[...new Set(snapshot.attendees)].map(address=>`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email(address)}`),
    'END:VEVENT','END:VCALENDAR'];
  return lines.map(fold).join('\r\n')+'\r\n';
}
