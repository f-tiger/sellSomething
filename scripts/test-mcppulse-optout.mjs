import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../sites/mcppulse/src/worker.js';
import {MONITOR_UA,monitorOptOut} from '../sites/mcppulse/src/liveness-optout.mjs';
test('only the named monitor is refused before parsing or environment access',async()=>{
 for(const method of ['GET','POST']){
  const request=new Request('https://mcppulse.agiscorecard.com/mcp',{method,headers:{'User-Agent':MONITOR_UA},...(method==='POST'?{body:'not JSON'}:{})});
  const r=await worker.fetch(request,new Proxy({},{get(){throw Error('Unexpected data access')}}));
  assert.equal(r.status,403);assert.equal(r.headers.get('X-Sentinel-OptOut'),'1');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('vary'),'User-Agent');assert.equal(request.bodyUsed,false);
 }
});
test('other clients still initialize and list tools locally without scans or KV writes',async()=>{
 for(const method of ['initialize','tools/list']){
  const r=await worker.fetch(new Request('https://mcppulse.agiscorecard.com/mcp',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'FleetQuotaLocalProbe/1.0'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'local-fixture',version:'1'}}})}),new Proxy({},{get(){throw Error('Unexpected environment access')}}));
  assert.equal(r.status,200);assert.equal(r.headers.has('X-Sentinel-OptOut'),false);const body=await r.json();assert(body.result);assert(method==='initialize'?body.result.serverInfo:Array.isArray(body.result.tools));
 }
});
test('unknown hosts, pages, options and unrelated agents remain untouched',()=>{
 for(const url of ['https://example.com/mcp','https://mcppulse.agiscorecard.com/','https://mcppulse.agiscorecard.com/.well-known/mcp.json','https://mcppulse.agiscorecard.com/api/scan'])assert.equal(monitorOptOut(new Request(url,{headers:{'User-Agent':MONITOR_UA}})),null);
 for(const ua of ['','node','mcpbeat/0.1',MONITOR_UA+' extra'])assert.equal(monitorOptOut(new Request('https://mcppulse.agiscorecard.com/mcp',{headers:{'User-Agent':ua}})),null);
 assert.equal(monitorOptOut(new Request('https://mcppulse.agiscorecard.com/mcp',{method:'OPTIONS',headers:{'User-Agent':MONITOR_UA}})),null);
});
