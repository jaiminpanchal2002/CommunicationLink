import { createApp } from './app.js';
import express from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {loadEnvFile} from 'node:process';

if(existsSync('.env'))loadEnvFile('.env');

if(!process.env.SETUP_CODE) {
  if(process.env.NODE_ENV==='production')throw new Error('SETUP_CODE is required in production.');
  if(process.env.HOST&&!['127.0.0.1','localhost','::1'].includes(process.env.HOST))throw new Error('Set a private SETUP_CODE before listening outside loopback.');
  process.env.ALLOW_LOCAL_SETUP='true';
  console.log('Local setup ready: create the first account in your browser. Your partner joins with an invitation from Settings.');
}
process.env.DATABASE_PATH ||= './data/together.sqlite';
mkdirSync(dirname(resolve(process.env.DATABASE_PATH)),{recursive:true});
const service=createApp();
if(existsSync('dist/index.html')) { service.app.use(express.static('dist'));service.app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html'))); }
const server=service.app.listen(Number(process.env.PORT||3001),process.env.HOST||'127.0.0.1',()=>console.log('Together API listening.'));
const timer=setInterval(()=>service.runWorker().catch(()=>console.error('Notification worker failed.')),30000);timer.unref();
service.runWorker().catch(()=>console.error('Notification worker failed.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{service.close();process.exit(0);});});
