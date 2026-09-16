export type User={id:string;name:string;email:string;whatsapp:string};
export type Topic={id:string;authorId:string;title:string;description:string;category:string;priority?:'low'|'normal'|'urgent';status:string;date?:string;time?:string;duration?:number;outcome?:string;createdAt:string};
export type Goal={id:string;title:string;target:number;current:number;unit:string};
export type Agreement={id:string;text:string;acceptedBy:string[]};
export type Note={id:string;authorId:string;text:string;createdAt:string};
export type Notice={id:string;text?:string;message?:string;title?:string;read?:boolean;createdAt:string;emailStatus?:string;whatsappStatus?:string};
export type Account={id:string;name:string;last4:string;purpose:string};
export type Mood={id:string;userId:string;energy:'ready'|'quiet'|string;updatedAt:string};
export type Finance={month:string;revision?:number;contribution?:'proportional'|'equal'|string;incomes:Record<string,number>;expenses:number;savings:number;accounts:Account[];transfers:string[]};
export type State={user:User;partner:User|null;topics:Topic[];goals:Goal[];agreements:Agreement[];appreciations:Note[];moods:Mood[];notifications:Notice[];finance:Finance;integration:Record<string,unknown>};
export function weekendDates(){const dates:string[]=[];const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const now=new Date(today+'T12:00:00Z');for(let i=0;i<28;i++){const d=new Date(now);d.setUTCDate(d.getUTCDate()+i);if([0,6].includes(d.getUTCDay()))dates.push(d.toISOString().slice(0,10))}return dates;}
export const monthNow=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:'Asia/Kolkata'}).format(new Date()).replace('/','-');
export const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
export const niceDate=(s?:string)=>s?new Date(s+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',month:'short',day:'numeric'}):'Waiting for a time';
