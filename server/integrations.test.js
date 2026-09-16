import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {registerIntegrations} from './integrations.js';
test('provider setup hides secrets, verifies without sending, and preserves existing passwords',async t=>{
 const app=express();app.use(express.json());const env={},saved=[];let checks=0;
 registerIntegrations(app,env,{saveConfig:async p=>saved.push(p),createTransport:()=>({verify:async()=>{checks++},close(){}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}/api/integrations`;
 const email={host:'smtp.example.com',port:587,secure:false,user:'sender@example.com',password:'private-secret',from:'sender@example.com'};
 let r=await fetch(base+'/email',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(email)});assert.equal(r.status,200);
 const state=await fetch(base).then(r=>r.text());assert.ok(!state.includes('private-secret'));assert.equal(JSON.parse(state).email.hasPassword,true);
 r=await fetch(base+'/email/check',{method:'POST'});assert.equal(r.status,200);assert.equal(checks,1);
 await fetch(base+'/email',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...email,password:''})});assert.equal(env.SMTP_PASSWORD,'private-secret');assert.equal(saved.length,2);
});
