import express from 'express';
import { createSqliteStore } from './store.js';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import {registerIntegrations} from './integrations.js';
import { buildCalendar, calendarSnapshot, organizerEmail } from './calendar.js';
import { renderNotificationEmail } from './email-template.js';

const token = () => randomBytes(32).toString('hex');
const hash = value => createHash('sha256').update(value).digest('hex');
const publicUser = u => u && ({ id:u.id, name:u.name, email:u.email, whatsapp:u.whatsapp });
const monthNow = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).format(new Date());
const text = max => z.string().trim().min(1).max(max);
const money = z.number().finite().min(0).max(1e10);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const whatsappNumber = z.string().trim().transform(s=>s.replace(/[\s()-]/g,'')).pipe(z.string().regex(/^\+[1-9][0-9]{7,14}$/,'Use international format, for example +919876543210.'));
const digits = value => String(value||'').replace(/\D/g,'');

export function createApp(options={}) {
  const env = options.env || process.env;
  const store = options.store || createSqliteStore(options.database || env.DATABASE_PATH || 'together.sqlite');
  const { all, get, put, del } = store;
  const app=express(); app.disable('x-powered-by'); app.use(express.json({limit:'32kb'}));
  app.use((_req,res,next)=>{
    res.set('X-Content-Type-Options','nosniff');
    res.set('X-Frame-Options','DENY');
    res.set('Referrer-Policy','no-referrer');
    res.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(env.NODE_ENV==='production') {
      res.set('Strict-Transport-Security','max-age=31536000');
      res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    }
    next();
  });
  const origins = (env.APP_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001,http://localhost:3001').split(',').map(x=>x.trim());
  const limits = new Map();
  app.use('/api',(req,res,next)=>{
    res.set('Cache-Control','no-store'); res.set('X-Content-Type-Options','nosniff');
    const sfs=req.headers['sec-fetch-site'];
    const crossOrigin=sfs?(sfs!=='same-origin'&&sfs!=='none'):(!!req.headers.origin&&!origins.includes(req.headers.origin));
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && crossOrigin) return res.status(403).json({error:'This origin is not allowed.'});
    next();
  });
  const limited=(req,res,next)=>{
    const key=req.ip,now=Date.now(); let entry=limits.get(key);
    if(!entry||entry.until<now) entry={count:0,until:now+900000};
    limits.set(key,entry); if(++entry.count>30) return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
    if(limits.size>10000) for(const [k,v] of limits) if(v.until<now) limits.delete(k);
    next();
  };
  const sessionCookie = (value,maxAge=604800) => `together_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${env.NODE_ENV==='production'?'; Secure':''}`;
  const signIn=(res,user)=>{const raw=token();put('sessions',{id:hash(raw),userId:user.id,expires:Date.now()+604800000});res.setHeader('Set-Cookie',sessionCookie(raw));};
  const auth=(req,res,next)=>{const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('together_session='))?.slice(17);const s=raw&&get('sessions',hash(raw));req.user=s&&s.expires>Date.now()&&get('users',s.userId);req.session=s;if(!req.user)return res.status(401).json({error:'Please sign in.'});next();};
  const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
  const partner=user=>all('users').find(u=>u.id!==user.id);
  const notify=(userId,type,title,dedupe,calendar)=>{
    if(!userId)return;
    if(dedupe&&all('notifications').some(n=>n.dedupe===dedupe))return;
    const n=put('notifications',{id:token(),userId,type,title,read:false,createdAt:new Date().toISOString(),dedupe,...(calendar?{calendar}:{})});
    for(const channel of ['email','whatsapp']) put('outbox',{id:token(),notificationId:n.id,userId,channel,status:'pending',attempts:0,nextAttempt:Date.now()});
  };
  const localSetup=req=>env.ALLOW_LOCAL_SETUP==='true'&&env.NODE_ENV!=='production'&&!env.SETUP_CODE&&all('users').length===0&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['localhost','127.0.0.1','[::1]'].includes(req.hostname)&&!req.headers['x-forwarded-for'];
  app.get('/api/setup',(req,res)=>res.json({needsSetup:all('users').length===0,registrationOpen:all('users').length<2,setupConfigured:!!env.SETUP_CODE,localSetupAllowed:localSetup(req)}));
  app.post('/api/register',limited,(req,res)=>{
    const body=z.object({name:text(80),email:z.string().trim().max(254).pipe(z.email()).transform(s=>s.toLowerCase()),password:z.string().min(12).max(200),whatsapp:whatsappNumber,inviteCode:z.string().trim().optional()}).parse(req.body);
    const users=all('users');if(users.length>=2)fail('This household already has two members.',403);
    const expected=users.length?get('settings','invite')?.code:env.SETUP_CODE;
    if(!localSetup(req)&&(!expected||!body.inviteCode||hash(body.inviteCode)!==hash(expected)))fail(users.length?'Ask your partner for the invite code from Settings, then enter it here.':'Enter the private setup code configured by the person hosting Together.',403);
    if(users.some(u=>u.email===body.email))fail('Unable to register with these details.');
    const salt=token(),user=put('users',{id:token(),name:body.name,email:body.email,whatsapp:body.whatsapp,salt,password:scryptSync(body.password,salt,64).toString('hex')});
    if(users.length===0)for(const rule of [
      'We listen without interrupting and give each other time to finish.',
      'We ask whether it is a good time before starting a difficult conversation.',
      'We focus on one topic at a time.',
      'Either of us can ask for a pause, and we agree on a time to return.',
      'We remember that we are on the same team.'
    ])put('agreements',{id:token(),text:rule,acceptedBy:[]});
    if(users.length)del('settings','invite');signIn(res,user);res.status(201).json({user:publicUser(user)});
  });
  app.post('/api/login',limited,(req,res)=>{
    const body=z.object({email:z.string(),password:z.string().max(200)}).parse(req.body),u=all('users').find(u=>u.email===body.email.trim().toLowerCase());
    const digest=scryptSync(body.password,u?.salt||'unknown-account',64);
    if(!u||!timingSafeEqual(digest,Buffer.from(u.password,'hex')))fail('Email or password is incorrect.',401);
    signIn(res,u);res.json({user:publicUser(u)});
  });
  app.post('/api/logout',auth,(req,res)=>{del('sessions',req.session.id);res.setHeader('Set-Cookie',sessionCookie('',0));res.json({ok:true});});
  app.use('/api',auth);
  registerIntegrations(app,env,options);
  app.get('/api/invite',(req,res)=>{if(all('users').length>=2)fail('Your household is full.');let invite=get('settings','invite');if(!invite)invite=put('settings',{id:'invite',code:token()});res.json({inviteCode:invite.code});});
  const evolutionReady=()=>!!(env.EVOLUTION_API_URL&&env.EVOLUTION_API_KEY&&env.EVOLUTION_INSTANCE);
  const openwaReady=()=>!!(env.OPENWA_BASE_URL&&env.OPENWA_API_KEY&&env.OPENWA_SESSION_ID);
  const integration=()=>({email:{configured:!!(env.SMTP_HOST&&env.SMTP_FROM)},calendar:{configured:!!(env.SMTP_HOST&&env.SMTP_FROM),mode:'email_invitation'},whatsapp:{configured:evolutionReady()||openwaReady(),provider:evolutionReady()?'evolution':openwaReady()?'openwa':null}});
  const financeFor=month=>({revision:0,contribution:'proportional',...(get('finance',month)||{id:month,month,incomes:{},expenses:0,savings:0,accounts:[],transfers:[],contribution:'proportional'})});
  const newest=items=>items.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  app.get('/api/state',(req,res)=>{
    const month=monthSchema.parse(req.query.month||monthNow());
    res.json({user:publicUser(req.user),partner:publicUser(partner(req.user))||null,topics:newest(all('topics').filter(t=>t.status!=='draft'||t.authorId===req.user.id).map(t=>({priority:'normal',...t}))),goals:all('goals'),agreements:all('agreements'),appreciations:newest(all('appreciations')),moods:all('moods'),notifications:newest(all('notifications').filter(n=>n.userId===req.user.id)).map(n=>({...n,emailStatus:all('outbox').find(o=>o.notificationId===n.id&&o.channel==='email')?.status,whatsappStatus:all('outbox').find(o=>o.notificationId===n.id&&o.channel==='whatsapp')?.status,delivery:all('outbox').filter(o=>o.notificationId===n.id).map(o=>({channel:o.channel,status:o.status,attempts:o.attempts}))})),finance:financeFor(month),integration:integration()});
  });
  app.post('/api/topics',(req,res)=>{
    const b=z.object({title:text(160),description:z.string().max(10000).default(''),category:text(50),priority:z.enum(['low','normal','urgent']).default('normal'),draft:z.boolean().default(false)}).parse(req.body);
    if(!b.draft&&!partner(req.user))fail('Invite your partner before publishing a topic.');
    const topic=put('topics',{id:token(),authorId:req.user.id,title:b.title,description:b.description,category:b.category,priority:b.priority,status:b.draft?'draft':'pending',date:null,time:null,duration:30,outcome:'',createdAt:new Date().toISOString()});
    if(!b.draft)notify(partner(req.user)?.id,'topic','Your partner has shared a new topic. Open Together to read it.');res.status(201).json(topic);
  });
  app.patch('/api/topics/:id',(req,res)=>{
    const b=z.object({action:z.enum(['edit','publish','schedule','resolve']),title:text(160).optional(),description:z.string().max(10000).optional(),category:text(50).optional(),priority:z.enum(['low','normal','urgent']).optional(),date:z.string().optional(),time:z.string().optional(),duration:z.number().int().min(15).max(240).optional(),outcome:z.string().max(10000).optional()}).parse(req.body);
    const t=get('topics',req.params.id);if(!t||(t.status==='draft'&&t.authorId!==req.user.id))fail('Topic not found.',404);
    if(b.action==='edit') {
      if(t.authorId!==req.user.id||t.status!=='draft')fail('Only your own draft can be edited.',403);
      for(const field of ['title','description','category','priority'])if(b[field]!==undefined)t[field]=b[field];
    }
    if(b.action==='publish') {if(t.authorId!==req.user.id||t.status!=='draft')fail('Only your own draft can be published.',403);if(!partner(req.user))fail('Invite your partner first.');t.status='pending';notify(partner(req.user).id,'topic','Your partner has shared a new topic. Open Together to read it.');}
    if(b.action==='schedule') {
      if(t.authorId===req.user.id)fail('Only the recipient can choose the date and time.',403);
      if(!['pending','scheduled'].includes(t.status))fail('This topic cannot be scheduled.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time||''))fail('Choose a valid date and time.');
      const day=new Date(`${b.date}T00:00:00Z`);if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==b.date||![0,6].includes(day.getUTCDay()))fail('Choose a Saturday or Sunday in Asia/Kolkata.');
      const start=Date.parse(`${b.date}T${b.time}:00+05:30`),duration=b.duration||30,end=start+duration*60000;if(start<=Date.now())fail('Choose a future time.');
      const endLocal=new Date(end+19800000-1);if(![0,6].includes(endLocal.getUTCDay()))fail('The full conversation must fit on the weekend.');
      if(all('topics').some(x=>x.id!==t.id&&x.status==='scheduled'&&start<Date.parse(`${x.date}T${x.time}:00+05:30`)+x.duration*60000&&end>Date.parse(`${x.date}T${x.time}:00+05:30`)))fail('That time overlaps another conversation.');
      const organizer=t.calendarOrganizer||organizerEmail(env,req.user.email);
      Object.assign(t,{status:'scheduled',date:b.date,time:b.time,duration,calendarSequence:(t.calendarSequence??-1)+1,calendarUpdatedAt:new Date().toISOString(),calendarOrganizer:organizer});
      notify(t.authorId,'schedule',`Your partner scheduled a conversation for ${b.date} at ${b.time} (Asia/Kolkata).`,undefined,calendarSnapshot(t,all('users'),organizer));
    }
    if(b.action==='resolve'){if(!['pending','scheduled'].includes(t.status))fail('This topic cannot be resolved.');t.status='resolved';t.outcome=b.outcome||'';}
    res.json(put('topics',t));
  });
  app.get('/api/topics/:id/calendar',(req,res)=>{
    const t=get('topics',req.params.id);
    if(!t||t.status!=='scheduled')fail('Scheduled conversation not found.',404);
    const organizer=t.calendarOrganizer||organizerEmail(env,partner(get('users',t.authorId))?.email||req.user.email);
    res.set('Content-Disposition','attachment; filename="together-conversation.ics"');
    res.type('text/calendar').send(buildCalendar(calendarSnapshot(t,all('users'),organizer)));
  });
  app.post('/api/goals',(req,res)=>{const b=z.object({title:text(160),target:z.number().positive().max(1e10),current:money.default(0),unit:text(40).default('steps')}).parse(req.body);res.status(201).json(put('goals',{id:token(),...b}));});
  app.patch('/api/goals/:id',(req,res)=>{const g=get('goals',req.params.id);if(!g)fail('Goal not found.',404);g.current=money.parse(req.body.current);res.json(put('goals',g));});
  app.post('/api/agreements',(req,res)=>{res.status(201).json(put('agreements',{id:token(),text:text(2000).parse(req.body.text),acceptedBy:[req.user.id]}));});
  app.patch('/api/agreements/:id',(req,res)=>{const a=get('agreements',req.params.id);if(!a)fail('Agreement not found.',404);if(!a.acceptedBy.includes(req.user.id))a.acceptedBy.push(req.user.id);res.json(put('agreements',a));});
  app.post('/api/appreciations',(req,res)=>{
    const note=put('appreciations',{id:token(),authorId:req.user.id,text:text(2000).parse(req.body.text),createdAt:new Date().toISOString()});
    notify(partner(req.user)?.id,'appreciation','Your partner left a little note in Together.');
    res.status(201).json(note);
  });
  app.put('/api/mood',(req,res)=>{
    const energy=z.enum(['ready','quiet']).parse(req.body.energy);
    res.json(put('moods',{id:req.user.id,userId:req.user.id,energy,updatedAt:new Date().toISOString()}));
  });
  app.put('/api/finance',(req,res)=>{
    const b=z.object({month:monthSchema,revision:z.number().int().min(0),income:money,expenses:money,savings:money,contribution:z.enum(['proportional','equal']).default('proportional'),accounts:z.array(z.object({id:text(100),name:text(80),last4:z.string().regex(/^\d{4}$/),purpose:z.enum(['Household','Savings','Personal'])})).max(20),transfers:z.array(text(100)).max(100)}).parse(req.body);
    if(b.transfers.some(id=>!b.accounts.some(a=>a.id===id)))fail('Transfers must refer to a household account.');
    if(new Set(b.accounts.map(a=>a.id)).size!==b.accounts.length)fail('Each account must have a unique ID.');
    for(const purpose of ['Household','Savings'])if(b.accounts.filter(a=>a.purpose===purpose).length>1)fail(`Choose only one ${purpose.toLowerCase()} account per month.`);
    const f=financeFor(b.month);if(b.revision!==f.revision)fail('This monthly plan changed. Reload it and review the latest values before saving again.',409);f.revision++;Object.assign(f,{expenses:b.expenses,savings:b.savings,accounts:b.accounts,transfers:b.transfers,contribution:b.contribution});f.incomes[req.user.id]=b.income;res.json(put('finance',f));
  });
  app.post('/api/notifications/read',(req,res)=>{for(const n of all('notifications'))if(n.userId===req.user.id)put('notifications',{...n,read:true});res.json({ok:true});});
  app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  app.use((error,_req,res,_next)=>res.status(error instanceof z.ZodError?400:error.status||500).json({error:error instanceof z.ZodError?error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):error.status?error.message:'An unexpected server error occurred.'}));

  let working=false;
  async function runWorker(now=new Date()) {
    if(working)return;working=true;
    try {
      const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
      if(local.endsWith('-07'))for(const u of all('users'))notify(u.id,'monthly','It is the 7th. Review your monthly income, shared expenses, and savings in Together.',`monthly:${local.slice(0,7)}:${u.id}`);
      for(const topic of all('topics'))if(topic.status==='scheduled') {
        const start=Date.parse(`${topic.date}T${topic.time}:00+05:30`);
        if(start>now.getTime()&&start-now.getTime()<=3600000)for(const u of all('users'))
          notify(u.id,'discussion_reminder',`Your conversation is coming up at ${topic.time} on ${topic.date} (Asia/Kolkata). Open Together when you are ready.`,`discussion:${topic.id}:${start}:${u.id}`);
      }
      for(const o of all('outbox')) {
        if(!['pending','retry','not_configured'].includes(o.status)||o.nextAttempt>now.getTime())continue;
        const u=get('users',o.userId),n=get('notifications',o.notificationId),config=integration();
        if(n.calendar) {
          const topic=get('topics',n.calendar.topicId);
          if(!topic||topic.status!=='scheduled'||(topic.calendarSequence||0)!==n.calendar.sequence){put('outbox',{...o,status:'superseded'});continue;}
        }
        if(!config[o.channel].configured||(o.channel==='whatsapp'&&!u.whatsapp)){put('outbox',{...o,status:'not_configured',nextAttempt:now.getTime()+60000});continue;}
        try {
          if(o.channel==='email') {
            const transport=(options.createTransport||nodemailer.createTransport)({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_SECURE==='true',auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:10000});
            await transport.sendMail({from:env.SMTP_FROM,to:n.calendar?n.calendar.attendees:u.email,subject:'Together · a private update',text:n.title,html:renderNotificationEmail({title:n.title,type:n.type,appUrl:(env.APP_ORIGIN||'').split(',')[0].trim()}),...(n.calendar?{icalEvent:{filename:'together-conversation.ics',method:'REQUEST',content:buildCalendar(n.calendar)}}:{})});
          } else {
            const send=options.fetch || fetch;
            let response;
            if(evolutionReady()) {
              response=await send(`${env.EVOLUTION_API_URL.replace(/\/$/,'')}/message/sendText/${encodeURIComponent(env.EVOLUTION_INSTANCE)}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:env.EVOLUTION_API_KEY},body:JSON.stringify({number:digits(u.whatsapp),text:n.title}),signal:AbortSignal.timeout(10000)});
            } else {
              response=await send(`${env.OPENWA_BASE_URL.replace(/\/$/,'')}/api/sessions/${encodeURIComponent(env.OPENWA_SESSION_ID)}/messages/send-text`,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':env.OPENWA_API_KEY},body:JSON.stringify({chatId:digits(u.whatsapp)+'@c.us',text:n.title}),signal:AbortSignal.timeout(10000)});
            }
            if(!response.ok)throw new Error('Provider rejected delivery');
          }
          put('outbox',{...o,status:'accepted',attempts:o.attempts+1,acceptedAt:now.toISOString()});
        } catch {const attempts=o.attempts+1;put('outbox',{...o,status:attempts>=4?'failed':'retry',attempts,nextAttempt:now.getTime()+Math.min(3600000,60000*2**attempts)});}
      }
      for(const s of all('sessions'))if(s.expires<Date.now())del('sessions',s.id);
    } finally {working=false;}
  }
  return {app,store,db:store.db,runWorker,close:store.close};
}


