import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, escapeCalendarText, organizerEmail } from './calendar.js';
import { createApp } from './app.js';

test('iCalendar uses UTC, stable UID, sequence, RSVP and safe folded CRLF lines',()=>{
 const snapshot={topicId:'a'.repeat(100)+'🙂',date:'2030-01-05',time:'10:30',duration:45,sequence:2,updatedAt:'2030-01-01T00:00:00Z',organizer:'organizer@example.com',attendees:['one@example.com','two@example.com']};
 const calendar=buildCalendar(snapshot),unfolded=calendar.replace(/\r\n /g,'');
 assert.match(unfolded,/DTSTART:20300105T050000Z\r\nDTEND:20300105T054500Z/);
 assert.match(unfolded,/SEQUENCE:2/);assert.match(unfolded,/METHOD:REQUEST/);assert.equal((unfolded.match(/RSVP=TRUE/g)||[]).length,2);
 assert.match(unfolded,/SUMMARY:Together: our conversation/);
 assert.ok(calendar.split('\r\n').every(line=>Buffer.byteLength(line)<=75));assert.ok(!calendar.replaceAll('\r\n','').includes('\n'));
 assert.equal(escapeCalendarText('a\r\nB;c,d\\e'),'a\\nB\\;c\\,d\\\\e');
 assert.throws(()=>buildCalendar({...snapshot,organizer:'x@example.com\r\nINJECTED:yes'}));
 assert.equal(organizerEmail({SMTP_FROM:'Together <mail@example.com>'},'fallback@example.com'),'mail@example.com');
 assert.equal(organizerEmail({},'fallback@example.com'),'fallback@example.com');
 assert.equal(unfolded.match(/UID:.+/)[0],buildCalendar({...snapshot,sequence:3,time:'11:00'}).replace(/\r\n /g,'').match(/UID:.+/)[0]);
});

test('priority, private calendar access, calendar email snapshots and reschedule superseding',async t=>{
 const mails=[];
 const service=createApp({database:':memory:',env:{SETUP_CODE:'test',SMTP_HOST:'fake.invalid',SMTP_FROM:'Together <calendar@example.com>'},createTransport:()=>({sendMail:async message=>{mails.push(message);}})});
 const server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));service.close();});
 const url=`http://127.0.0.1:${server.address().port}/api`;
 async function call(path,method='GET',body,cookie) {const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const raw=await response.text();return {status:response.status,data:response.headers.get('content-type')?.includes('json')?JSON.parse(raw):raw,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 const a=await call('/register','POST',{name:'A',email:'a@example.com',password:'secure-password',whatsapp:'+919000000001',inviteCode:'test'});
 const invite=await call('/invite','GET',undefined,a.cookie);
 const b=await call('/register','POST',{name:'B',email:'b@example.com',password:'secure-password',whatsapp:'+919000000002',inviteCode:invite.data.inviteCode},undefined);
 assert.equal((await call('/topics','POST',{title:'Secret',category:'Life',priority:'bad'},a.cookie)).status,400);
 const draft=await call('/topics','POST',{title:'Secret title',description:'Private text',category:'Life',draft:true,priority:'low'},a.cookie);assert.equal(draft.data.priority,'low');
 const edit=await call('/topics/'+draft.data.id,'PATCH',{action:'edit',priority:'urgent'},a.cookie);assert.equal(edit.data.priority,'urgent');
 assert.equal((await call('/topics/'+draft.data.id+'/calendar','GET',undefined,b.cookie)).status,404);
 await call('/topics/'+draft.data.id,'PATCH',{action:'publish'},a.cookie);
 const future=new Date(Date.now()+86400000*14);while(future.getUTCDay()!==6)future.setUTCDate(future.getUTCDate()+1);const date=future.toISOString().slice(0,10);
 const first=await call('/topics/'+draft.data.id,'PATCH',{action:'schedule',date,time:'10:00',duration:30},b.cookie);assert.equal(first.status,200);assert.equal(first.data.calendarSequence,0);
 const second=await call('/topics/'+draft.data.id,'PATCH',{action:'schedule',date,time:'11:00',duration:45},b.cookie);assert.equal(second.data.calendarSequence,1);
 assert.equal((await call('/topics/'+draft.data.id+'/calendar')).status,401);
 const download=await call('/topics/'+draft.data.id+'/calendar','GET',undefined,a.cookie);assert.equal(download.status,200);assert.match(download.data,/SEQUENCE:1/);assert.ok(!download.data.includes('Secret title'));assert.ok(!download.data.includes('Private text'));
 await service.runWorker();
 const invites=mails.filter(m=>m.icalEvent);assert.equal(invites.length,1);assert.deepEqual(invites[0].to.sort(),['a@example.com','b@example.com']);assert.equal(invites[0].icalEvent.method,'REQUEST');assert.match(invites[0].icalEvent.content,/SEQUENCE:1/);
 const notices=(await call('/state','GET',undefined,a.cookie)).data.notifications.filter(n=>n.type==='schedule');
 assert.equal(notices.find(n=>n.calendar.sequence===0).emailStatus,'superseded');assert.equal(notices.find(n=>n.calendar.sequence===1).emailStatus,'accepted');
 const normal=await call('/topics','POST',{title:'No priority',category:'Life',draft:true},a.cookie);assert.equal(normal.data.priority,'normal');
 const saved=JSON.parse(service.db.prepare("SELECT data FROM records WHERE kind='topics' AND id=?").get(normal.data.id).data);delete saved.priority;
 service.db.prepare("UPDATE records SET data=? WHERE kind='topics' AND id=?").run(JSON.stringify(saved),saved.id);
 assert.equal((await call('/state','GET',undefined,a.cookie)).data.topics.find(t=>t.id===saved.id).priority,'normal');
});
