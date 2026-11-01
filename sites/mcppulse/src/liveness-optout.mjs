// https://glimind.com/opt-out documents this response protocol (2026-11-01).
// This request still consumes compute; only honored future opt-out saves requests.
export const MONITOR_UA='SentinelOracle/0.1 (+https://glimind.com/opt-out; liveness-only, never invokes tools)';
export function monitorOptOut(request){
 const u=new URL(request.url);
 if(u.hostname!=='mcppulse.agiscorecard.com'||u.pathname!=='/mcp'||!['GET','POST'].includes(request.method)||request.headers.get('User-Agent')!==MONITOR_UA)return null;
 return new Response(JSON.stringify({error:'monitor_opted_out',message:'The server operator declines SentinelOracle liveness monitoring. MCP remains available to other clients.'}),{status:403,headers:{'X-Sentinel-OptOut':'1','Cache-Control':'no-store','Vary':'User-Agent','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
}
