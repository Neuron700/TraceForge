import Papa from 'papaparse';
import { z } from 'zod';

export const severitySchema = z.enum(['debug','info','warning','error','critical']);
export type Severity = z.infer<typeof severitySchema>;
export type Event = { id:string; timestamp:string; originalTimestamp:string; service:string; eventType:string; severity:Severity; message:string; traceId?:string; spanId?:string; parentSpanId?:string; requestId?:string; durationMs?:number; attributes:Record<string,unknown>; source:string };
export type Finding = { id:string; title:string; description:string; classification:'observation'|'hypothesis'|'confirmed'; impact:Severity; confidence:'low'|'medium'|'high'; eventIds:string[]; nextChecks:string; createdAt:string };
export type Annotation = { id:string; eventId:string; text:string; createdAt:string };
export type Incident = { id:string; title:string; description:string; source:'synthetic'|'import'; createdAt:string; events:Event[]; findings:Finding[]; annotations:Annotation[] };
export type ImportResult = { events:Event[]; errors:string[]; total:number };

const aliases:Record<string,string[]> = {
  timestamp:['timestamp','time','ts','date','datetime'], service:['service','service_name','component','app'], eventType:['eventtype','event_type','type','kind'], severity:['severity','level','loglevel'], message:['message','msg','description','body'], traceId:['traceid','trace_id'], spanId:['spanid','span_id'], parentSpanId:['parentspanid','parent_span_id'], requestId:['requestid','request_id'], durationMs:['durationms','duration_ms','duration']
};
const key = (s:string) => s.toLowerCase().replace(/[^a-z0-9_]/g,'');
export function guessMapping(columns:string[]):Record<string,string>{ const result:Record<string,string>={}; for(const [field,names] of Object.entries(aliases)){const found=columns.find(c=>names.includes(key(c)));if(found) result[field]=found}return result }
export function normalize(row:Record<string,unknown>, index:number, mapping:Record<string,string>={}, source='import'):Event{
  const get=(field:string)=>row[mapping[field]||Object.keys(row).find(k=>aliases[field]?.includes(key(k)))||field];
  const raw=get('timestamp'); if(raw===undefined||raw===null||raw==='') throw new Error('timestamp is missing');
  const parsed=typeof raw==='number'?new Date(raw < 1e11?raw*1000:raw):new Date(String(raw)); if(Number.isNaN(parsed.getTime()))throw new Error('timestamp is invalid');
  const message=get('message');if(typeof message!=='string'||!message.trim())throw new Error('message is missing');
  const rawSeverity=String(get('severity')||'info').toLowerCase();const severity=rawSeverity==='warn'?'warning':rawSeverity==='fatal'?'critical':rawSeverity;
  if(!severitySchema.safeParse(severity).success)throw new Error(`unknown severity: ${rawSeverity}`);
  const duration=get('durationMs');const durationMs=duration===undefined||duration===''?undefined:Number(duration);
  if(durationMs!==undefined&&(!Number.isFinite(durationMs)||durationMs<0))throw new Error('duration must be nonnegative');
  const optional=(field:string)=>{const value=get(field);return value===undefined||value===null||value===''?undefined:String(value)};
  return {id:String(row.id||`${source}-${index}-${parsed.getTime()}`),timestamp:parsed.toISOString(),originalTimestamp:String(raw),service:String(get('service')||'unknown'),eventType:String(get('eventType')||'log'),severity:severity as Severity,message:message.trim(),traceId:optional('traceId'),spanId:optional('spanId'),parentSpanId:optional('parentSpanId'),requestId:optional('requestId'),durationMs,attributes:row.attributes&&typeof row.attributes==='object'&&!Array.isArray(row.attributes)?row.attributes as Record<string,unknown>:{},source};
}
export function parseData(text:string,format:'json'|'jsonl'|'csv',mapping:Record<string,string>={}):ImportResult{
  let rows:unknown[]=[];let parseErrors:string[]=[];
  try { if(format==='json'){const data=JSON.parse(text);if(!Array.isArray(data))throw new Error('Expected a JSON array');rows=data}
    else if(format==='jsonl'){rows=text.split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{try{return JSON.parse(line)}catch{return {__invalid:`Line ${i+1}: malformed JSON`}}})}
    else {const result=Papa.parse<Record<string,unknown>>(text,{header:true,skipEmptyLines:true});rows=result.data;parseErrors=result.errors.map(e=>`Row ${(e.row??0)+2}: ${e.message}`)}
  } catch(e){return {events:[],errors:[e instanceof Error?e.message:'Unable to parse file'],total:0}}
  const events:Event[]=[];const errors=[...parseErrors];rows.forEach((row,i)=>{try{if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('expected an object');if('__invalid' in row)throw new Error(String(row.__invalid));events.push(normalize(row as Record<string,unknown>,i,mapping))}catch(e){errors.push(`Row ${i+1}: ${e instanceof Error?e.message:'invalid record'}`)}});
  return {events:events.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)),errors,total:rows.length};
}
export type Filters={search:string; severity:string; service:string; type:string; from:string; to:string; sort:'asc'|'desc'};
export function filterEvents(events:Event[],f:Filters):Event[]{const query=f.search.trim().toLowerCase();return events.filter(e=>(!f.severity||e.severity===f.severity)&&(!f.service||e.service===f.service)&&(!f.type||e.eventType===f.type)&&(!f.from||e.timestamp>=new Date(f.from).toISOString())&&(!f.to||e.timestamp<=new Date(f.to).toISOString())&&(!query||[e.message,e.service,e.eventType,e.traceId,e.spanId,e.requestId,JSON.stringify(e.attributes)].some(x=>x?.toLowerCase().includes(query)))).sort((a,b)=>f.sort==='asc'?a.timestamp.localeCompare(b.timestamp):b.timestamp.localeCompare(a.timestamp))}
export type Link={source:string;target:string;label:string;inferred:boolean};
export function graphFor(events:Event[]):{nodes:{id:string;kind:'service'|'event';label:string;severity?:Severity}[];edges:Link[]}{
  const nodes=[...new Set(events.map(e=>e.service))].map(s=>({id:`service:${s}`,kind:'service' as const,label:s}));
  const edges:Link[]=[];const eventNodes=events.map(e=>({id:e.id,kind:'event' as const,label:e.message.length>36?`${e.message.slice(0,36)}…`:e.message,severity:e.severity}));
  for(const e of events){edges.push({source:`service:${e.service}`,target:e.id,label:'emitted',inferred:false});if(e.parentSpanId){const parent=events.find(p=>p.spanId===e.parentSpanId&&p.traceId===e.traceId);if(parent)edges.push({source:parent.id,target:e.id,label:'parent span',inferred:false})}else if(e.requestId){const prior=events.find(p=>p.id!==e.id&&p.requestId===e.requestId&&p.timestamp<e.timestamp);if(prior)edges.push({source:prior.id,target:e.id,label:'request ID',inferred:false})}}
  return {nodes:[...nodes,...eventNodes],edges};
}
export function analyze(events:Event[]):Finding[]{const findings:Finding[]=[];const errors=events.filter(e=>e.severity==='error'||e.severity==='critical');if(errors.length){findings.push({id:'rule-errors',title:`${errors.length} error events observed`,description:'Error or critical severity records appear in the dataset. Inspect their surrounding events and trace context.',classification:'observation',impact:errors.some(e=>e.severity==='critical')?'critical':'error',confidence:'high',eventIds:errors.map(e=>e.id),nextChecks:'Examine correlated requests and adjacent timestamps.',createdAt:new Date().toISOString()})}const slow=events.filter(e=>(e.durationMs||0)>=1000);if(slow.length)findings.push({id:'rule-latency',title:`${slow.length} slow operations`,description:'Operations with a recorded duration of at least 1000 ms were observed. Correlation alone does not establish a root cause.',classification:'observation',impact:'warning',confidence:'high',eventIds:slow.map(e=>e.id),nextChecks:'Compare upstream request duration with downstream service timing.',createdAt:new Date().toISOString()});return findings}
export function reportMarkdown(i:Incident){const times=i.events.map(e=>e.timestamp).sort();return `# ${i.title}\n\n${i.description}\n\n- Source: ${i.source}\n- Time range: ${times[0]||'N/A'} to ${times.at(-1)||'N/A'}\n- Events: ${i.events.length}\n- Services: ${[...new Set(i.events.map(e=>e.service))].join(', ')}\n\n## Important timeline\n${i.events.filter(e=>e.severity==='critical'||e.severity==='error'||e.severity==='warning').map(e=>`- ${e.timestamp} [${e.severity}] ${e.service}: ${e.message} (event: ${e.id})`).join('\n')||'- No warning or error records.'}\n\n## Findings and hypotheses\n${i.findings.map(f=>`### ${f.title}\nClassification: ${f.classification}; confidence: ${f.confidence}\n\n${f.description}\n\nEvidence: ${f.eventIds.join(', ')||'none'}\n\nNext checks: ${f.nextChecks}`).join('\n\n')||'No findings have been recorded.'}\n\n## Limitations\nThis report reflects only the imported or synthetic records. Temporal correlation does not prove causality. Hypotheses are not confirmed findings.\n`}
