import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './app.js';
import http from 'node:http';

test('local first-run signup needs no hidden code but second member still needs an invite',async t=>{
 const s=createApp({database:':memory:',env:{ALLOW_LOCAL_SETUP:'true'}}),server=s.app.listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));s.close()});
 const base=`http://127.0.0.1:${server.address().port}`;
 const setup=await fetch(base+'/api/setup').then(r=>r.json());assert.equal(setup.localSetupAllowed,true);
 const input={name:'Local owner',email:' owner@example.com ',password:'long-enough-password',whatsapp:'+91 98765 43210'};
 const res=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(res.status,201);
 const body=await res.json();assert.equal(body.user.email,'owner@example.com');
 const second=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,email:'partner@example.com'})});assert.equal(second.status,403);
 assert.equal((await fetch(base+'/api/setup').then(r=>r.json())).localSetupAllowed,false);
});

test('public-host requests cannot use local first-run signup',async t=>{
 const s=createApp({database:':memory:',env:{ALLOW_LOCAL_SETUP:'true'}}),server=s.app.listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));s.close()});
 const body=await new Promise((resolve,reject)=>{http.get(`http://127.0.0.1:${server.address().port}/api/setup`,{headers:{Host:'public.example'}},r=>{let text='';r.on('data',chunk=>text+=chunk);r.on('end',()=>resolve(JSON.parse(text)))}).on('error',reject)});
 assert.equal(body.localSetupAllowed,false);
});
