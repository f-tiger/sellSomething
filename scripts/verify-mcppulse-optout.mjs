import assert from 'node:assert/strict';
import {MONITOR_UA} from '../sites/mcppulse/src/liveness-optout.mjs';
for(const[method,path,ua,status]of[['GET','/mcp',MONITOR_UA,403],['POST','/mcp',MONITOR_UA,403],['GET','/.well-known/mcp.json','FleetQuotaReadOnlyProbe/1.0',200]]){
 const r=await fetch('https://mcppulse.agiscorecard.com'+path,{method,headers:{'User-Agent':ua,'X-Probe':'1'},signal:AbortSignal.timeout(20000),redirect:'manual'});
 assert.equal(r.status,status);if(status===403){assert.equal(r.headers.get('X-Sentinel-OptOut'),'1');assert.equal(r.headers.get('cache-control'),'no-store');}else assert.equal(r.headers.has('X-Sentinel-OptOut'),false);
 await r.body?.cancel();
}
console.log('PASS: live opt-out and public discovery; no tools, scans, registration or business events');
